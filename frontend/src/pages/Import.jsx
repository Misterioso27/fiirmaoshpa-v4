import { useState, useCallback, useRef } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, X, Play, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Spinner, Empty } from '@/components/ui'
import useAuthStore from '@/store/auth'

// ─── Helpers ─────────────────────────────────────────────────
function safeFloat(v, def = 0) {
  if (v === null || v === undefined) return def
  try {
    const s = String(v).replace(/,/g, '').replace(/P\$|\$/g, '').trim()
    if (s === '' || s === '·') return def
    const n = parseFloat(s)
    return isNaN(n) ? def : n
  } catch { return def }
}

function isNumeric(v) {
  if (v === null || v === undefined) return false
  const s = String(v).replace(/,/g, '').replace(/P\$|\$/g, '').trim()
  if (s === '') return false
  return !isNaN(parseFloat(s))
}

function cleanName(s) {
  if (!s) return ''
  s = String(s).trim()
  s = s.replace(/^\d+[NnOo°\.]*\s*/g, '')
  s = s.replace(/^\d+[a-zA-Z]*\.\s*/g, '')
  return s.replace(/\s+/g, ' ').trim()
}

function xlDate(serial) {
  try {
    const base = new Date(1899, 11, 30)
    base.setDate(base.getDate() + parseInt(serial))
    return base.toISOString().split('T')[0]
  } catch { return null }
}

// Hojas que nunca son histórico de préstamos — se descartan automáticamente
const DISCARD_KEYWORDS = ['DASHBOAR', 'CALCULADORA', 'GASTOS', 'COBRO', 'TAX DE CAMBIO', 'TAXA DE CAMBIO', 'RECOLOCAR', 'PLANILHA', 'AMORTIZACION', 'AMORTIZAÇÃO']

// Pistas de encabezado que identifican una hoja de préstamos
const LOAN_HEADER_HINTS = ['IDC', 'FECHA', 'NOMBRE', 'MONTO PRESTADO', 'CAPI']

