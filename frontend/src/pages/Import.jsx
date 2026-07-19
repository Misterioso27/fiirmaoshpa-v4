import { useState, useCallback } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, X, Play } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Spinner, Empty } from '@/components/ui'
import useAuthStore from '@/store/auth'

function safeFloat(v, def = 0) {
  try { return parseFloat(String(v || def).replace(/,/g, '').replace(/P\$|\$/g, '')) || def }
  catch { return def }
}

function cleanName(s) {
  if (!s) return ''
  s = String(s).trim()
  s = s.replace(/^\d+[NnOo°\.]*\s*/g, '')
  s = s.replace(/^\d+[a-zA-Z]*\.\s*/g, '')
  return s.replace(/\s+/g, ' ').trim() || String(s)
}

function isValidName(s) {
  s = String(s || '').trim()
  if (!s || s.length < 3) return false
  try { parseFloat(s.replace(/,/g, '').replace(/\./g, '')); return false } catch {}
  return true
}

function xlDate(serial) {
  try {
    const base = new Date(1899, 11, 30)
    base.setDate(base.getDate() + parseInt(serial))
    return base.toISOString().split('T')[0]
  } catch { return null }
}

async function parseExcel(file) {
  const arrayBuffer = await file.arrayBuffer()
  const uint8 = new Uint8Array(arrayBuffer)
  if (uint8[0] !== 0x50 || uint8[1] !== 0x4B) throw new Error('El archivo no es un Excel válido (.xlsx)')

  await new Promise((res, rej) => {
    if (window.JSZip) return res()
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
    s.onload = res; s.onerror = rej
    document.head.appendChild(s)
  })

  const zip    = await window.JSZip.loadAsync(arrayBuffer)
  const parser = new DOMParser()

  const strings = []
  const ssFile = zip.file('xl/sharedStrings.xml')
  if (ssFile) {
    const ssXml = await ssFile.async('text')
    const ssDoc = parser.parseFromString(ssXml, 'application/xml')
    ssDoc.querySelectorAll('si').forEach(si => {
      strings.push(Array.from(si.querySelectorAll('t')).map(t => t.textContent || '').join(''))
    })
  }

  const loans = []
  const freqMap = { QUICENAL: 'biweekly', QUINCENAL: 'biweekly', SEMANAL: 'weekly', MENSUAL: 'monthly' }
  const sheetFiles = Object.keys(zip.files).filter(n => n.match(/xl\/worksheets\/sheet\d+\.xml/))

  for (const sheetPath of sheetFiles) {
    const sheetFile = zip.file(sheetPath)
    if (!sheetFile) continue
    const sheetXml = await sheetFile.async('text')
    const sheetDoc = parser.parseFromString(sheetXml, 'application/xml')
    const rows     = Array.from(sheetDoc.querySelectorAll('row'))

    for (let ri = 1; ri < rows.length; ri++) {
      // Mapear celdas por su columna real (atributo r, ej. "B5") — Excel omite celdas vacías,
      // así que el índice posicional del array se desalinea. Este era el fallo silencioso.
      const cellMap = {}
      Array.from(rows[ri].querySelectorAll('c')).forEach(c => {
        const ref = c.getAttribute('r') || ''
        const letters = ref.replace(/[0-9]/g, '')
        let n = 0
        for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
        cellMap[n - 1] = c
      })
      const getVal = (idx) => {
        const c = cellMap[idx]
        if (!c) return null
        const t = c.getAttribute('t') || ''
        const v = c.querySelector('v')
        if (!v || !v.textContent) return null
        return t === 's' ? (strings[parseInt(v.textContent)] || '') : v.textContent
      }

      const idc     = String(getVal(0) || '').trim()
      const cliente = String(getVal(2) || '').trim()
      if (!idc || idc === 'IDC' || !isValidName(cliente)) continue

      const fechaRaw = getVal(1)
      const fecha    = fechaRaw && !isNaN(parseFloat(fechaRaw))
        ? xlDate(fechaRaw) : '2024-01-01'

      const metodo   = String(getVal(3) || 'QUICENAL').trim().toUpperCase()
      const cuotasV  = safeFloat(getVal(4), 5)
      const monto    = safeFloat(getVal(5), 0)
      const tasaRaw  = safeFloat(getVal(6), 0.3)
      const tasa     = tasaRaw < 2 ? tasaRaw * 100 : tasaRaw
      const interes  = safeFloat(getVal(7), 0)
      const total    = safeFloat(getVal(8), 0)
      const retornado    = safeFloat(getVal(9), 0)
      const capRestante  = safeFloat(getVal(13), 0)
      const obs      = String(getVal(15) || '')
      const saldado  = obs.toUpperCase() === 'SALDADO' || capRestante === 0

      if (monto < 100 || cuotasV > 100) continue

      const nombreLimpio = cleanName(cliente)
      const partes       = nombreLimpio.split(' ')

      loans.push({
        idc, fecha,
        first_name: partes[0] || nombreLimpio,
        last_name:  partes.slice(1).join(' ') || 'Histórico HPA',
        full_name:  nombreLimpio,
        frecuencia: freqMap[metodo] || 'biweekly',
        cuotas:     Math.round(cuotasV),
        monto, tasa: Math.round(tasa * 10) / 10,
        interes, total: total > 0 ? total : monto + interes,
        retornado, cap_restante: capRestante,
        status: saldado ? 'paid' : 'active', obs,
      })
    }
  }

  const seen = new Set()
  return loans.filter(l => {
    const key = `${l.full_name}|${l.fecha}|${l.monto}`
    if (seen.has(key)) return false
    seen.add(key); return true
  })
}

