import { useState, useEffect, useCallback } from 'react'
import { Plus, CreditCard, Calculator, Upload, ShieldAlert,
         CheckCircle2, Edit2, CheckSquare, XSquare, DollarSign, Building2 } from 'lucide-react'
import { db, supabase, fmt, fmtDate } from '@/lib/supabase'
import { StatusBadge, Modal, Field, Pagination, Empty, Spinner, Tabs } from '@/components/ui'
import useAuthStore from '@/store/auth'

const CURRENCIES = {
  DOP: { symbol: 'RD$', label: 'Peso Dominicano', flag: '🇩🇴' },
  BRL: { symbol: 'R$',  label: 'Real Brasileño',  flag: '🇧🇷' },
  USD: { symbol: '$',   label: 'Dólar Americano', flag: '🇺🇸' },
  EUR: { symbol: '€',   label: 'Euro',            flag: '🇪🇺' },
  GBP: { symbol: '£',   label: 'Libra Esterlina', flag: '🇬🇧' },
}

function fmtCurrency(amount, currency = 'DOP') {
  const c = CURRENCIES[currency] || CURRENCIES.DOP
  return `${c.symbol} ${parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function calcularEstructura({ monto, tasaMensual, meses, cuotasManual, frecuencia, ingresoNeto, fechaInicio, currency = 'DOP' }) {
  if (!monto || !tasaMensual) return { cuotas: [], error: '', warning: '', montoCuota: 0, totalCuotas: 0, totalInteres: 0, totalPagar: 0 }
  const p = parseFloat(monto)
  const rm = parseFloat(tasaMensual) / 100
  const mesesNum = parseFloat(meses) || 3
  let cuotasSugeridas = 0, diasPorPeriodo = 30, etiqueta = 'Cuota'
  if (frecuencia === 'weekly')        { cuotasSugeridas = mesesNum === 2.5 ? 10 : 12; diasPorPeriodo = 7;  etiqueta = 'Semana'   }
  else if (frecuencia === 'biweekly') { cuotasSugeridas = mesesNum === 2.5 ? 5  : 6;  diasPorPeriodo = 15; etiqueta = 'Quincena' }
  else                                { cuotasSugeridas = Math.round(mesesNum);        diasPorPeriodo = 30; etiqueta = 'Mes'      }
  const totalCuotas = cuotasManual && parseInt(cuotasManual) > 0 ? parseInt(cuotasManual) : cuotasSugeridas
  if (totalCuotas <= 0) return { cuotas: [], error: 'Número de cuotas inválido', warning: '', montoCuota: 0, totalCuotas: 0, totalInteres: 0, totalPagar: 0 }
  const totalInteres = Math.round(p * rm * 3 * 100) / 100
  const totalPagar   = Math.round((p + totalInteres) * 100) / 100
  const montoCuota   = Math.round((totalPagar / totalCuotas) * 100) / 100
  let errorMsg = '', warningMsg = ''
  const ingresoNum = parseFloat(String(ingresoNeto || '0').replace(/,/g, ''))
  if (ingresoNum > 0 && montoCuota > 0) {
    const cuotaMensualEq = frecuencia === 'weekly' ? montoCuota * 4.333 : frecuencia === 'biweekly' ? montoCuota * 2 : montoCuota
    const limite30 = ingresoNum * 0.30
    const exceso   = parseFloat((cuotaMensualEq - limite30).toFixed(2))
    if (cuotaMensualEq > limite30) {
      if (exceso <= 1000) warningMsg = `⚠️ Requiere Autorización: La cuota mensual equivalente es ${fmtCurrency(cuotaMensualEq, currency)}, excede el límite del 30% (${fmtCurrency(limite30, currency)}) por ${fmtCurrency(exceso, currency)}.`
      else                errorMsg   = `❌ Bloqueado: La cuota mensual equivalente es ${fmtCurrency(cuotaMensualEq, currency)}, supera la capacidad de pago por ${fmtCurrency(exceso, currency)}.`
    }
  }
  const base = fechaInicio ? new Date(fechaInicio) : new Date()
  const listado = []
  let saldo = totalPagar
  for (let i = 1; i <= totalCuotas; i++) {
    const fechaVenc = new Date(base)
    if (frecuencia === 'monthly') fechaVenc.setMonth(fechaVenc.getMonth() + i)
    else fechaVenc.setDate(fechaVenc.getDate() + diasPorPeriodo * i)
    saldo = i === totalCuotas ? 0 : Math.max(0, Math.round((saldo - montoCuota) * 100) / 100)
    listado.push({
      num: i, label: `${etiqueta} ${i}`,
      fechaVenc:    fechaVenc.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }),
      fechaVencISO: fechaVenc.toISOString().split('T')[0],
      monto: montoCuota,
      principal:     Math.round((p / totalCuotas) * 100) / 100,
      interes:       Math.round((totalInteres / totalCuotas) * 100) / 100,
      saldoRestante: saldo,
    })
  }
  return { cuotas: listado, error: errorMsg, warning: warningMsg, montoCuota, totalCuotas, totalInteres, totalPagar }
}

function numeroALetras(n) {
  const unidades = ['','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE',
    'DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE']
  const decenas  = ['','','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA']
  const centenas = ['','CIEN','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS',
    'SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS']
  const MESES   = ['','ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
  const DIAS_ORD = ['','PRIMERO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ',
    'ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE','VEINTE',
    'VEINTIUNO','VEINTIDÓS','VEINTITRÉS','VEINTICUATRO','VEINTICINCO','VEINTISÉIS','VEINTISIETE',
    'VEINTIOCHO','VEINTINUEVE','TREINTA','TREINTA Y UNO']

  function centToStr(c) {
    if (c === 0) return ''
    if (c < 20)  return unidades[c]
    if (c < 100) {
      const d = Math.floor(c / 10), u = c % 10
      return u === 0 ? decenas[d] : (d === 2 ? 'VEINTI' + unidades[u] : decenas[d] + ' Y ' + unidades[u])
    }
    if (c === 100) return 'CIEN'
    const ch = Math.floor(c / 100), resto = c % 100
    return centenas[ch] + (resto > 0 ? ' ' + centToStr(resto) : '')
  }

  function intToStr(num) {
    if (num === 0)     return 'CERO'
    if (num < 1000)    return centToStr(num)
    if (num < 1000000) {
      const miles = Math.floor(num / 1000), resto = num % 1000
      const mStr  = miles === 1 ? 'MIL' : centToStr(miles) + ' MIL'
      return mStr + (resto > 0 ? ' ' + centToStr(resto) : '')
    }
    return num.toLocaleString()
  }

  const partes = String(parseFloat(n).toFixed(2)).split('.')
  const entero = parseInt(partes[0])
  const cents  = partes[1] || '00'
  return { str: intToStr(entero), cents, MESES, DIAS_ORD }
}

function generarPagare(item) {
  const ai      = item.ai_analysis || {}
  const cliente = `${item.clients?.first_name || ''} ${item.clients?.last_name || ''}`.trim().toUpperCase()
  const cedula  = item.clients?.national_id || '_______________'
  const domicilio = item.clients?.address
    ? `${item.clients.address}, ${item.clients.city || ''}, República Dominicana`
    : '_______________________________________________'

  const monto    = parseFloat(item.approved_amount || item.amount_requested || 0)
  const currency = item.currency || 'DOP'
  const sym      = CURRENCIES[currency]?.symbol || 'RD$'
  const cuotas   = parseInt(ai.total_periods || item.approved_term || 3)
  const frecuencia = ai.frequency || 'monthly'
  const freqLabel  = { weekly: 'semanales', biweekly: 'quincenales', monthly: 'mensuales' }[frecuencia] || 'mensuales'
  const freqDias   = { weekly: 7, biweekly: 15, monthly: 30 }[frecuencia] || 30

  const hoy = new Date()
  const { str: montoStr, cents, MESES, DIAS_ORD } = numeroALetras(monto)
  const diaHoy = hoy.getDate()
  const mesHoy = hoy.getMonth() + 1
  const anioHoy = hoy.getFullYear()

  const aniosTexto = {
    2025: 'DOS MIL VEINTICINCO', 2026: 'DOS MIL VEINTISÉIS',
    2027: 'DOS MIL VEINTISIETE', 2028: 'DOS MIL VEINTIOCHO',
    2029: 'DOS MIL VEINTINUEVE', 2030: 'DOS MIL TREINTA',
  }

  const fechaPrimer = new Date(hoy)
  if (frecuencia === 'monthly') fechaPrimer.setMonth(fechaPrimer.getMonth() + 1)
  else fechaPrimer.setDate(fechaPrimer.getDate() + freqDias)

  const fechaUltimo = new Date(hoy)
  if (frecuencia === 'monthly') fechaUltimo.setMonth(fechaUltimo.getMonth() + cuotas)
  else fechaUltimo.setDate(fechaUltimo.getDate() + freqDias * cuotas)

  const fmtFechaLarga = (d) => {
    const dia = d.getDate(), mes = d.getMonth() + 1, anio = d.getFullYear()
    return `${DIAS_ORD[dia]} (${dia}) días del mes de ${MESES[mes].charAt(0) + MESES[mes].slice(1).toLowerCase()} del año ${aniosTexto[anio] || anio} (${anio})`
  }

  const fmtFechaCorta = (d) => d.toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' })

  const montoFormateado = monto.toLocaleString('en-US', { minimumFractionDigits: 2 })
  const cuotasTexto = { 1:'UNA',2:'DOS',3:'TRES',4:'CUATRO',5:'CINCO',6:'SEIS',7:'SIETE',8:'OCHO',9:'NUEVE',10:'DIEZ',11:'ONCE',12:'DOCE' }[cuotas] || String(cuotas)

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Pagaré Notarial — ${item.application_code || ''}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 13.5px; line-height: 1.8; color: #000; background: #fff; }
  .page { max-width: 780px; margin: 0 auto; padding: 50px 60px; }
  .header { text-align: center; margin-bottom: 30px; }
  .logo-outer { border: 3px double #000; display: inline-block; padding: 10px 30px; margin-bottom: 12px; }
  .logo-name { font-size: 15px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; }
  .logo-sub  { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #333; }
  .titulo { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; margin: 16px 0 4px; text-decoration: underline; }
  .acto   { font-size: 12px; color: #333; margin-bottom: 20px; }
  .cuerpo { text-align: justify; }
  .cuerpo p { margin-bottom: 16px; }
  .ref-box { border: 1px solid #ccc; padding: 8px 14px; font-size: 11px; color: #555; margin-bottom: 20px; display: flex; justify-content: space-between; }
  .gold-sep { border: none; border-top: 2px solid #C9A84C; margin: 20px 0; }
  .firma-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 50px; margin-top: 30px; }
  .firma-box { text-align: center; }
  .firma-linea { border-top: 1px solid #000; padding-top: 8px; margin-top: 70px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .firma-cargo { font-size: 11px; font-weight: 400; color: #333; margin-top: 2px; }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .page { padding: 30px 40px; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo-outer">
      <div class="logo-name">Financiera e Inversiones Irmaos HPA SRL</div>
      <div class="logo-sub">RNC: 133-36415-8 · Registro Mercantil: 327047SD</div>
    </div>
    <div class="titulo">Pagaré Notarial Auténtico</div>
    <div class="acto">Acto No. ____________</div>
  </div>
  <div class="ref-box">
    <span>Referencia: <strong>${item.application_code || '—'}</strong></span>
    <span>Fecha: <strong>${fmtFechaCorta(hoy)}</strong></span>
    <span>Moneda: <strong>${currency}</strong></span>
  </div>
  <hr class="gold-sep">
  <div class="cuerpo">
    <p>En la ciudad de <strong>Santo Domingo, Distrito Nacional, República Dominicana</strong>, a los <strong>${DIAS_ORD[diaHoy]} (${diaHoy})</strong> días del mes de <strong>${MESES[mesHoy].charAt(0) + MESES[mesHoy].slice(1).toLowerCase()}</strong> del año <strong>${aniosTexto[anioHoy] || anioHoy} (${anioHoy})</strong>, por ante mí, <strong>DOCTOR GERIS RODOLFO LEÓN ENCARNACIÓN</strong>, Abogado Notario Público, de los del Número para el Distrito Nacional, miembro activo del Colegio de Notarios de la República Dominicana, con matrícula Número cinco mil doscientos cuatro (5204), dominicano, mayor de edad, casado, portador de la Cédula de Identidad y Electoral Número Cero, uno, uno, guión, cero, cero, cero, tres, dos, nueve, cero, guión, uno (011-0003290-1), con estudio profesional abierto en la calle Juan Enrique Dunant Número (154), Miraflores, Santo Domingo, Distrito Nacional, República Dominicana; asistido de los testigos que al final del presente acto se mencionan,</p>
    <p><strong>COMPARECIÓ</strong> libre y voluntariamente el/la <strong>SEÑOR/A ${cliente}</strong>, dominicano/a, mayor de edad, portador/a de la Cédula de Identidad y Electoral Número <strong>${cedula}</strong>, con domicilio y residencia declarados en <strong>${domicilio}</strong>; y me ha declarado dicho compareciente lo siguiente:</p>
    <p><strong>Que él/ella se declara DEUDOR/A de la Financiera e Inversiones Irmaos HPA SRL</strong>, representada legalmente por la señora <strong>ALTAGRACIA RODRÍGUEZ CRUCETA</strong>, dominicana, mayor de edad, portadora de la Cédula de Identidad y Electoral Número cero, cero, uno, guión, cero, cuatro, seis, cuatro, siete, cinco, dos, guión, cuatro (001-0464752-4), con domicilio en la C. Isabela (C. Hermanas Mirabal) #47, Esquina, C. Enriquillo, Sector D.M. La Caleta, Campo Lindo, Municipio Boca Chica, Provincia Santo Domingo, República Dominicana, por la suma de <strong>${montoStr} PESOS DOMINICANOS CON ${cents}/100 (${sym}${montoFormateado})</strong>, suma esta que será pagada en un período de <strong>${cuotasTexto} (${cuotas}) cuotas ${freqLabel}</strong>, comenzando a partir del día <strong>${fmtFechaLarga(fechaPrimer)}</strong> y concluyendo el <strong>${fmtFechaLarga(fechaUltimo)}</strong>.</p>
    <p>El compareciente me ha manifestado que acepta darle al presente acto la fuerza ejecutoria prevista en el artículo 545 (quinientos cuarenta y cinco) del Código de Procedimiento Civil Dominicano, y que queda expresamente acordado que si por cualquier circunstancia el compareciente (Deudor/a) no pagare en la fecha convenida al vencimiento de las cuotas, desde la fecha del retraso devengará una mora al tipo del <strong>Cuarenta y cinco por ciento (45%) mensual</strong>, más comisiones y gastos, hasta que quede totalmente liquidada la deuda, en cuyo caso la <strong>Financiera e Inversiones Irmaos HPA SRL</strong> (en calidad de acreedor) exigirá la totalidad del crédito adeudado, más las moras correspondientes al tiempo transcurrido posterior al término de este pagaré.</p>
    <p>Asimismo, el compareciente expresa que para el fiel cumplimiento de lo declarado y aceptado en el presente acto, afecta todos sus bienes muebles e inmuebles, presentes y futuros.</p>
    <p><strong>HECHO</strong> en mi estudio el día, mes y año indicados en cabeza del presente acto, en presencia de los testigos Señores <strong>BERNARDO ALEXANDER LOPEZ BAEZ</strong> y <strong>ALTAGRACIA RODRÍGUEZ CRUCETA</strong>, dominicanos, mayores de edad, solteros, portadores de las Cédulas de Identidad y Electorales Números Cero, Cero, Uno, Guión, Uno, cinco, Tres, Dos, Nueve, Seis, Nueve, Guión, Cero (001-1532969-0) y Cuatro, Cero, Dos, Guión, Dos, Cuatro, Cinco, Seis, Cuatro, Dos, Uno, Guión, Siete (402-2456421-7), respectivamente, domiciliados en la Calle Bonaire Número Doscientos Cuarenta y Tres (243), Residencial Ana Iris I, Apartamento Número Uno, Letra A (1-A) el primero, y Calle Bonaire, Número 243, Residencial Ana Iris I, Casa Número 1, ambos en el sector Alma Rosa I, Municipio Santo Domingo Este, Provincia Santo Domingo, República Dominicana; testigos instrumentales requeridos al efecto, libres de todas tachas y excepciones que establece la ley, de todo lo cual he redactado el presente pagaré, que ha sido leído en alta voz al compareciente y a los testigos, quienes lo han aprobado y firmado por ante mí y junto conmigo, de todo lo cual doy fe y verdadero testimonio de manera expresa, formal y solemne, levantando el presente pagaré notarial.</p>
    <p style="text-align:center;font-weight:700;margin-top:10px">Notario Público que certifica y da fe.</p>
  </div>
  <div class="firma-grid">
    <div class="firma-box"><div class="firma-linea">${cliente}</div><div class="firma-cargo">COMPARECIENTE</div></div>
    <div class="firma-box"><div class="firma-linea">KELVIN JOSE CRUZ ARACENA</div><div class="firma-cargo">TESTIGO</div></div>
  </div>
  <div class="firma-grid" style="margin-top:50px">
    <div class="firma-box"><div class="firma-linea">BERNARDO ALEXANDER LOPEZ BAEZ</div><div class="firma-cargo">TESTIGO</div></div>
    <div class="firma-box"><div class="firma-linea">DOCTOR GERIS RODOLFO LEON ENCARNACIÓN</div><div class="firma-cargo">NOTARIO PÚBLICO</div></div>
  </div>
</div>
<script>window.onload = function() { window.print() }</script>
</body>
</html>`

  const ventana = window.open('', '_blank', 'width=900,height=750')
  if (ventana) { ventana.document.write(html); ventana.document.close() }
}