function colLetterToIndex(ref) {
  const letters = ref.replace(/[0-9]/g, '')
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

// ─── Parser principal: multi-hoja, detecta tipo, reconstruye cronología ────
async function parseExcel(file, onSheetProgress) {
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

  // shared strings
  const strings = []
  const ssFile = zip.file('xl/sharedStrings.xml')
  if (ssFile) {
    const ssXml = await ssFile.async('text')
    const ssDoc = parser.parseFromString(ssXml, 'application/xml')
    ssDoc.querySelectorAll('si').forEach(si => {
      strings.push(Array.from(si.querySelectorAll('t')).map(t => t.textContent || '').join(''))
    })
  }

  // nombres reales de las hojas (xl/workbook.xml + relaciones)
  const sheetNames = {} // sheetN.xml -> nombre visible
  const wbFile = zip.file('xl/workbook.xml')
  const relsFile = zip.file('xl/_rels/workbook.xml.rels')
  if (wbFile && relsFile) {
    const wbXml = await wbFile.async('text')
    const relsXml = await relsFile.async('text')
    const wbDoc = parser.parseFromString(wbXml, 'application/xml')
    const relsDoc = parser.parseFromString(relsXml, 'application/xml')
    const ridToTarget = {}
    relsDoc.querySelectorAll('Relationship').forEach(r => {
      ridToTarget[r.getAttribute('Id')] = r.getAttribute('Target')
    })
    wbDoc.querySelectorAll('sheet').forEach(sh => {
      const rid = sh.getAttribute('r:id') || sh.getAttribute('r:Id')
      const target = ridToTarget[rid]
      if (target) {
        const fileName = target.split('/').pop()
        sheetNames['xl/worksheets/' + fileName] = sh.getAttribute('name') || fileName
      }
    })
  }

  const sheetFiles = Object.keys(zip.files).filter(n => n.match(/xl\/worksheets\/sheet\d+\.xml/))
  const allLoans = []
  const sheetsReport = { discarded: [], noHeader: [], processed: [] }

  for (const sheetPath of sheetFiles) {
    const sheetName = sheetNames[sheetPath] || sheetPath
    if (onSheetProgress) onSheetProgress(sheetName)

    const upperName = sheetName.toUpperCase()
    if (DISCARD_KEYWORDS.some(k => upperName.includes(k))) {
      sheetsReport.discarded.push(sheetName)
      continue
    }

    const sheetFile = zip.file(sheetPath)
    if (!sheetFile) continue
    const sheetXml = await sheetFile.async('text')
    const sheetDoc = parser.parseFromString(sheetXml, 'application/xml')
    const rowEls   = Array.from(sheetDoc.querySelectorAll('row'))

    // extraer valores de una fila respetando la columna real (evita desalineación por celdas vacías)
    function rowValues(rowEl) {
      const cellMap = {}
      Array.from(rowEl.querySelectorAll('c')).forEach(c => {
        const ref = c.getAttribute('r') || ''
        cellMap[colLetterToIndex(ref)] = c
      })
      const maxIdx = Math.max(-1, ...Object.keys(cellMap).map(Number))
      const vals = []
      for (let i = 0; i <= maxIdx; i++) {
        const c = cellMap[i]
        if (!c) { vals.push(null); continue }
        const t = c.getAttribute('t') || ''
        const v = c.querySelector('v')
        if (!v || !v.textContent) { vals.push(null); continue }
        vals.push(t === 's' ? (strings[parseInt(v.textContent)] || '') : v.textContent)
      }
      return vals
    }

    // localizar fila de encabezado real (dentro de las primeras 5 filas)
    let headerRowIdx = -1
    let colMap = {}
    for (let i = 0; i < Math.min(5, rowEls.length); i++) {
      const vals = rowValues(rowEls[i]).map(v => (v ? String(v).toUpperCase().trim() : ''))
      const hits = LOAN_HEADER_HINTS.filter(hint => vals.some(c => c.includes(hint))).length
      if (hits >= 3) {
        headerRowIdx = i
        vals.forEach((c, j) => {
          if (c.includes('IDC') && colMap.idc === undefined) colMap.idc = j
          else if (c.includes('FECHA') && colMap.fecha === undefined) colMap.fecha = j
          else if (c.startsWith('NOMBRE') && colMap.nombre === undefined) colMap.nombre = j
          else if (c.includes('METODO') && colMap.metodo === undefined) colMap.metodo = j
          else if (c === 'CUOTAS' && colMap.cuotas === undefined) colMap.cuotas = j
          else if (c.includes('MONTO PRESTADO') && colMap.monto === undefined) colMap.monto = j
          else if (c === 'INTERES' && colMap.interes === undefined) colMap.interes = j
          else if (c.includes('CAPI') && c.includes('INTERES') && colMap.capinteres === undefined) colMap.capinteres = j
          else if (c.includes('MULTA') && colMap.multa === undefined) colMap.multa = j
          else if (c === 'PAGOS' && colMap.pagos === undefined) colMap.pagos = j
          else if ((c.includes('ESTATUS') || c === 'STATUS') && colMap.estatus === undefined) colMap.estatus = j
          else if (c.includes('OBSERVA') && colMap.obs === undefined) colMap.obs = j
        })
        break
      }
    }

    if (headerRowIdx === -1) {
      sheetsReport.noHeader.push(sheetName)
      continue
    }

    // agrupar filas por préstamo (fila con IDC + nombre válido abre uno nuevo)
    const loansInSheet = []
    let current = null

    for (let i = headerRowIdx + 1; i < rowEls.length; i++) {
      const row = rowValues(rowEls[i])
      const idcVal    = colMap.idc !== undefined ? row[colMap.idc] : null
      const nombreVal = colMap.nombre !== undefined ? row[colMap.nombre] : null
      const fechaVal  = colMap.fecha !== undefined ? row[colMap.fecha] : null

      const idcStr    = idcVal ? String(idcVal).trim() : ''
      const nombreStr = nombreVal && !isNumeric(nombreVal) ? cleanName(nombreVal) : ''
      const isNewLoanRow = idcStr && idcStr !== 'IDC' && idcStr !== '·' && nombreStr && nombreStr.length >= 3

      if (isNewLoanRow) {
        if (current && current.movimientos.length > 0) loansInSheet.push(current)
        const monto   = colMap.monto !== undefined ? safeFloat(row[colMap.monto]) : 0
        const interes = colMap.interes !== undefined ? safeFloat(row[colMap.interes]) : 0
        const cuotas  = colMap.cuotas !== undefined ? safeFloat(row[colMap.cuotas]) : 0
        const metodoRaw = colMap.metodo !== undefined && row[colMap.metodo] ? String(row[colMap.metodo]).trim().toUpperCase() : 'QUINCENAL'
        const freqMap = { QUICENAL: 'biweekly', QUINCENAL: 'biweekly', SEMANAL: 'weekly', MENSUAL: 'monthly' }
        current = {
          idc: idcStr,
          cliente: nombreStr,
          hoja_origen: sheetName,
          fecha_desembolso: fechaVal && isNumeric(fechaVal) ? xlDate(fechaVal) : null,
          monto_original: monto,
          interes_total: interes,
          cuotas_pactadas: Math.round(cuotas) || 1,
          frecuencia: freqMap[metodoRaw] || 'biweekly',
          movimientos: [],
        }
      }

      if (current && fechaVal && isNumeric(fechaVal)) {
        current.movimientos.push({
          fecha: xlDate(fechaVal),
          cap_interes: colMap.capinteres !== undefined ? safeFloat(row[colMap.capinteres]) : 0,
          pago: colMap.pagos !== undefined ? safeFloat(row[colMap.pagos]) : 0,
          estatus: colMap.estatus !== undefined && row[colMap.estatus] ? String(row[colMap.estatus]).trim() : '',
          obs: colMap.obs !== undefined && row[colMap.obs] ? String(row[colMap.obs]).trim() : '',
        })
      }
    }
    if (current && current.movimientos.length > 0) loansInSheet.push(current)

    if (loansInSheet.length > 0) {
      sheetsReport.processed.push({ sheet: sheetName, count: loansInSheet.length })
      allLoans.push(...loansInSheet)
    } else {
      sheetsReport.noHeader.push(sheetName)
    }
  }

  // enriquecer cada préstamo con totales derivados de sus movimientos
  const enriched = allLoans.map(l => {
    const movs = l.movimientos
    const totalPagado   = movs.reduce((s, m) => s + (m.pago > 0 ? m.pago : 0), 0)
    const ultimoMov     = movs[movs.length - 1]
    const capRestante   = ultimoMov ? Math.max(0, ultimoMov.cap_interes) : l.monto_original + l.interes_total
    const totalPactado  = l.monto_original + l.interes_total
    const textoEstatus  = movs.map(m => (m.estatus + ' ' + m.obs).toUpperCase()).join(' ')
    const saldado = capRestante <= 0 || /SALDO|SALDADO/.test(textoEstatus)
    const primerNombre = l.cliente.split(' ')[0] || l.cliente
    const apellidos     = l.cliente.split(' ').slice(1).join(' ') || 'Histórico HPA'

    return {
      ...l,
      first_name: primerNombre,
      last_name: apellidos,
      total_pactado: totalPactado,
      total_pagado: totalPagado,
      cap_restante: capRestante,
      status: saldado ? 'paid' : 'active',
      num_movimientos: movs.length,
    }
  })

  // deduplicar por cliente + fecha desembolso + monto (mismo préstamo detectado 2 veces)
  const seen = new Set()
  const deduped = enriched.filter(l => {
    const key = `${l.cliente}|${l.fecha_desembolso}|${l.monto_original}`
    if (seen.has(key)) return false
    seen.add(key); return true
  })

  return { loans: deduped, report: sheetsReport }
}

// ─── Importación a Supabase ─────────────────────────────────
async function importToSupabase(loans, companyId, branchId, userId, onProgress) {
  const results = { created: 0, skipped: 0, errors: [] }

  for (let i = 0; i < loans.length; i++) {
    const loan = loans[i]
    onProgress(Math.round((i / loans.length) * 100), loan.cliente)

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
        .eq('disbursed_at', loan.fecha_desembolso).eq('principal', loan.monto_original).limit(1)

      if (loanExist && loanExist.length > 0) { results.skipped++; continue }

      const { count: lc } = await supabase.from('loans')
        .select('*', { count: 'exact', head: true }).eq('company_id', companyId)
      const loanCode = `HPA-L-${String((lc || 0) + 1).padStart(4, '0')}`
      const montoCuota = loan.cuotas_pactadas > 0
        ? Math.round((loan.total_pactado / loan.cuotas_pactadas) * 100) / 100 : 0
      const diasPeriodo = loan.frecuencia === 'weekly' ? 7 : loan.frecuencia === 'biweekly' ? 15 : 30
      const fechaBase  = new Date(loan.fecha_desembolso)
      const primerPago = new Date(fechaBase)
      if (loan.frecuencia === 'monthly') primerPago.setMonth(primerPago.getMonth() + 1)
      else primerPago.setDate(primerPago.getDate() + diasPeriodo)
      const ultimoPago = new Date(fechaBase)
      if (loan.frecuencia === 'monthly') ultimoPago.setMonth(ultimoPago.getMonth() + loan.cuotas_pactadas)
      else ultimoPago.setDate(ultimoPago.getDate() + diasPeriodo * loan.cuotas_pactadas)

      const rateMonthly = loan.monto_original > 0
        ? Math.round((loan.interes_total / loan.monto_original) * 1000) / 10 : 0

      const { data: ld, error: le } = await supabase.from('loans').insert({
        company_id: companyId, branch_id: branchId, client_id: clientId,
        loan_code: loanCode, type: 'personal', currency: 'DOP',
        principal: loan.monto_original, rate_monthly: rateMonthly, rate_annual: rateMonthly * 12,
        term_months: loan.frecuencia === 'biweekly' ? loan.cuotas_pactadas / 2 : loan.cuotas_pactadas,
        payment_amount: montoCuota, total_interest: loan.interes_total,
        total_amount: loan.total_pactado, origination_fee: 0,
        balance_principal: loan.cap_restante, balance_interest: 0,
        balance_penalties: 0, balance_total: loan.cap_restante,
        status: loan.status, days_overdue: 0,
        disbursed_at: loan.fecha_desembolso,
        first_payment_date: primerPago.toISOString().split('T')[0],
        last_payment_date:  ultimoPago.toISOString().split('T')[0],
        next_payment_date:  loan.status === 'paid' ? null : primerPago.toISOString().split('T')[0],
        disbursed_by: userId,
        ai_analysis: {
          frequency: loan.frecuencia, rate_monthly: rateMonthly,
          total_periods: loan.cuotas_pactadas, cuota_individual: montoCuota,
          total_interes: loan.interes_total, total_pagar: loan.total_pactado,
          total_pagado_historico: loan.total_pagado,
          importado_historico: true, idc_original: loan.idc,
          hoja_origen: loan.hoja_origen, movimientos_historicos: loan.movimientos,
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
      results.errors.push({ name: loan.cliente, error: err.message })
    }
  }
  return results
}

const FREQ_LABELS = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }

export default function Import() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id || 'a0000000-0000-4000-8000-000000000001'
  const branchId  = user?.branch?.id  || 'b0000000-0000-4000-8000-000000000001'

  const fileInputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile]           = useState(null)
  const [parsing, setParsing]     = useState(false)
  const [scanningSheet, setScanningSheet] = useState('')
  const [preview, setPreview]     = useState([])
  const [report, setReport]       = useState(null)
  const [showReport, setShowReport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [currentName, setCurrentName] = useState('')
  const [results, setResults]     = useState(null)
  const [error, setError]         = useState('')

  const handleFile = useCallback(async (f) => {
    if (!f) return
    setFile(f); setPreview([]); setResults(null); setError(''); setReport(null)
    setParsing(true)
    try {
      const { loans, report } = await parseExcel(f, (sheetName) => setScanningSheet(sheetName))
      setReport(report)
      if (!loans.length) {
        const totalHojas = report.discarded.length + report.noHeader.length + report.processed.length
        setError(
          `El archivo tiene ${totalHojas} hoja(s). Se descartaron ${report.discarded.length} por ser cálculo/operativas, ` +
          `y ${report.noHeader.length} no tenían el patrón de encabezado esperado (IDC, FECHA, NOMBRES...). ` +
          `Ninguna hoja produjo préstamos válidos. Revisa el detalle abajo o el nombre de tus columnas.`
        )
      }
      setPreview(loans)
    } catch (err) { setError('Error al leer el archivo: ' + err.message) }
    setParsing(false)
    setScanningSheet('')
  }, [])

  function triggerFilePicker() {
    fileInputRef.current?.click()
  }

  function onDragOver(e) { e.preventDefault(); setDragOver(true) }
  function onDragLeave(e) { e.preventDefault(); setDragOver(false) }
  function onDrop(e) {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  async function runImport() {
    setImporting(true)
    try {
      const res = await importToSupabase(preview, companyId, branchId, user?.id, (p, name) => {
        setProgress(p); setCurrentName(name)
      })
      setResults(res)
    } catch (err) { setError('Error: ' + err.message) }
    setImporting(false)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-hpa-slate-9">Importar Cartera Histórica</h2>
        <p className="text-xs text-hpa-slate-5 mt-0.5">Lee todas las hojas de tu Excel, detecta préstamos automáticamente y reconstruye el historial de cada cliente</p>
      </div>

      {!preview.length && !importing && !results && (
        <div className="card">
          <div
            onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            className={`block border-2 border-dashed rounded-xl p-10 text-center transition-all ${
              dragOver ? 'border-hpa-700 bg-hpa-700/10' : file ? 'border-hpa-700 bg-hpa-700/5' : 'border-hpa-slate-3 hover:border-hpa-slate-4'
            }`}>
            <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx"
              onChange={e => handleFile(e.target.files[0])} />
            {parsing ? (
              <div className="flex flex-col items-center gap-3">
                <Spinner size={32} />
                <p className="text-sm text-hpa-slate-6">Leyendo hojas del archivo...</p>
                {scanningSheet && <p className="text-xs text-hpa-slate-4 font-mono">{scanningSheet}</p>}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <FileSpreadsheet size={48} className="text-hpa-slate-4" />
                <div>
                  <p className="text-sm font-semibold text-hpa-slate-8">
                    {file ? file.name : 'Arrastra tu Excel aquí'}
                  </p>
                  <p className="text-xs text-hpa-slate-5 mt-1">Formato: .xlsx — cualquier número de hojas, cualquier cliente</p>
                </div>
                <div className="flex gap-3 mt-2">
                  <button type="button" className="btn btn-primary" onClick={triggerFilePicker}>
                    <Upload size={14} /> {file ? 'Elegir otro archivo' : 'Seleccionar archivo Excel'}
                  </button>
                  {file && (
                    <button type="button" className="btn btn-ghost" onClick={() => handleFile(file)}>
                      <Play size={14} /> Procesar archivo
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex gap-2">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />{error}
            </div>
          )}

          {report && (
            <div className="mt-3">
              <button className="text-xs text-hpa-slate-5 flex items-center gap-1 hover:text-hpa-slate-7"
                onClick={() => setShowReport(!showReport)}>
                {showReport ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Ver detalle de hojas leídas ({report.processed.length} procesadas, {report.discarded.length} descartadas, {report.noHeader.length} sin patrón)
              </button>
              {showReport && (
                <div className="mt-2 p-3 bg-hpa-slate-1 rounded-lg text-xs space-y-2">
                  {report.processed.length > 0 && (
                    <div><p className="font-semibold text-emerald-700 mb-1">Procesadas:</p>
                      {report.processed.map((p, i) => <p key={i} className="text-hpa-slate-6">• {p.sheet} — {p.count} préstamo(s)</p>)}
                    </div>
                  )}
                  {report.discarded.length > 0 && (
                    <div><p className="font-semibold text-hpa-slate-5 mb-1">Descartadas (operativas/cálculo):</p>
                      <p className="text-hpa-slate-4">{report.discarded.join(', ')}</p>
                    </div>
                  )}
                  {report.noHeader.length > 0 && (
                    <div><p className="font-semibold text-amber-600 mb-1">Sin patrón de préstamo reconocido:</p>
                      <p className="text-hpa-slate-4">{report.noHeader.join(', ')}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-6 p-4 bg-hpa-slate-1 rounded-xl border border-hpa-slate-2">
            <p className="text-xs font-semibold text-hpa-slate-7 mb-3">¿Qué importa el sistema?</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-hpa-slate-6 text-center">
              {[['👤','Clientes','Crea perfil si no existe'],['💳','Préstamos','Reconstruidos por cronología'],['📊','Estados','Activos y saldados'],['📞','Cobranza','Casos para activos']].map(([icon, label, desc]) => (
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
              <p className="font-semibold text-hpa-slate-9">{preview.length} préstamos reconstruidos de {report?.processed.length || 0} hoja(s)</p>
              <p className="text-xs text-hpa-slate-5 mt-0.5">Revisa la lista antes de confirmar — cada fila resume el historial completo del préstamo</p>
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
                  <tr><th>IDC</th><th>Cliente</th><th>Hoja</th><th>Desembolso</th><th>Monto</th><th>Cuotas</th><th>Frecuencia</th><th>Movimientos</th><th>Cap. Restante</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {preview.map((l, i) => (
                    <tr key={i}>
                      <td className="font-mono text-hpa-slate-5">{l.idc}</td>
                      <td className="font-semibold">{l.cliente}</td>
                      <td className="text-hpa-slate-4 text-2xs">{l.hoja_origen}</td>
                      <td className="text-hpa-slate-5">{l.fecha_desembolso || '—'}</td>
                      <td className="font-numeric font-semibold">RD$ {l.monto_original.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="text-center">{l.cuotas_pactadas}</td>
                      <td>{FREQ_LABELS[l.frecuencia] || l.frecuencia}</td>
                      <td className="text-center text-hpa-slate-5">{l.num_movimientos}</td>
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
            <button className="btn btn-ghost" onClick={() => { setResults(null); setPreview([]); setFile(null); setReport(null) }}>Importar otro</button>
          </div>
        </div>
      )}
    </div>
  )
}