async function importToSupabase(loans, companyId, branchId, userId, onProgress) {
  const results = { created: 0, skipped: 0, errors: [] }

  for (let i = 0; i < loans.length; i++) {
    const loan = loans[i]
    onProgress(Math.round((i / loans.length) * 100), loan.full_name)

    try {
      const { data: existing } = await supabase
        .from('clients').select('id')
        .eq('company_id', companyId)
        .ilike('first_name', loan.first_name)
        .ilike('last_name', loan.last_name)
        .limit(1)

      let clientId
      if (existing && existing.length > 0) {
        clientId = existing[0].id
      } else {
        const { count } = await supabase
          .from('clients').select('*', { count: 'exact', head: true })
          .eq('company_id', companyId)
        const { data: nc, error: ce } = await supabase.from('clients').insert({
          company_id: companyId, branch_id: branchId,
          client_code: `HPA-C-${String((count || 0) + 1).padStart(4, '0')}`,
          type: 'person', status: 'active',
          first_name: loan.first_name, last_name: loan.last_name,
          nationality: 'DO', kyc_status: 'basic', kyc_level: 1,
          risk_level: 'medium', assigned_to: userId, created_by: userId,
        }).select('id').single()
        if (ce) throw new Error('Cliente: ' + ce.message)
        clientId = nc.id
      }

      const { data: loanExist } = await supabase.from('loans').select('id')
        .eq('company_id', companyId).eq('client_id', clientId)
        .eq('disbursed_at', loan.fecha).eq('principal', loan.monto).limit(1)

      if (loanExist && loanExist.length > 0) { results.skipped++; continue }

      const { count: lc } = await supabase.from('loans')
        .select('*', { count: 'exact', head: true }).eq('company_id', companyId)
      const loanCode   = `HPA-L-${String((lc || 0) + 1).padStart(4, '0')}`
      const totalPagar = loan.total > 0 ? loan.total : loan.monto + loan.interes
      const montoCuota = Math.round((totalPagar / loan.cuotas) * 100) / 100
      const diasPeriodo = loan.frecuencia === 'weekly' ? 7 : loan.frecuencia === 'biweekly' ? 15 : 30
      const fechaBase   = new Date(loan.fecha)
      const primerPago  = new Date(fechaBase)
      if (loan.frecuencia === 'monthly') primerPago.setMonth(primerPago.getMonth() + 1)
      else primerPago.setDate(primerPago.getDate() + diasPeriodo)
      const ultimoPago  = new Date(fechaBase)
      if (loan.frecuencia === 'monthly') ultimoPago.setMonth(ultimoPago.getMonth() + loan.cuotas)
      else ultimoPago.setDate(ultimoPago.getDate() + diasPeriodo * loan.cuotas)

      const { data: ld, error: le } = await supabase.from('loans').insert({
        company_id: companyId, branch_id: branchId, client_id: clientId,
        loan_code: loanCode, type: 'personal', currency: 'DOP',
        principal: loan.monto, rate_monthly: loan.tasa, rate_annual: loan.tasa * 12,
        term_months: loan.frecuencia === 'biweekly' ? loan.cuotas / 2 : loan.cuotas,
        payment_amount: montoCuota, total_interest: loan.interes,
        total_amount: totalPagar, origination_fee: 0,
        balance_principal: loan.cap_restante, balance_interest: 0,
        balance_penalties: 0, balance_total: loan.cap_restante,
        status: loan.status, days_overdue: 0,
        disbursed_at: loan.fecha,
        first_payment_date: primerPago.toISOString().split('T')[0],
        last_payment_date:  ultimoPago.toISOString().split('T')[0],
        next_payment_date:  loan.status === 'paid' ? null : primerPago.toISOString().split('T')[0],
        disbursed_by: userId,
        ai_analysis: {
          frequency: loan.frecuencia, rate_monthly: loan.tasa,
          total_periods: loan.cuotas, cuota_individual: montoCuota,
          total_interes: loan.interes, total_pagar: totalPagar,
          importado_historico: true, idc_original: loan.idc,
        }
      }).select('id').single()
      if (le) throw new Error('Préstamo: ' + le.message)

      if (loan.status === 'active') {
        await supabase.from('collection_cases').insert({
          company_id: companyId, branch_id: branchId,
          client_id: clientId, loan_id: ld.id,
          stage: 'preventive', status: 'open',
          days_overdue: 0, amount_overdue: 0, installments_due: 0,
        })
      }

      results.created++
    } catch (err) {
      results.errors.push({ name: loan.full_name, error: err.message })
    }
  }
  return results
}

