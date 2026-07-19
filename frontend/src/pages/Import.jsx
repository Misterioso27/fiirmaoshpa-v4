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

// Hojas que nunca contienen registros de clientes (herramientas internas, no datos)
const DISCARD_KEYWORDS = ['CALCULADORA', 'TAX DE CAMBIO', 'TAXA DE CAMBIO', 'AMORTIZACION', 'AMORTIZAÇÃO', 'DASHBOAR']

// Sinónimos por categoría — el parser reconoce cualquier variante de nombre de columna,
// sin exigir un formato único. "includes" hace que también funcione con encabezados largos
// (ej. formularios de Google con el texto completo de la pregunta).
const SYNONYMS = {
  name:     ['NOMBRE COMPLETO', 'NOMBRE', 'NOMBRES', 'CLIENTE', 'CLIENTES', 'SOLICITANTE'],
  amount:   ['MONTO SOLICITADO', 'MONTO PRESTADO', 'MONTO APROBADO', 'MONTO A SOLICITAR', 'MONTO', 'CAPITAL', 'ENVERSION', 'INVERSION', 'VALOR', 'PRINCIPAL'],
  date:     ['FECHA DESEMBOLSO', 'FECHA DE INICIO', 'DATA DE INICIO', 'FECHA DE LA SOLICITUD', 'FECHA EMISION', 'FECHA_EMISION', 'FECHA', 'DATA'],
  end_date: ['FECHA DE VENCIMIENTO', 'FECHA VENCIMIENTO', 'FECHA_VENCIMIENTO', 'VENCIMIENTO'],
  rate:     ['TASA DE INTERES', 'TASA', 'INTERES', 'INTERÉS'],
  installments: ['CUOTAS A PAGAR', 'CUOTAS', 'PLAZO'],
  method:   ['FORMA DE PAGO', 'METODO DE PAGO', 'METODO', 'FRECUENCIA'],
  total:    ['TOTAL PAGO', 'TOTAL A PAGAR', 'CAP & INT', 'CAP/INTERES', 'CAPI/INTERES', 'TOTAL'],
  status:   ['ESTATUS', 'ESTADO', 'STATUS'],
  phone:    ['CELULAR', 'TELEFONO', 'WHATSAPP'],
  idc:      ['IDC'],
}
// Orden de prioridad al asignar una columna a una categoría (una columna no se reparte entre dos)
const CATEGORY_ORDER = ['idc', 'name', 'amount', 'date', 'end_date', 'rate', 'installments', 'method', 'total', 'status', 'phone']

// Palabras que, si aparecen en el nombre de la hoja o en sus encabezados, marcan el registro como inversión/certificado
const INVESTMENT_HINTS = ['SOCIO', 'ENVERSION', 'INVERSION', 'CERTIFICAD', 'ACCIONISTA']