export default function Loans() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id || 'a0000000-0000-4000-8000-000000000001'
  const branchId  = user?.branch?.id  || 'b0000000-0000-4000-8000-000000000001'

  const [tab, setTab]                               = useState('applications')
  const [items, setItems]                           = useState([])
  const [loading, setLoading]                       = useState(true)
  const [page, setPage]                             = useState(1)
  const [pagination, setPagination]                 = useState({})
  const [status, setStatus]                         = useState('')
  const [showModal, setShowModal]                   = useState(false)
  const [showApproveModal, setShowApproveModal]     = useState(false)
  const [showDisbursalModal, setShowDisbursalModal] = useState(false)
  const [approveItem, setApproveItem]               = useState(null)
  const [disbursalItem, setDisbursalItem]           = useState(null)
  const [approveForm, setApproveForm]               = useState({})
  const [disbursalForm, setDisbursalForm]           = useState({ method: 'cash', currency: 'DOP' })
  const [approveSaving, setApproveSaving]           = useState(false)
  const [disbursalSaving, setDisbursalSaving]       = useState(false)
  const [bankAccounts, setBankAccounts]             = useState([])
  const [form, setForm]       = useState({ type: 'personal', currency: 'DOP', frequency: 'monthly', term_months: 3, rate_monthly: 10, cuotas_manual: '' })
  const [saving, setSaving]   = useState(false)
  const [selected, setSelected] = useState(null)
  const [clients, setClients]   = useState([])
  const [analisis, setAnalisis] = useState({ cuotas: [], error: '', warning: '', montoCuota: 0, totalCuotas: 0, totalInteres: 0, totalPagar: 0 })
  const [showSchedule, setShowSchedule] = useState(false)
  const [uploading, setUploading]       = useState(false)
  const [idDocUrl, setIdDocUrl]         = useState('')

  useEffect(() => {
    setAnalisis(calcularEstructura({
      monto: form.amount_requested, tasaMensual: form.rate_monthly,
      meses: form.term_months, cuotasManual: form.cuotas_manual,
      frecuencia: form.frequency || 'monthly',
      ingresoNeto: form.monthly_income ? String(form.monthly_income) : '',
      fechaInicio: new Date().toISOString(), currency: form.currency || 'DOP',
    }))
  }, [form.amount_requested, form.rate_monthly, form.term_months, form.frequency, form.monthly_income, form.cuotas_manual, form.currency])

  const approveAnalisis = approveForm.approved_amount && approveForm.approved_rate
    ? calcularEstructura({ monto: approveForm.approved_amount, tasaMensual: approveForm.approved_rate, meses: approveForm.approved_term || 3, cuotasManual: approveForm.cuotas_manual, frecuencia: approveForm.frequency || 'monthly', fechaInicio: approveForm.disbursement_date, currency: approveForm.currency || 'DOP' })
    : { cuotas: [], montoCuota: 0, totalCuotas: 0, totalInteres: 0, totalPagar: 0 }

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      if (tab === 'applications') {
        const data = await db.getLoanApplications({ page, limit: 20, status, companyId })
        setItems(data.applications || []); setPagination(data.pagination || {})
      } else {
        const data = await db.getLoans({ page, limit: 20, status, companyId })
        setItems(data.loans || []); setPagination(data.pagination || {})
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [tab, page, status, companyId])

  useEffect(() => { load() }, [load])

  function fc(k, v)  { setForm(f => ({ ...f, [k]: v })) }
  function afc(k, v) { setApproveForm(f => ({ ...f, [k]: v })) }
  function dfc(k, v) { setDisbursalForm(f => ({ ...f, [k]: v })) }

  async function fetchClients() {
    try {
      const { data: cls } = await supabase.from('clients').select('id, first_name, last_name, client_code').eq('company_id', companyId).eq('status', 'active').limit(100)
      if (cls) setClients(cls)
    } catch (e) { console.error(e) }
  }

  async function fetchBankAccounts() {
    try {
      const { data } = await supabase.from('bank_accounts').select('id, label, bank_name, account_number, currency, is_primary, pix_key, swift_bic').eq('company_id', companyId).eq('is_active', true).order('is_primary', { ascending: false })
      if (data) setBankAccounts(data)
    } catch (e) { console.error(e) }
  }

  async function openNew() {
    setForm({ type: 'personal', currency: 'DOP', frequency: 'monthly', term_months: 3, rate_monthly: 10, cuotas_manual: '' })
    setSelected(null); setIdDocUrl(''); setShowSchedule(false); setShowModal(true)
    await fetchClients()
  }

  async function openEdit(item) {
    if (tab === 'loans') {
      const nuevoStatus = prompt(
        `Editar estado del préstamo ${item.loan_code}\n(active / overdue / paid / defaulted / written_off)`,
        item.status
      )
      if (nuevoStatus && nuevoStatus !== item.status) {
        try {
          await supabase.from('loans').update({ status: nuevoStatus }).eq('id', item.id)
          load()
        } catch (err) { alert(err.message) }
      }
      return
    }
    setForm({ client_id: item.client_id, type: item.type, currency: item.currency || 'DOP', amount_requested: item.amount_requested, term_months: item.term_months, purpose: item.purpose, monthly_income: item.monthly_income, analyst_notes: item.analyst_notes, frequency: item.ai_analysis?.frequency || 'monthly', rate_monthly: item.ai_analysis?.rate_monthly || 10, cuotas_manual: item.ai_analysis?.total_periods || '' })
    setSelected(item); setShowModal(true)
    await fetchClients()
  }

  function openApprove(item) {
    setApproveItem(item)
    setApproveForm({ approved_amount: item.amount_requested, approved_rate: item.ai_analysis?.rate_monthly || 10, approved_term: item.term_months, frequency: item.ai_analysis?.frequency || 'monthly', currency: item.currency || 'DOP', cuotas_manual: item.ai_analysis?.total_periods || '', disbursement_date: new Date().toISOString().split('T')[0], conditions: '' })
    setShowApproveModal(true)
  }

  async function openDisbursal(item) {
    setDisbursalItem(item)
    setDisbursalForm({ method: 'cash', currency: item.currency || item.ai_analysis?.currency || 'DOP', bank_account_id: '', reference: '', notes: '', disbursement_date: new Date().toISOString().split('T')[0] })
    setShowDisbursalModal(true)
    await fetchBankAccounts()
  }

  async function uploadIdDoc(file) {
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `loan-docs/${companyId}/${Date.now()}.${ext}`
      const { error: err } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
      if (err) throw err
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
      setIdDocUrl(urlData.publicUrl); fc('id_doc_url', urlData.publicUrl)
    } catch { alert('Error al subir documento.') }
    setUploading(false)
  }

  async function save() {
    if (analisis.error) return
    setSaving(true)
    try {
      const reqs = [['client_id','Cliente'],['amount_requested','Monto'],['term_months','Plazo'],['purpose','Propósito'],['monthly_income','Ingreso']]
      for (const [c, l] of reqs) { if (!form[c]) throw new Error(`El campo "${l}" es obligatorio`) }
      if (selected?.id) {
        await supabase.from('loan_applications').update({ purpose: form.purpose, analyst_notes: form.analyst_notes || null, monthly_income: parseFloat(form.monthly_income), type: form.type }).eq('id', selected.id)
      } else {
        const estadoInicial = analisis.warning ? 'in_review' : 'submitted'
        await db.createLoanApplication({
          client_id: form.client_id, product_id: form.product_id || null, type: form.type || 'personal',
          amount_requested: parseFloat(form.amount_requested), currency: form.currency || 'DOP',
          term_months: parseFloat(form.term_months), purpose: form.purpose,
          monthly_income: parseFloat(form.monthly_income),
          analyst_notes: analisis.warning ? `[AUTORIZACIÓN REQUERIDA]: ${form.analyst_notes || ''}` : form.analyst_notes || null,
          ai_analysis: { frequency: form.frequency, rate_monthly: parseFloat(form.rate_monthly), total_periods: analisis.totalCuotas, cuota_individual: analisis.montoCuota, total_interes: analisis.totalInteres, total_pagar: analisis.totalPagar, id_doc_url: idDocUrl || null, requiere_autorizacion: !!analisis.warning, cronograma: analisis.cuotas.map(c => ({ num: c.num, fecha: c.fechaVencISO, monto: c.monto })) },
          status: estadoInicial,
        }, companyId, branchId, user.id)
      }
      setShowModal(false); setSelected(null); load()
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  async function approveApplication() {
    if (!approveItem || approveAnalisis.error) return
    setApproveSaving(true)
    try {
      await supabase.from('loan_applications').update({
        status: 'approved', approved_amount: parseFloat(approveForm.approved_amount),
        approved_rate: parseFloat(approveForm.approved_rate), approved_term: parseFloat(approveForm.approved_term),
        approved_by: user.id, approved_at: new Date().toISOString(), conditions: approveForm.conditions || null,
        ai_analysis: { ...(approveItem.ai_analysis || {}), frequency: approveForm.frequency, rate_monthly: parseFloat(approveForm.approved_rate), total_periods: approveAnalisis.totalCuotas, cuota_individual: approveAnalisis.montoCuota, total_interes: approveAnalisis.totalInteres, total_pagar: approveAnalisis.totalPagar },
      }).eq('id', approveItem.id)
      setShowApproveModal(false); setApproveItem(null); load()
      alert('✅ Solicitud aprobada. Ahora puedes generar el pagaré y proceder al desembolso.')
    } catch (err) { alert('❌ ' + err.message) }
    setApproveSaving(false)
  }

  async function executeDisbursal() {
    if (!disbursalItem) return
    setDisbursalSaving(true)
    try {
      const item = disbursalItem
      const ai   = item.ai_analysis || {}
      const monto    = parseFloat(item.approved_amount || item.amount_requested)
      const tasa     = parseFloat(item.approved_rate   || ai.rate_monthly || 10)
      const mesesNum = parseFloat(item.approved_term   || item.term_months || 3)
      const freq     = ai.frequency || 'monthly'
      const currency = disbursalForm.currency || item.currency || 'DOP'
      const calc = calcularEstructura({ monto, tasaMensual: tasa, meses: mesesNum, cuotasManual: ai.total_periods, frecuencia: freq, currency, fechaInicio: disbursalForm.disbursement_date })
      if (calc.cuotas.length === 0) throw new Error('Error en el cálculo del cronograma')
      const totalCuotas = calc.totalCuotas
      const cuotaMonto  = calc.montoCuota
      const diasPeriodo = freq === 'weekly' ? 7 : freq === 'biweekly' ? 15 : 30
      const fechaBase   = new Date(disbursalForm.disbursement_date)
      const primerPago  = new Date(fechaBase)
      if (freq === 'monthly') primerPago.setMonth(primerPago.getMonth() + 1)
      else primerPago.setDate(primerPago.getDate() + diasPeriodo)
      const ultimoPago = new Date(fechaBase)
      if (freq === 'monthly') ultimoPago.setMonth(ultimoPago.getMonth() + totalCuotas)
      else ultimoPago.setDate(ultimoPago.getDate() + diasPeriodo * totalCuotas)
      const { count: loanCount } = await supabase.from('loans').select('*', { count: 'exact', head: true }).eq('company_id', companyId)
      const loan_code = `HPA-L-${String((loanCount || 0) + 1).padStart(4, '0')}`
      const { data: loanData, error: loanError } = await supabase.from('loans').insert({
        company_id: companyId, branch_id: branchId, client_id: item.client_id,
        application_id: item.id, product_id: item.product_id || null, loan_code,
        type: item.type, currency, principal: monto, rate_monthly: tasa, rate_annual: tasa * 12,
        term_months: mesesNum, payment_amount: cuotaMonto, total_interest: calc.totalInteres,
        total_amount: calc.totalPagar, origination_fee: 0, balance_principal: monto,
        balance_interest: 0, balance_penalties: 0, balance_total: calc.totalPagar,
        disbursed_at: disbursalForm.disbursement_date,
        first_payment_date: primerPago.toISOString().split('T')[0],
        last_payment_date:  ultimoPago.toISOString().split('T')[0],
        next_payment_date:  primerPago.toISOString().split('T')[0],
        status: 'active', days_overdue: 0, disbursed_by: user.id,
      }).select().single()
      if (loanError) throw new Error('Error al crear préstamo: ' + loanError.message)
      await supabase.from('loan_schedule').insert(
        calc.cuotas.map(c => ({ loan_id: loanData.id, installment_num: c.num, due_date: c.fechaVencISO, principal: c.principal, interest: c.interes, total_due: c.monto, principal_paid: 0, interest_paid: 0, penalty_paid: 0, total_paid: 0, balance: c.saldoRestante, status: 'pending', days_overdue: 0, penalty_amount: 0 }))
      )
      await supabase.from('collection_cases').insert({ company_id: companyId, branch_id: branchId, client_id: item.client_id, loan_id: loanData.id, stage: 'preventive', status: 'open', days_overdue: 0, amount_overdue: 0, installments_due: 0 })
      if (disbursalForm.method === 'cash') {
        const { data: openReg } = await supabase.from('cash_registers').select('id').eq('company_id', companyId).eq('status', 'open').limit(1).single()
        if (openReg) {
          const { data: openSession } = await supabase.from('cash_sessions').select('id, opening_balance, total_income, total_expense').eq('register_id', openReg.id).eq('status', 'open').single()
          if (openSession) {
            const { count: mvCount } = await supabase.from('cash_movements').select('*', { count: 'exact', head: true }).eq('session_id', openSession.id)
            const current = (openSession.opening_balance || 0) + (openSession.total_income || 0) - (openSession.total_expense || 0)
            await supabase.from('cash_movements').insert({ session_id: openSession.id, company_id: companyId, movement_number: `MV-${String((mvCount || 0) + 1).padStart(4, '0')}`, type: 'expense', category: 'loan_disbursement', reference_type: 'loan', reference_id: loanData.id, amount: monto, currency, fx_rate: 1, amount_base: monto, balance_after: Math.max(0, current - monto), description: `Desembolso préstamo ${loan_code}`, client_id: item.client_id, created_by: user.id })
          }
        }
      }
      setShowDisbursalModal(false); setDisbursalItem(null); load()
      alert(`✅ Préstamo desembolsado.\nCódigo: ${loan_code}\nMonto: ${fmtCurrency(monto, currency)}\n${totalCuotas} cuotas de ${fmtCurrency(cuotaMonto, currency)}`)
    } catch (err) { alert('❌ ' + err.message) }
    setDisbursalSaving(false)
  }

  async function rejectApplication(item) {
    if (!confirm(`¿Rechazar la solicitud ${item.application_code}?`)) return
    try {
      await supabase.from('loan_applications').update({ status: 'rejected', rejected_by: user.id, rejected_at: new Date().toISOString(), rejection_reason: 'Rechazada por el analista' }).eq('id', item.id)
      load()
    } catch (err) { alert(err.message) }
  }

  const tipoLabel = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }
  const TABS = [{ id: 'applications', label: 'Solicitudes' }, { id: 'loans', label: 'Préstamos Activos' }]
  const methodOptions = [
    { value: 'cash',     label: '💵 Efectivo'            },
    { value: 'pix',      label: '⚡ PIX'                 },
    { value: 'swift',    label: '🌐 SWIFT'               },
    { value: 'transfer', label: '🏦 Transferencia Bancaria' },
    { value: 'check',    label: '📝 Cheque'              },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Préstamos</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">{pagination.total || 0} registros en cartera</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Nueva Solicitud</button>
      </div>

      <div className="card p-0">
        <div className="px-5 pt-4"><Tabs tabs={TABS} active={tab} onChange={t => { setTab(t); setPage(1) }} /></div>
        <div className="p-4 border-b border-hpa-slate-2">
          <select className="select w-48" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
            <option value="">Todos los estados</option>
            {tab === 'applications'
              ? ['draft','submitted','in_review','approved','rejected','cancelled'].map(s => <option key={s} value={s}>{s}</option>)
              : ['active','overdue','defaulted','paid','written_off'].map(s => <option key={s} value={s}>{s}</option>)
            }
          </select>
        </div>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Código</th><th>Cliente</th><th>Monto</th><th>Cuotas</th><th>Propósito</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-12 text-center"><Spinner size={20} className="mx-auto" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8}><Empty icon={CreditCard} title="Sin registros" desc="Registra la primera solicitud de préstamo" /></td></tr>
              ) : items.map(item => {
                const ai = item.ai_analysis || {}
                return (
                  <tr key={item.id}>
                    <td className="font-mono text-xs font-semibold text-hpa-700">{item.application_code || item.loan_code}</td>
                    <td>
                      <p className="font-medium">{item.clients?.first_name} {item.clients?.last_name}</p>
                      <p className="text-xs text-hpa-slate-5">{item.clients?.phone_primary}</p>
                    </td>
                    <td>
                      <p className="font-numeric font-semibold">{fmtCurrency(item.amount_requested || item.principal, item.currency)}</p>
                      <p className="text-xs text-hpa-slate-5">{item.currency}</p>
                    </td>
                    <td>
                      <p className="font-semibold">{ai.total_periods || '—'} cuotas</p>
                      <p className="text-xs text-hpa-slate-5">{tipoLabel[ai.frequency] || '—'}</p>
                    </td>
                    <td className="max-w-xs truncate text-xs">{item.purpose || '—'}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td className="text-xs text-hpa-slate-5">{fmtDate(item.created_at)}</td>
                    <td>
                      <div className="flex gap-1 items-center flex-wrap">
                        {(item.status === 'submitted' || item.status === 'in_review') && (
                          <>
                            <button className="btn btn-ghost btn-sm btn-icon" title="Editar" onClick={() => openEdit(item)}><Edit2 size={13} /></button>
                            <button className="btn btn-ghost btn-sm btn-icon text-emerald-600" title="Aprobar" onClick={() => openApprove(item)}><CheckSquare size={13} /></button>
                            <button className="btn btn-ghost btn-sm btn-icon text-red-500" title="Rechazar" onClick={() => rejectApplication(item)}><XSquare size={13} /></button>
                          </>
                        )}
                        {item.status === 'approved' && (
                          <>
                            <button
                              className="btn btn-sm btn-ghost border border-amber-300 text-amber-700 hover:bg-amber-50"
                              title="Generar Pagaré Notarial"
                              onClick={() => generarPagare(item)}
                            >
                              📄 Pagaré
                            </button>
                            <button className="btn btn-sm text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100" onClick={() => openDisbursal(item)}>
                              <DollarSign size={13} /><span className="ml-1 text-xs font-semibold">Desembolsar</span>
                            </button>
                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(item)}><Edit2 size={13} /></button>
                          </>
                        )}
                        {tab === 'loans' && (
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(item)}><Edit2 size={13} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={pagination.pages} total={pagination.total} limit={20} onChange={setPage} />
      </div>

      {/* MODAL NUEVA / EDITAR SOLICITUD */}
      <Modal open={showModal} onClose={() => { setShowModal(false); setSelected(null) }}
        title={selected ? 'Editar Solicitud' : 'Nueva Solicitud de Préstamo'} size="xl"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => { setShowModal(false); setSelected(null) }}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={saving || !!analisis.error}>
              {saving ? <Spinner size={14} /> : selected ? 'Guardar Cambios' : 'Registrar Solicitud'}
            </button>
          </>
        }>
        {analisis.error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex gap-2 items-start rounded-lg"><ShieldAlert size={16} className="flex-shrink-0 mt-0.5" />{analisis.error}</div>}
        {analisis.warning && <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold flex gap-2 items-start rounded-lg"><ShieldAlert size={16} className="flex-shrink-0 mt-0.5" />{analisis.warning}</div>}
        <div className="space-y-5">
          <div>
            <p className="form-section-title">Datos del Solicitante</p>
            <div className="form-row">
              <Field label="Cliente" required>
                <select className="select" value={form.client_id || ''} onChange={e => fc('client_id', e.target.value)} disabled={!!selected}>
                  <option value="">Seleccionar cliente...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} — {c.client_code}</option>)}
                </select>
              </Field>
              <Field label="Tipo de Préstamo" required>
                <select className="select" value={form.type || 'personal'} onChange={e => fc('type', e.target.value)}>
                  <option value="personal">Personal (Corto Plazo)</option>
                  <option value="commercial">Comercial (Corto Plazo)</option>
                  <option value="business">💼 Préstamo Emprende</option>
                  <option value="vehicle">🚗 Vehículo</option>
                  <option value="mortgage">🏠 Terreno / Propiedad</option>
                </select>
              </Field>
            </div>
            {!selected && (
              <div className="mt-3">
                <Field label="Documento de Identificación">
                  <div className="flex gap-3 items-center">
                    <label className="btn btn-ghost btn-sm border border-dashed border-hpa-slate-3 cursor-pointer">
                      <Upload size={13} className="inline mr-1" />
                      {uploading ? 'Subiendo...' : idDocUrl ? 'Cambiar documento' : 'Subir Cédula / Pasaporte'}
                      <input type="file" className="hidden" accept="image/*,.pdf" onChange={e => uploadIdDoc(e.target.files[0])} disabled={uploading} />
                    </label>
                    {idDocUrl && <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle2 size={12} /> Cargado ✓</span>}
                  </div>
                </Field>
              </div>
            )}
          </div>
          <div>
            <p className="form-section-title">Condiciones del Préstamo</p>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Moneda" required>
                <select className="select" value={form.currency || 'DOP'} onChange={e => fc('currency', e.target.value)}>
                  {Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{v.flag} {k} — {v.label}</option>)}
                </select>
              </Field>
              <Field label="Monto Solicitado" required>
                <input className="input" type="number" placeholder="0.00" value={form.amount_requested || ''} onChange={e => fc('amount_requested', e.target.value)} />
              </Field>
              <Field label="Tasa Mensual (%)" required>
                <input className="input" type="number" step="0.5" placeholder="10" value={form.rate_monthly || ''} onChange={e => fc('rate_monthly', e.target.value)} />
              </Field>
              <Field label="Frecuencia de Pago" required>
                <select className="select" value={form.frequency || 'monthly'} onChange={e => { fc('frequency', e.target.value); fc('cuotas_manual', '') }}>
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quincenal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <Field label="Plazo (meses)" required>
                <input className="input" type="number" step="0.5" placeholder="2.5 o 3" value={form.term_months || ''} onChange={e => { fc('term_months', e.target.value); fc('cuotas_manual', '') }} />
              </Field>
              <Field label={`Número de Cuotas${analisis.totalCuotas ? ` (sugerido: ${analisis.totalCuotas})` : ''}`}>
                <input className="input" type="number" min="1" step="1" placeholder={`Sugerido: ${analisis.totalCuotas || '—'}`} value={form.cuotas_manual || ''} onChange={e => fc('cuotas_manual', e.target.value)} />
              </Field>
              <Field label="Ingreso Mensual Neto" required>
                <input className="input" type="number" placeholder="0.00" value={form.monthly_income || ''} onChange={e => fc('monthly_income', e.target.value)} />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Propósito del préstamo" required>
                <input className="input" placeholder="Ej: Capital de trabajo, compra de equipo..." value={form.purpose || ''} onChange={e => fc('purpose', e.target.value)} />
              </Field>
            </div>
          </div>
          {analisis.cuotas.length > 0 && (
            <div className="bg-hpa-slate-1 rounded-xl p-4 border border-hpa-slate-3 space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Calculator size={14} className="text-hpa-700" />
                  <p className="text-xs font-bold text-hpa-slate-7">Simulador — {tipoLabel[form.frequency]} · {analisis.totalCuotas} cuotas · {fmtCurrency(analisis.montoCuota, form.currency)} c/u</p>
                </div>
                <button type="button" className="text-xs text-hpa-700 font-semibold underline" onClick={() => setShowSchedule(!showSchedule)}>
                  {showSchedule ? 'Ocultar' : 'Ver cronograma'}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center bg-white p-3 rounded-lg border border-hpa-slate-2 text-xs">
                <div><p className="text-hpa-slate-5">Cuota</p><p className="font-bold text-hpa-700 font-numeric">{fmtCurrency(analisis.montoCuota, form.currency)}</p></div>
                <div><p className="text-hpa-slate-5">Interés Total</p><p className="font-bold text-amber-600 font-numeric">{fmtCurrency(analisis.totalInteres, form.currency)}</p></div>
                <div><p className="text-hpa-slate-5">Total a Pagar</p><p className="font-bold text-hpa-slate-9 font-numeric">{fmtCurrency(analisis.totalPagar, form.currency)}</p></div>
                <div><p className="text-hpa-slate-5">Capital</p><p className="font-bold text-emerald-600 font-numeric">{fmtCurrency(form.amount_requested || 0, form.currency)}</p></div>
              </div>
              {showSchedule && (
                <div className="max-h-52 overflow-y-auto bg-white rounded-lg border border-hpa-slate-2">
                  <table className="table text-[11px] w-full">
                    <thead><tr><th>#</th><th>Fecha</th><th>Cuota</th><th>Capital</th><th>Interés</th><th>Balance</th></tr></thead>
                    <tbody>
                      {analisis.cuotas.map(c => (
                        <tr key={c.num}>
                          <td>{c.num}</td>
                          <td className="font-medium text-hpa-700">{c.fechaVenc}</td>
                          <td className="font-semibold">{fmtCurrency(c.monto, form.currency)}</td>
                          <td className="text-hpa-slate-5">{fmtCurrency(c.principal, form.currency)}</td>
                          <td className="text-amber-600">{fmtCurrency(c.interes, form.currency)}</td>
                          <td className="text-hpa-slate-5">{fmtCurrency(c.saldoRestante, form.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          <Field label="Notas del Analista">
            <textarea className="input h-16 resize-none" placeholder="Observaciones, condiciones especiales..." value={form.analyst_notes || ''} onChange={e => fc('analyst_notes', e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* MODAL APROBACIÓN */}
      <Modal open={showApproveModal} onClose={() => { setShowApproveModal(false); setApproveItem(null) }}
        title="✅ Aprobar Solicitud" size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => { setShowApproveModal(false); setApproveItem(null) }}>Cancelar</button>
            <button className="btn btn-gold" onClick={approveApplication} disabled={approveSaving}>
              {approveSaving ? <Spinner size={14} /> : '✅ Aprobar Solicitud'}
            </button>
          </>
        }>
        {approveItem && (
          <div className="space-y-4">
            <div className="p-3 bg-hpa-slate-1 rounded-lg">
              <p className="font-semibold">{approveItem.clients?.first_name} {approveItem.clients?.last_name}</p>
              <p className="text-xs text-hpa-slate-5">{approveItem.application_code} · {approveItem.purpose}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Moneda">
                <select className="select" value={approveForm.currency || 'DOP'} onChange={e => afc('currency', e.target.value)}>
                  {Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{v.flag} {k}</option>)}
                </select>
              </Field>
              <Field label="Monto Aprobado" required>
                <input className="input" type="number" value={approveForm.approved_amount || ''} onChange={e => afc('approved_amount', e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Tasa Mensual (%)" required>
                <input className="input" type="number" step="0.5" value={approveForm.approved_rate || ''} onChange={e => afc('approved_rate', e.target.value)} />
              </Field>
              <Field label="Plazo (meses)">
                <input className="input" type="number" step="0.5" value={approveForm.approved_term || ''} onChange={e => { afc('approved_term', e.target.value); afc('cuotas_manual', '') }} />
              </Field>
              <Field label="Frecuencia">
                <select className="select" value={approveForm.frequency || 'monthly'} onChange={e => { afc('frequency', e.target.value); afc('cuotas_manual', '') }}>
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quincenal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </Field>
            </div>
            <Field label={`Número de Cuotas (sugerido: ${approveAnalisis.totalCuotas || '—'})`}>
              <input className="input" type="number" min="1" step="1" placeholder={`Sugerido: ${approveAnalisis.totalCuotas || '—'}`} value={approveForm.cuotas_manual || ''} onChange={e => afc('cuotas_manual', e.target.value)} />
            </Field>
            <Field label="Condiciones especiales">
              <textarea className="input h-16 resize-none" value={approveForm.conditions || ''} onChange={e => afc('conditions', e.target.value)} placeholder="Garantías, condiciones adicionales..." />
            </Field>
            {approveAnalisis.cuotas.length > 0 && (
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
                <div className="grid grid-cols-3 gap-3 text-center text-xs mb-3">
                  <div><p className="text-emerald-700">Cuota</p><p className="font-bold text-emerald-900">{fmtCurrency(approveAnalisis.montoCuota, approveForm.currency)}</p></div>
                  <div><p className="text-emerald-700">Interés Total</p><p className="font-bold text-emerald-900">{fmtCurrency(approveAnalisis.totalInteres, approveForm.currency)}</p></div>
                  <div><p className="text-emerald-700">Total a Pagar</p><p className="font-bold text-emerald-900">{fmtCurrency(approveAnalisis.totalPagar, approveForm.currency)}</p></div>
                </div>
                <div className="max-h-36 overflow-y-auto">
                  <table className="table text-[11px] w-full">
                    <thead><tr><th>#</th><th>Fecha</th><th>Cuota</th><th>Balance</th></tr></thead>
                    <tbody>
                      {approveAnalisis.cuotas.map(c => (
                        <tr key={c.num}>
                          <td>{c.num}</td>
                          <td className="font-medium text-hpa-700">{c.fechaVenc}</td>
                          <td className="font-semibold">{fmtCurrency(c.monto, approveForm.currency)}</td>
                          <td className="text-hpa-slate-5">{fmtCurrency(c.saldoRestante, approveForm.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* MODAL DESEMBOLSO */}
      <Modal open={showDisbursalModal} onClose={() => { setShowDisbursalModal(false); setDisbursalItem(null) }}
        title="💰 Desembolsar Préstamo" size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => { setShowDisbursalModal(false); setDisbursalItem(null) }}>Cancelar</button>
            <button className="btn btn-gold" onClick={executeDisbursal} disabled={disbursalSaving}>
              {disbursalSaving ? <Spinner size={14} /> : '💰 Confirmar Desembolso'}
            </button>
          </>
        }>
        {disbursalItem && (
          <div className="space-y-4">
            <div className="p-4 bg-hpa-slate-1 rounded-xl">
              <p className="font-bold text-hpa-slate-9">{disbursalItem.clients?.first_name} {disbursalItem.clients?.last_name}</p>
              <p className="text-xs text-hpa-slate-5 mb-3">{disbursalItem.application_code} · {disbursalItem.purpose}</p>
              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                <div><p className="text-hpa-slate-5">Monto Aprobado</p><p className="font-bold text-hpa-slate-9 font-numeric text-sm">{fmtCurrency(disbursalItem.approved_amount || disbursalItem.amount_requested, disbursalItem.currency)}</p></div>
                <div><p className="text-hpa-slate-5">Cuotas</p><p className="font-bold text-hpa-slate-9">{disbursalItem.ai_analysis?.total_periods || '—'}</p></div>
                <div><p className="text-hpa-slate-5">Frecuencia</p><p className="font-bold text-hpa-slate-9">{tipoLabel[disbursalItem.ai_analysis?.frequency] || '—'}</p></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha de Desembolso" required>
                <input className="input" type="date" value={disbursalForm.disbursement_date || ''} onChange={e => dfc('disbursement_date', e.target.value)} />
              </Field>
              <Field label="Moneda del Desembolso">
                <select className="select" value={disbursalForm.currency || 'DOP'} onChange={e => dfc('currency', e.target.value)}>
                  {Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{v.flag} {k} — {v.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Método de Desembolso" required>
              <div className="grid grid-cols-2 gap-2">
                {methodOptions.map(m => (
                  <div key={m.value}
                    className={`p-3 rounded-lg border-2 cursor-pointer text-sm font-medium transition-all ${disbursalForm.method === m.value ? 'border-hpa-700 bg-hpa-700/5 text-hpa-700' : 'border-hpa-slate-2 hover:border-hpa-slate-3'}`}
                    onClick={() => dfc('method', m.value)}>
                    {m.label}
                  </div>
                ))}
              </div>
            </Field>
            {disbursalForm.method !== 'cash' && (
              <Field label="Cuenta Bancaria de Origen">
                {bankAccounts.length === 0
                  ? <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">⚠️ No hay cuentas bancarias registradas.</div>
                  : <div className="space-y-2">
                      {bankAccounts.map(acc => (
                        <div key={acc.id}
                          className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${disbursalForm.bank_account_id === acc.id ? 'border-hpa-700 bg-hpa-700/5' : 'border-hpa-slate-2 hover:border-hpa-slate-3'}`}
                          onClick={() => dfc('bank_account_id', acc.id)}>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-bold text-hpa-slate-9">{acc.label}</p>
                              <p className="text-xs text-hpa-slate-5">{acc.bank_name} · {acc.account_number}</p>
                            </div>
                            <span className="badge badge-blue">{acc.currency}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                }
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Referencia / Número de Operación">
                <input className="input" placeholder="Ej: TRF-20260712..." value={disbursalForm.reference || ''} onChange={e => dfc('reference', e.target.value)} />
              </Field>
              <Field label="Notas">
                <input className="input" placeholder="Observaciones opcionales..." value={disbursalForm.notes || ''} onChange={e => dfc('notes', e.target.value)} />
              </Field>
            </div>
            {disbursalForm.method === 'cash' && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
                <Building2 size={14} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800">El desembolso en efectivo se registrará automáticamente como egreso en la caja activa.</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