const FREQ_LABELS = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }

export default function Import() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id || 'a0000000-0000-4000-8000-000000000001'
  const branchId  = user?.branch?.id  || 'b0000000-0000-4000-8000-000000000001'

  const [file, setFile]           = useState(null)
  const [parsing, setParsing]     = useState(false)
  const [preview, setPreview]     = useState([])
  const [importing, setImporting] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [currentName, setCurrentName] = useState('')
  const [results, setResults]     = useState(null)
  const [error, setError]         = useState('')

  const handleFile = useCallback(async (f) => {
    if (!f) return
    setFile(f); setPreview([]); setResults(null); setError('')
    setParsing(true)
    try {
      const loans = await parseExcel(f)
      if (!loans.length) {
        setError('El archivo se leyó correctamente pero no se detectaron préstamos válidos. Verifica que las columnas sigan el orden esperado: A=IDC, B=Fecha, C=Cliente, D=Método, E=Cuotas, F=Monto, G=Tasa, H=Interés, I=Total, J=Retornado, N=Cap. Restante, P=Observaciones.')
      }
      setPreview(loans)
    } catch (err) { setError('Error al leer el archivo: ' + err.message) }
    setParsing(false)
  }, [])

  async function runImport() {
    if (!preview.length) return
    setImporting(true); setProgress(0); setResults(null)
    try {
      const res = await importToSupabase(
        preview, companyId, branchId, user.id,
        (pct, name) => { setProgress(pct); setCurrentName(name) }
      )
      setResults(res)
    } catch (err) { setError('Error: ' + err.message) }
    setImporting(false)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-hpa-slate-9">Importar Cartera Histórica</h2>
        <p className="text-xs text-hpa-slate-5 mt-0.5">Importa clientes y préstamos históricos desde Excel (.xlsx)</p>
      </div>

      {!preview.length && !importing && !results && (
        <div className="card">
          <label className={`block border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
            file ? 'border-hpa-700 bg-hpa-700/5' : 'border-hpa-slate-3 hover:border-hpa-slate-4'
          }`}>
            <input type="file" className="hidden" accept=".xlsx,.xls"
              onChange={e => handleFile(e.target.files[0])} />
            {parsing ? (
              <div className="flex flex-col items-center gap-3">
                <Spinner size={32} />
                <p className="text-sm text-hpa-slate-6">Leyendo archivo...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <FileSpreadsheet size={48} className="text-hpa-slate-4" />
                <div>
                  <p className="text-sm font-semibold text-hpa-slate-8">
                    {file ? file.name : 'Arrastra tu Excel aquí o haz click para seleccionar'}
                  </p>
                  <p className="text-xs text-hpa-slate-5 mt-1">Formato: .xlsx — Cartera histórica de préstamos</p>
                </div>
              </div>
            )}
          </label>
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex gap-2">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />{error}
            </div>
          )}
          <div className="mt-6 p-4 bg-hpa-slate-1 rounded-xl border border-hpa-slate-2">
            <p className="text-xs font-semibold text-hpa-slate-7 mb-3">¿Qué importa el sistema?</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-hpa-slate-6 text-center">
              {[['👤','Clientes','Crea perfil si no existe'],['💳','Préstamos','Con montos y fechas'],['📊','Estados','Activos y saldados'],['📞','Cobranza','Casos para activos']].map(([icon, label, desc]) => (
                <div key={label}><p className="text-2xl mb-1">{icon}</p><p className="font-semibold">{label}</p><p className="text-hpa-slate-4">{desc}</p></div>
              ))}
            </div>
          </div>
        </div>
      )}

      {preview.length > 0 && !importing && !results && (
        <div className="space-y-4">
          <div className="card p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-hpa-slate-9">{preview.length} préstamos detectados</p>
              <p className="text-xs text-hpa-slate-5 mt-0.5">Revisa la lista antes de confirmar</p>
            </div>
            <div className="flex gap-3">
              <button className="btn btn-ghost btn-sm" onClick={() => { setPreview([]); setFile(null) }}>
                <X size={13} /> Cancelar
              </button>
              <button className="btn btn-primary" onClick={runImport}>
                <Play size={13} /> Importar Ahora
              </button>
            </div>
          </div>
          <div className="card p-0 overflow-hidden">
            <div className="table-wrapper max-h-[500px] overflow-y-auto">
              <table className="table text-xs">
                <thead>
                  <tr><th>#</th><th>Cliente</th><th>Fecha</th><th>Monto</th><th>Tasa</th><th>Cuotas</th><th>Frecuencia</th><th>Cap. Restante</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {preview.map((l, i) => (
                    <tr key={i}>
                      <td className="font-mono text-hpa-slate-5">{l.idc}</td>
                      <td className="font-semibold">{l.full_name}</td>
                      <td className="text-hpa-slate-5">{l.fecha}</td>
                      <td className="font-numeric font-semibold">RD$ {l.monto.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="text-hpa-700 font-semibold">{l.tasa}%</td>
                      <td className="text-center">{l.cuotas}</td>
                      <td>{FREQ_LABELS[l.frecuencia] || l.frecuencia}</td>
                      <td className="font-numeric">{l.cap_restante > 0 ? `RD$ ${l.cap_restante.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}</td>
                      <td><span className={`badge ${l.status === 'paid' ? 'badge-green' : 'badge-blue'}`}>{l.status === 'paid' ? 'SALDADO' : 'ACTIVO'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {importing && (
        <div className="card text-center py-10 space-y-4">
          <Spinner size={36} className="mx-auto" />
          <div>
            <p className="font-semibold text-hpa-slate-9">Importando cartera histórica...</p>
            <p className="text-xs text-hpa-slate-5 mt-1">{currentName}</p>
          </div>
          <div className="max-w-sm mx-auto">
            <div className="h-2 bg-hpa-slate-2 rounded-full overflow-hidden">
              <div className="h-full bg-hpa-700 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-hpa-slate-5 mt-1">{progress}%</p>
          </div>
        </div>
      )}

      {results && (
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={24} className="text-emerald-500" />
            <div>
              <p className="font-bold text-hpa-slate-9">Importación completada</p>
              <p className="text-xs text-hpa-slate-5">La cartera histórica fue procesada exitosamente</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
              <p className="text-2xl font-bold text-emerald-700">{results.created}</p>
              <p className="text-xs text-emerald-600">Préstamos creados</p>
            </div>
            <div className="p-4 bg-hpa-slate-1 border border-hpa-slate-2 rounded-xl text-center">
              <p className="text-2xl font-bold text-hpa-slate-6">{results.skipped}</p>
              <p className="text-xs text-hpa-slate-5">Ya existían</p>
            </div>
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-center">
              <p className="text-2xl font-bold text-red-600">{results.errors.length}</p>
              <p className="text-xs text-red-500">Con errores</p>
            </div>
          </div>
          {results.errors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-xs font-semibold text-red-700 mb-2">Registros con error:</p>
              {results.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600">• {e.name}: {e.error}</p>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <button className="btn btn-primary" onClick={() => window.location.href = '/loans'}>Ver Préstamos</button>
            <button className="btn btn-ghost" onClick={() => { setResults(null); setPreview([]); setFile(null) }}>Importar otro</button>
          </div>
        </div>
      )}
    </div>
  )
}