function colLetterToIndex(ref) {
  const letters = ref.replace(/[0-9]/g, '')
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function parseDateValue(v) {
  if (v === null || v === undefined) return null
  if (isNumeric(v)) return xlDate(v)
  const s = String(v).trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function looksLikeName(v) {
  if (!v) return false
  const s = String(v).trim()
  if (s.length < 3 || isNumeric(s)) return false
  // descarta encabezados repetidos o basura ("·", "NA", "SI", "N/A")
  if (/^(NA|N\/A|SI|NO|·)$/i.test(s)) return false
  return /[a-zA-ZÀ-ÿ]/.test(s)
}

// ─── Parser principal: multi-hoja, sinónimos amplios, nunca declara "no reconocido" ────
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

  const strings = []
  const ssFile = zip.file('xl/sharedStrings.xml')
  if (ssFile) {
    const ssXml = await ssFile.async('text')
    const ssDoc = parser.parseFromString(ssXml, 'application/xml')
    ssDoc.querySelectorAll('si').forEach(si => {
      strings.push(Array.from(si.querySelectorAll('t')).map(t => t.textContent || '').join(''))
    })
  }

  const sheetNames = {}
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
  const allRecords = []
  const sheetsReport = { discarded: [], empty: [], processed: [] }

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
    if (!rowEls.length) { sheetsReport.empty.push(sheetName); continue }

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

    // buscar la mejor fila de encabezado entre las primeras 15 filas (sinónimos amplios)
    let headerRowIdx = -1
    let colMap = {}
    let bestScore = 0
    for (let i = 0; i < Math.min(15, rowEls.length); i++) {
      const vals = rowValues(rowEls[i]).map(v => (v ? String(v).toUpperCase().trim() : ''))
      const trialMap = {}
      vals.forEach((cellText, j) => {
        // celdas muy largas son párrafos/instrucciones, no encabezados de columna — se ignoran
        if (!cellText || cellText.length > 60) return
        for (const cat of CATEGORY_ORDER) {
          if (trialMap[cat] !== undefined) continue
          if (SYNONYMS[cat].some(kw => cellText.includes(kw))) { trialMap[cat] = j; break }
        }
      })
      const score = (trialMap.name !== undefined ? 2 : 0) + (trialMap.amount !== undefined ? 2 : 0) + (trialMap.date !== undefined ? 1 : 0) + (trialMap.idc !== undefined ? 1 : 0)
      if (trialMap.name !== undefined && score > bestScore) {
        bestScore = score; headerRowIdx = i; colMap = trialMap
      }
    }

    if (headerRowIdx === -1 || colMap.name === undefined) {
      sheetsReport.empty.push(sheetName)
      continue
    }

    const isInvestmentSheet = INVESTMENT_HINTS.some(k => upperName.includes(k))
    const useGroupedMode = colMap.idc !== undefined

    const recordsInSheet = []
    let current = null

    for (let i = headerRowIdx + 1; i < rowEls.length; i++) {
      const row = rowValues(rowEls[i])
      const nameVal   = colMap.name !== undefined ? row[colMap.name] : null
      const amountVal = colMap.amount !== undefined ? row[colMap.amount] : null
      const dateVal   = colMap.date !== undefined ? row[colMap.date] : null
      const idcVal    = colMap.idc !== undefined ? row[colMap.idc] : null

      if (useGroupedMode) {
        // modo agrupado: una fila con IDC + nombre abre un préstamo, las siguientes son su historial
        const idcStr = idcVal ? String(idcVal).trim() : ''
        const nombreStr = looksLikeName(nameVal) ? cleanName(nameVal) : ''
        const isNewLoanRow = idcStr && idcStr !== '·' && nombreStr

        if (isNewLoanRow) {
          if (current && current.movimientos.length > 0) recordsInSheet.push(current)
          const monto   = colMap.amount !== undefined ? safeFloat(row[colMap.amount]) : 0
          const interes = colMap.rate !== undefined ? safeFloat(row[colMap.rate]) : 0
          const cuotas  = colMap.installments !== undefined ? safeFloat(row[colMap.installments]) : 0
          const metodoRaw = colMap.method !== undefined && row[colMap.method] ? String(row[colMap.method]).trim().toUpperCase() : ''
          current = {
            idc: idcStr, cliente: nombreStr, hoja_origen: sheetName, tipo: isInvestmentSheet ? 'inversion' : 'prestamo',
            fecha_desembolso: parseDateValue(dateVal),
            monto_original: monto, interes_total: interes,
            cuotas_pactadas: Math.round(cuotas) || 1,
            frecuencia: metodoRaw.includes('SEMANA') ? 'weekly' : metodoRaw.includes('MES') ? 'monthly' : 'biweekly',
            telefono: colMap.phone !== undefined && row[colMap.phone] ? String(row[colMap.phone]).trim() : '',
            movimientos: [],
          }
        }
        if (current && dateVal && isNumeric(dateVal)) {
          current.movimientos.push({
            fecha: xlDate(dateVal),
            cap_interes: colMap.total !== undefined ? safeFloat(row[colMap.total]) : 0,
            pago: 0,
            estatus: colMap.status !== undefined && row[colMap.status] ? String(row[colMap.status]).trim() : '',
            obs: '',
          })
        }
      } else {
        // modo plano: cada fila es un registro completo (préstamo, inversión o solicitud)
        if (!looksLikeName(nameVal)) continue
        const cliente = cleanName(nameVal)
        const monto   = colMap.amount !== undefined ? safeFloat(amountVal) : 0
        const interes = colMap.rate !== undefined ? safeFloat(row[colMap.rate]) : 0
        const totalCol = colMap.total !== undefined ? safeFloat(row[colMap.total]) : 0
        const cuotas  = colMap.installments !== undefined ? safeFloat(row[colMap.installments]) : 0
        const metodoRaw = colMap.method !== undefined && row[colMap.method] ? String(row[colMap.method]).trim().toUpperCase() : ''
        const statusTxt = colMap.status !== undefined && row[colMap.status] ? String(row[colMap.status]).trim() : ''
        const fecha = parseDateValue(dateVal)
        const totalPactado = totalCol > 0 ? totalCol : (monto + interes)

        // sin monto y sin fecha: no hay suficiente información financiera, se omite esta fila puntual
        if (monto === 0 && !fecha && totalCol === 0) continue

        recordsInSheet.push({
          idc: '', cliente, hoja_origen: sheetName, tipo: isInvestmentSheet ? 'inversion' : 'prestamo',
          fecha_desembolso: fecha,
          monto_original: monto, interes_total: interes,
          cuotas_pactadas: Math.round(cuotas) || 1,
          frecuencia: metodoRaw.includes('SEMANA') ? 'weekly' : metodoRaw.includes('MES') ? 'monthly' : 'biweekly',
          telefono: colMap.phone !== undefined && row[colMap.phone] ? String(row[colMap.phone]).trim() : '',
          movimientos: [{ fecha, cap_interes: totalPactado, pago: 0, estatus: statusTxt, obs: '' }],
        })
      }
    }
    if (useGroupedMode && current && current.movimientos.length > 0) recordsInSheet.push(current)

    if (recordsInSheet.length > 0) {
      sheetsReport.processed.push({ sheet: sheetName, count: recordsInSheet.length })
      allRecords.push(...recordsInSheet)
    } else {
      sheetsReport.empty.push(sheetName)
    }
  }

  const enriched = allRecords.map(l => {
    const movs = l.movimientos
    const totalPagado   = movs.reduce((s, m) => s + (m.pago > 0 ? m.pago : 0), 0)
    const ultimoMov     = movs[movs.length - 1]
    const capRestante   = ultimoMov ? Math.max(0, ultimoMov.cap_interes) : l.monto_original + l.interes_total
    const totalPactado  = l.monto_original + l.interes_total
    const textoEstatus  = movs.map(m => (m.estatus + ' ' + m.obs).toUpperCase()).join(' ')
    const saldado = /SALDO|SALDADO|PAGADO/.test(textoEstatus)
    const primerNombre = l.cliente.split(' ')[0] || l.cliente
    const apellidos     = l.cliente.split(' ').slice(1).join(' ') || 'Histórico HPA'

    return {
      ...l,
      first_name: primerNombre,
      last_name: apellidos,
      total_pactado: totalPactado || capRestante,
      total_pagado: totalPagado,
      cap_restante: saldado ? 0 : capRestante,
      status: saldado ? 'paid' : 'active',
      num_movimientos: movs.length,
    }
  })

  const seen = new Set()
  const deduped = enriched.filter(l => {
    const key = `${l.cliente}|${l.fecha_desembolso}|${l.monto_original}`
    if (seen.has(key)) return false
    seen.add(key); return true
  })

  return { loans: deduped, report: sheetsReport }
}

// ─── Valores por defecto cuando la BD exige una columna NOT NULL que no viene del Excel ──
function defaultForColumn(col, idx) {
  const c = col.toLowerCase()
  if (c.includes('phone') || c.includes('celular') || c.includes('telefono')) return 'N/A'
  if (c.includes('email') || c.includes('correo')) return `sin-email-${Date.now()}-${idx}@fiirmaoshpa.com`
  if (c.includes('address') || c.includes('direccion')) return 'No especificada (importación histórica)'
  if (c.includes('city') || c.includes('ciudad')) return 'No especificada'
  if (c.includes('state') || c.includes('province') || c.includes('provincia')) return 'No especificada'
  if (c.includes('country') || c.includes('pais')) return 'DO'
  if (c.includes('postal') || c.includes('zip') || c.includes('codigo_postal')) return '00000'
  if (c.includes('national_id') || c.includes('cedula') || c.includes('document')) return `SIN-CEDULA-${Date.now()}${idx}`
  if (c.includes('birth') || c.includes('nacimiento')) return '1990-01-01'
  if (c.includes('occupation') || c.includes('ocupacion') || c.includes('employer') || c.includes('empresa')) return 'No especificado'
  if (c.includes('income') || c.includes('salario') || c.includes('salary')) return 0
  if (c.includes('emergency') || c.includes('emergencia')) return 'No especificado'
  if (c.includes('gender') || c.includes('genero') || c.includes('sexo')) return 'N/A'
  return 'N/A'
}

// Inserta un cliente reintentando: si Postgres dice "falta la columna X", se le agrega
// un valor por defecto y se reintenta, hasta que el insert pase o se agoten los intentos.
async function insertClientResilient(basePayload) {
  let payload = { ...basePayload }
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await supabase.from('clients').insert(payload).select('id').single()
    if (!error) return { data, error: null }
    const m = error.message.match(/column "([^"]+)"/)
    if (error.message.includes('not-null') && m && payload[m[1]] === undefined) {
      payload[m[1]] = defaultForColumn(m[1], Date.now() % 100000)
      continue
    }
    return { data: null, error }
  }
  return { data: null, error: { message: 'No se pudo crear el cliente tras varios intentos de autocompletar campos obligatorios.' } }
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
        const { data: nc, error: ce } = await insertClientResilient({
          company_id: companyId, branch_id: branchId,
          client_code: `HPA-C-${String((count || 0) + 1).padStart(4, '0')}`,
          type: 'person', status: 'active',
          first_name: loan.first_name, last_name: loan.last_name,
          phone_primary: loan.telefono || 'N/A',
          address: 'No especificada (importación histórica)',
          city: 'No especificada',
          nationality: 'DO', kyc_status: 'pending', kyc_level: 1,
          risk_level: 'medium', assigned_to: userId, created_by: userId,
        })
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
        setError(
          `No se encontraron registros con nombre y monto en ninguna hoja de este archivo. ` +
          `Revisa el detalle abajo para ver qué se leyó en cada hoja.`
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
                Ver detalle de hojas leídas ({report.processed.length} con registros, {report.discarded.length} de cálculo/referencia, {report.empty.length} sin datos de clientes)
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
                  {report.empty.length > 0 && (
                    <div><p className="font-semibold text-hpa-slate-5 mb-1">Sin datos de clientes:</p>
                      <p className="text-hpa-slate-4">{report.empty.join(', ')}</p>
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
                  <tr><th>Tipo</th><th>Cliente</th><th>Hoja</th><th>Desembolso</th><th>Monto</th><th>Cuotas</th><th>Frecuencia</th><th>Movimientos</th><th>Cap. Restante</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {preview.map((l, i) => (
                    <tr key={i}>
                      <td><span className={`badge ${l.tipo === 'inversion' ? 'badge-blue' : 'badge-gray'}`}>{l.tipo === 'inversion' ? 'Inversión' : 'Préstamo'}</span></td>
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
