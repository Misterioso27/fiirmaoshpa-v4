import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, Plus, X, Calculator, Sparkles, Upload, FileCheck2 } from 'lucide-react'
import { db, supabase, fmt, fmtDate, fmtPercent } from '@/lib/supabase'
import { StatusBadge, Modal, Field, Pagination, Empty, Spinner } from '@/components/ui'
import useAuthStore from '@/store/auth'

const CURRENCIES = {
  DOP: { symbol: 'RD$', flag: '🇩🇴' },
  BRL: { symbol: 'R$',  flag: '🇧🇷' },
  USD: { symbol: '$',   flag: '🇺🇸' },
  EUR: { symbol: '€',   flag: '🇪🇺' },
  GBP: { symbol: '£',   flag: '🇬🇧' },
}

// ── Representante legal fijo de la empresa (mismo que en Pagarés de préstamos) ────
const REPRESENTANTE_LEGAL = {
  nombre: 'CÉSAR AUGUSTO DE LOS SANTOS PEREZ',
  cargo: 'Gerente de Operaciones / CEO / Co-Propietario',
  cedula: '224-0001237-7',
  direccion: '_______________________________________________', // TODO: confirmar dirección exacta de oficina
}

const FIRMA_URL = 'https://ylodmopafxauvwurfweh.supabase.co/storage/v1/object/public/documents/Firmas/a0000000-0000-4000-8000-000000000001/firma-transparente.png'
const SELLO_URL = 'https://ylodmopafxauvwurfweh.supabase.co/storage/v1/object/public/documents/Sellos/a0000000-0000-4000-8000-000000000001/sello-empresa.png'

function fmtC(amount, currency = 'DOP') {
  const c = CURRENCIES[currency] || CURRENCIES.DOP
  return `${c.symbol} ${parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Interés SIMPLE — es el producto real que se le vende al cliente:
// rendimiento fijo cada mes sobre el capital original, no se acumula sobre sí mismo.
function calcSimulatorSimple({ amount, rate, months }) {
  const p = parseFloat(amount || 0)
  const r = parseFloat(rate   || 0) / 100
  const m = parseInt(months   || 0)
  if (!p || !r || !m) return { final: 0, yieldTotal: 0, schedule: [] }

  const yieldMonthly = Math.round(p * r * 100) / 100
  const schedule = []
  let balance = p
  for (let i = 1; i <= m; i++) {
    balance = Math.round((balance + yieldMonthly) * 100) / 100
    schedule.push({ month: i, yield: yieldMonthly, balance })
  }
  return { final: balance, yieldTotal: Math.round((yieldMonthly * m) * 100) / 100, schedule }
}

// ── Interés COMPUESTO — solo para referencia interna del staff, no es el producto real
// salvo que la inversión tenga una promoción activa (promo_compound_until).
function calcSimulatorCompound({ amount, rate, months }) {
  const p  = parseFloat(amount  || 0)
  const r  = parseFloat(rate    || 0) / 100
  const m  = parseInt(months    || 0)
  if (!p || !r || !m) return { final: 0, yieldTotal: 0, schedule: [] }
  const schedule = []
  let balance = p
  for (let i = 1; i <= m; i++) {
    const yieldMonth = Math.round(balance * r * 100) / 100
    balance = Math.round((balance + yieldMonth) * 100) / 100
    schedule.push({ month: i, yield: yieldMonth, balance })
  }
  return { final: balance, yieldTotal: Math.round((balance - p) * 100) / 100, schedule }
}

function numeroALetras(n) {
  const unidades = ['','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE',
    'DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE']
  const decenas  = ['','','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA']
  const centenas = ['','CIEN','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS',
    'SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS']
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
  return { str: intToStr(parseInt(partes[0])), cents: partes[1] || '00' }
}

// ── Genera el documento de Contrato de Inversión (privado, NO es un pagaré notarial) ──
function generarContratoInversion(inv) {
  const cliente = `${inv.clients?.first_name || ''} ${inv.clients?.last_name || ''}`.trim().toUpperCase()
  const cedula  = inv.clients?.client_code || '_______________'
  const monto   = parseFloat(inv.amount || 0)
  const sym     = CURRENCIES[inv.currency]?.symbol || 'RD$'
  const { str: montoStr, cents } = numeroALetras(monto)
  const montoFormateado = monto.toLocaleString('en-US', { minimumFractionDigits: 2 })
  const hoy = new Date()
  const fmtFechaCorta = (d) => d.toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' })
  const vencimiento = inv.maturity_date ? fmtDate(inv.maturity_date) : '—'

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Contrato de Inversión — ${inv.investment_code || ''}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 13.5px; line-height: 1.8; color: #000; background: #fff; }
  .page { position: relative; max-width: 780px; margin: 0 auto; padding: 50px 60px; }
  .header { text-align: center; margin-bottom: 30px; }
  .logo-outer { border: 3px double #000; display: inline-block; padding: 10px 30px; margin-bottom: 12px; }
  .logo-name { font-size: 15px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; }
  .logo-sub  { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #333; }
  .titulo { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; margin: 16px 0 4px; text-decoration: underline; }
  .aviso { font-size: 10px; color: #999; text-align: center; margin-bottom: 16px; font-style: italic; }
  .cuerpo { text-align: justify; }
  .cuerpo p { margin-bottom: 14px; }
  .ref-box { border: 1px solid #ccc; padding: 8px 14px; font-size: 11px; color: #555; margin-bottom: 20px; display: flex; justify-content: space-between; }
  .gold-sep { border: none; border-top: 2px solid #C9A84C; margin: 20px 0; }
  .condiciones { border: 1px solid #ddd; border-radius: 6px; padding: 14px 18px; margin: 18px 0; font-size: 12px; }
  .condiciones div { display: flex; justify-content: space-between; padding: 3px 0; }
  .sello-marca { position: absolute; top: 40px; right: 45px; width: 120px; height: 120px; opacity: 0.9; pointer-events: none; }
  .firma-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 50px; margin-top: 50px; }
  .firma-box { text-align: center; }
  .firma-linea { border-top: 1px solid #000; padding-top: 8px; margin-top: 70px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
  .firma-cargo { font-size: 11px; color: #333; margin-top: 2px; }
  .firma-img-box { text-align: center; }
  .firma-img { height: 60px; object-fit: contain; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } .page { padding: 30px 40px; } }
</style>
</head>
<body>
<div class="page">
  <img src="${SELLO_URL}" class="sello-marca" alt="Sello" />
  <div class="header">
    <div class="logo-outer">
      <div class="logo-name">Financiera e Inversiones Irmaos HPA SRL</div>
      <div class="logo-sub">RNC: 133-36415-8 · Registro Mercantil: 327047SD</div>
    </div>
    <div class="titulo">Contrato de Depósito de Inversión</div>
  </div>
  <div class="aviso">Documento privado entre las partes — no constituye un instrumento notarial ni valor negociable registrado</div>
  <div class="ref-box">
    <span>Referencia: <strong>${inv.investment_code || '—'}</strong></span>
    <span>Fecha: <strong>${fmtFechaCorta(hoy)}</strong></span>
    <span>Moneda: <strong>${inv.currency}</strong></span>
  </div>
  <hr class="gold-sep">
  <div class="cuerpo">
    <p>Entre <strong>Financiera e Inversiones Irmaos HPA SRL</strong>, representada legalmente por el señor <strong>${REPRESENTANTE_LEGAL.nombre}</strong>, ${REPRESENTANTE_LEGAL.cargo}, portador de la Cédula Número <strong>${REPRESENTANTE_LEGAL.cedula}</strong> (en adelante "LA FINANCIERA"), y el/la señor/a <strong>${cliente}</strong>, código de cliente <strong>${cedula}</strong> (en adelante "EL INVERSIONISTA"), se conviene el presente Contrato de Depósito de Inversión bajo las siguientes condiciones:</p>

    <div class="condiciones">
      <div><span>Capital depositado</span><strong>${sym} ${montoFormateado}</strong></div>
      <div><span>En letras</span><strong>${montoStr} CON ${cents}/100 ${sym === 'RD$' ? 'PESOS DOMINICANOS' : ''}</strong></div>
      <div><span>Tasa de rendimiento mensual</span><strong>${inv.rate_monthly}%</strong></div>
      <div><span>Modalidad de cálculo</span><strong>Interés simple (rendimiento fijo mensual sobre el capital original)</strong></div>
      <div><span>Fecha de apertura</span><strong>${fmtDate(inv.opened_at)}</strong></div>
      <div><span>Fecha de vencimiento</span><strong>${vencimiento}</strong></div>
    </div>

    <p>EL INVERSIONISTA declara haber entregado a LA FINANCIERA la suma indicada arriba, la cual será administrada según el modelo de negocio de LA FINANCIERA, generando el rendimiento mensual pactado hasta la fecha de vencimiento o hasta que las partes acuerden su liquidación anticipada.</p>
    <p>LA FINANCIERA se compromete a informar a EL INVERSIONISTA del estado de su inversión a través de la plataforma digital de la empresa, y a realizar los pagos de rendimiento y/o liquidación de capital según las condiciones aquí pactadas.</p>
    <p>Ambas partes firman el presente contrato en señal de conformidad con lo aquí establecido.</p>
  </div>
  <div class="firma-grid">
    <div class="firma-box">
      <div class="firma-linea">${cliente}</div>
      <div class="firma-cargo">EL INVERSIONISTA</div>
    </div>
    <div class="firma-box">
      <img src="${FIRMA_URL}" class="firma-img" alt="Firma" /><br/>
      <div class="firma-linea" style="margin-top:8px">${REPRESENTANTE_LEGAL.nombre}</div>
      <div class="firma-cargo">${REPRESENTANTE_LEGAL.cargo} — LA FINANCIERA</div>
    </div>
  </div>
</div>
<script>window.onload = function() { window.print() }</script>
</body>
</html>`

  const ventana = window.open('', '_blank', 'width=900,height=750')
  if (ventana) { ventana.document.write(html); ventana.document.close() }
}

export default function Investments() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id || 'a0000000-0000-4000-8000-000000000001'
  const branchId  = user?.branch?.id  || 'b0000000-0000-4000-8000-000000000001'
  const isClient  = user?.role?.code === 'client'

  const [investments, setInvestments]   = useState([])
  const [loading, setLoading]           = useState(true)
  const [page, setPage]                 = useState(1)
  const [pagination, setPagination]     = useState({})
  const [status, setStatus]             = useState('')
  const [myClientId, setMyClientId]     = useState(null)
  const [resolvingClient, setResolvingClient] = useState(isClient)
  const [promoSavingId, setPromoSavingId] = useState(null)
  const [uploadingContractId, setUploadingContractId] = useState(null)
  const [confirmingContractId, setConfirmingContractId] = useState(null)

  // Simulador
  const [simAmount, setSimAmount]       = useState(100000)
  const [simRate, setSimRate]           = useState(3)
  const [simMonths, setSimMonths]       = useState(12)
  const [simCurrency, setSimCurrency]   = useState('BRL')
  const [showSimSchedule, setShowSimSchedule] = useState(false)
  const [simModoInterno, setSimModoInterno] = useState(false)

  // Modal nuevo depósito
  const [showModal, setShowModal]       = useState(false)
  const [clients, setClients]           = useState([])
  const [form, setForm]                 = useState({
    client_id:    '',
    currency:     'BRL',
    amount:       '',
    rate_monthly: 3,
    months:       12,
    maturity_date:'',
    notes:        '',
  })
  const [saving, setSaving]             = useState(false)
  const [formCalc, setFormCalc]         = useState({ final: 0, yieldTotal: 0, schedule: [] })

  useEffect(() => {
    if (!isClient || !user?.id) { setResolvingClient(false); return }
    (async () => {
      try {
        const c = await db.getClientByUserId(user.id)
        setMyClientId(c?.id || null)
      } catch (e) { console.error(e) }
      setResolvingClient(false)
    })()
  }, [isClient, user?.id])

  useEffect(() => {
    setFormCalc(calcSimulatorSimple({ amount: form.amount, rate: form.rate_monthly, months: form.months }))
  }, [form.amount, form.rate_monthly, form.months])

  const simCalcFn = (!isClient && simModoInterno) ? calcSimulatorCompound : calcSimulatorSimple
  const simResult = simCalcFn({ amount: simAmount, rate: simRate, months: simMonths })

  const load = useCallback(async () => {
    if (!companyId) return
    if (isClient && resolvingClient) return
    if (isClient && !myClientId) { setInvestments([]); setPagination({}); setLoading(false); return }
    setLoading(true)
    try {
      const limit  = 20
      const offset = (page - 1) * limit
      let query = supabase
        .from('investments')
        .select(`
          id, investment_code, currency, amount,
          current_balance, accrued_yield, total_yield_paid,
          rate_monthly, tier, status, opened_at, maturity_date,
          capitalization, promo_compound_until,
          signed_contract_url, signed_contract_uploaded_at, contract_confirmed,
          clients(first_name, last_name, client_code, email),
          financial_products(name, code)
        `, { count: 'exact' })
        .eq('company_id', companyId)
        .range(offset, offset + limit - 1)
        .order('opened_at', { ascending: false })

      if (status) query = query.eq('status', status)
      if (isClient && myClientId) query = query.eq('client_id', myClientId)

      const { data, error, count } = await query
      if (!error) {
        setInvestments(data || [])
        setPagination({ total: count, page, limit, pages: Math.ceil((count || 0) / limit) })
      }
    } catch (err) { console.error(err) }
    setLoading(false)
  }, [page, status, companyId, isClient, myClientId, resolvingClient])

  useEffect(() => { load() }, [load])

  async function openNew() {
    if (isClient) {
      setForm({ client_id: myClientId || '', currency: 'BRL', amount: '', rate_monthly: 3, months: 12, maturity_date: '', notes: '' })
      setShowModal(true)
      return
    }
    setForm({ client_id: '', currency: 'BRL', amount: '', rate_monthly: 3, months: 12, maturity_date: '', notes: '' })
    setShowModal(true)
    try {
      const { data } = await supabase
        .from('clients')
        .select('id, first_name, last_name, client_code')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .eq('kyc_status', 'approved')
        .order('first_name')
        .limit(100)
      setClients(data || [])
    } catch (e) { console.error(e) }
  }

  function fc(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function saveInvestment() {
    const clientIdToUse = isClient ? myClientId : form.client_id
    if (!clientIdToUse)   return alert(isClient ? 'No se pudo identificar tu registro de cliente. Contacta a soporte.' : 'Selecciona un cliente')
    if (!form.amount)     return alert('El monto es obligatorio')
    if (!form.rate_monthly) return alert('La tasa mensual es obligatoria')
    setSaving(true)
    try {
      const amount = parseFloat(String(form.amount).replace(/,/g, ''))
      if (isNaN(amount) || amount <= 0) throw new Error('Monto inválido')

      let tier = 'standard'
      const amountBRL = form.currency === 'BRL' ? amount
                      : form.currency === 'USD' ? amount * 5.5
                      : form.currency === 'DOP' ? amount * 0.095
                      : amount

      if (amountBRL >= 50000) tier = 'premium'
      if (amountBRL >= 200000) tier = 'corporate'

      const { count } = await supabase
        .from('investments')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)

      const investment_code = `HPA-I-${String((count || 0) + 1).padStart(4, '0')}`

      let maturity_date = form.maturity_date || null
      if (!maturity_date && form.months) {
        const d = new Date()
        d.setMonth(d.getMonth() + parseInt(form.months))
        maturity_date = d.toISOString().split('T')[0]
      }

      const nextYield = new Date()
      nextYield.setMonth(nextYield.getMonth() + 1)

      const { data: inv, error: invErr } = await supabase
        .from('investments')
        .insert({
          company_id:       companyId,
          branch_id:        branchId,
          investment_code,
          client_id:        clientIdToUse,
          product_id:       null,
          currency:         form.currency,
          amount,
          amount_base:      parseFloat(amountBRL.toFixed(2)),
          fx_rate_at_open:  1,
          rate_monthly:     parseFloat(form.rate_monthly),
          tier,
          capitalization:   'simple',
          status:           'active',
          opened_at:        new Date().toISOString(),
          maturity_date,
          next_yield_date:  nextYield.toISOString().split('T')[0],
          current_balance:  amount,
          accrued_yield:    0,
          total_yield_paid: 0,
          created_by:       user.id,
        })
        .select()
        .single()

      if (invErr) throw new Error(invErr.message)

      await supabase.from('investment_movements').insert({
        investment_id: inv.id,
        type:          'opening',
        amount,
        currency:      form.currency,
        fx_rate:       1,
        amount_base:   parseFloat(amountBRL.toFixed(2)),
        balance_after: amount,
        description:   `Apertura de inversión ${investment_code}`,
        created_by:    user.id,
      })

      await supabase.from('contract_snapshots').insert({
        entity_type: 'investment',
        entity_id:   inv.id,
        product_id:  null,
        snapshot: {
          rate_monthly:   parseFloat(form.rate_monthly),
          currency:       form.currency,
          amount,
          tier,
          capitalization: 'simple',
          months:         parseInt(form.months),
          maturity_date,
          notes:          form.notes || null,
        },
        fx_rate_snapshot: {
          currency:    form.currency,
          rate:        1,
          base:        'BRL',
          recorded_at: new Date().toISOString(),
        },
      })

      await supabase.from('audit_log').insert({
        company_id:  companyId,
        actor_id:    user.id,
        actor_type:  'user',
        actor_name:  user.full_name || user.email,
        action:      'CREATE_INVESTMENT',
        module:      'investments',
        record_id:   inv.id,
        record_type: 'investment',
        new_value:   { investment_code, amount, currency: form.currency, rate_monthly: form.rate_monthly, tier },
      })

      setShowModal(false)
      load()
      alert(
        `✅ Depósito registrado exitosamente.\n` +
        `Código: ${investment_code}\n` +
        `Monto: ${fmtC(amount, form.currency)}\n` +
        `Tasa: ${form.rate_monthly}% mensual (interés simple) · Tier: ${tier.toUpperCase()}\n` +
        `Vencimiento: ${maturity_date || '—'}`
      )
    } catch (err) { alert('❌ ' + err.message) }
    setSaving(false)
  }

  async function togglePromo(inv) {
    if (isClient) return
    setPromoSavingId(inv.id)
    try {
      if (inv.promo_compound_until) {
        await supabase.from('investments').update({ promo_compound_until: null }).eq('id', inv.id)
      } else {
        const meses = prompt('¿Por cuántos meses activar la promoción de interés compuesto para esta inversión?', '1')
        if (!meses) { setPromoSavingId(null); return }
        const n = parseInt(meses)
        if (!n || n <= 0) { alert('Número de meses inválido'); setPromoSavingId(null); return }
        const hasta = new Date()
        hasta.setMonth(hasta.getMonth() + n)
        await supabase.from('investments').update({ promo_compound_until: hasta.toISOString().split('T')[0] }).eq('id', inv.id)
      }
      load()
    } catch (err) { alert('❌ ' + err.message) }
    setPromoSavingId(null)
  }

  // ── FASE B: cliente sube su contrato ya firmado ───────────
  async function uploadSignedContract(inv, file) {
    if (!file) return
    setUploadingContractId(inv.id)
    try {
      const ext = file.name.split('.').pop()
      const path = `investment-docs/${companyId}/signed-contract/${inv.id}-${Date.now()}.${ext}`
      const { error: err } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
      if (err) throw err
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
      await supabase.from('investments').update({
        signed_contract_url: urlData.publicUrl,
        signed_contract_uploaded_at: new Date().toISOString(),
        contract_confirmed: false,
      }).eq('id', inv.id)
      alert('✅ Contrato firmado subido. Queda pendiente de confirmación por el equipo.')
      load()
    } catch (err) { alert('❌ Error al subir el contrato firmado: ' + err.message) }
    setUploadingContractId(null)
  }

  // ── FASE B: staff confirma el contrato recibido ───────────
  async function confirmSignedContract(inv) {
    if (isClient) return
    setConfirmingContractId(inv.id)
    try {
      await supabase.from('investments').update({
        contract_confirmed: true,
        contract_confirmed_by: user.id,
        contract_confirmed_at: new Date().toISOString(),
      }).eq('id', inv.id)
      load()
    } catch (err) { alert('❌ ' + err.message) }
    setConfirmingContractId(null)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Inversiones</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">{pagination.total || 0} depósitos{isClient ? ' propios' : ' registrados'}</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={14} /> Nuevo Depósito
        </button>
      </div>

      {/* Simulador */}
      <div className="card bg-gradient-to-r from-hpa-900 to-hpa-700 text-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-hpa-gold">
            Simulador de Rendimiento {(!isClient && simModoInterno) && <span className="text-2xs text-white/50 font-normal">(vista interna — compuesto, no es el producto real)</span>}
          </h3>
          <div className="flex items-center gap-3">
            {!isClient && (
              <button
                className="text-xs text-white/60 hover:text-white underline flex items-center gap-1"
                onClick={() => setSimModoInterno(!simModoInterno)}
              >
                <Calculator size={12} />
                {simModoInterno ? 'Ver cálculo real (simple)' : 'Ver cálculo interno (compuesto)'}
              </button>
            )}
            <button
              className="text-xs text-white/60 hover:text-white underline"
              onClick={() => setShowSimSchedule(!showSimSchedule)}
            >
              {showSimSchedule ? 'Ocultar tabla' : 'Ver tabla mensual'}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <Field label={<span className="text-white/60 text-xs">Moneda</span>}>
            <select className="input bg-white/10 border-white/20 text-white text-sm"
              value={simCurrency} onChange={e => setSimCurrency(e.target.value)}>
              {Object.entries(CURRENCIES).map(([k, v]) => (
                <option key={k} value={k}>{v.flag} {k}</option>
              ))}
            </select>
          </Field>
          <Field label={<span className="text-white/60 text-xs">Capital</span>}>
            <input className="input bg-white/10 border-white/20 text-white" type="number"
              value={simAmount} onChange={e => setSimAmount(+e.target.value)} />
          </Field>
          <Field label={<span className="text-white/60 text-xs">Tasa mensual (%)</span>}>
            <input className="input bg-white/10 border-white/20 text-white" type="number" step="0.1"
              value={simRate} onChange={e => setSimRate(+e.target.value)} />
          </Field>
          <Field label={<span className="text-white/60 text-xs">Plazo (meses)</span>}>
            <input className="input bg-white/10 border-white/20 text-white" type="number"
              value={simMonths} onChange={e => setSimMonths(+e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/20">
          <div>
            <p className="text-xs text-white/50 mb-0.5">Capital</p>
            <p className="text-lg font-bold font-numeric">{fmtC(simAmount, simCurrency)}</p>
          </div>
          <div>
            <p className="text-xs text-white/50 mb-0.5">Rendimiento Total</p>
            <p className="text-lg font-bold font-numeric text-hpa-gold">{fmtC(simResult.yieldTotal, simCurrency)}</p>
          </div>
          <div>
            <p className="text-xs text-white/50 mb-0.5">Total Final</p>
            <p className="text-lg font-bold font-numeric text-emerald-400">{fmtC(simResult.final, simCurrency)}</p>
          </div>
        </div>

        {showSimSchedule && simResult.schedule.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/20 max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-white/50">
                  <th className="text-left py-1">Mes</th>
                  <th className="text-right py-1">Rendimiento</th>
                  <th className="text-right py-1">Balance</th>
                </tr>
              </thead>
              <tbody>
                {simResult.schedule.map(s => (
                  <tr key={s.month} className="border-t border-white/10">
                    <td className="py-1 text-white/70">Mes {s.month}</td>
                    <td className="py-1 text-right text-hpa-gold font-numeric">+{fmtC(s.yield, simCurrency)}</td>
                    <td className="py-1 text-right text-emerald-400 font-numeric">{fmtC(s.balance, simCurrency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <select className="select w-40" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Todos los estados</option>
          {['active','paused','closed','liquidated'].map(s =>
            <option key={s} value={s}>{s}</option>
          )}
        </select>
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th><th>Cliente</th><th>Moneda</th><th>Monto</th>
                <th>Tasa</th><th>Saldo</th><th>Rendimiento</th>
                <th>Tier</th><th>Estado</th><th>Apertura</th><th>Vencimiento</th>
                <th>Contrato</th>
                {!isClient && <th>Promoción</th>}
              </tr>
            </thead>
            <tbody>
              {(loading || (isClient && resolvingClient)) ? (
                <tr><td colSpan={isClient ? 12 : 13} className="py-12 text-center"><Spinner size={20} className="mx-auto" /></td></tr>
              ) : investments.length === 0 ? (
                <tr><td colSpan={isClient ? 12 : 13}>
                  <Empty icon={TrendingUp} title="Sin inversiones" desc={isClient ? 'Aún no tienes depósitos registrados' : 'Registra el primer depósito'} />
                </td></tr>
              ) : investments.map(inv => {
                const promoActiva = inv.promo_compound_until && inv.promo_compound_until >= new Date().toISOString().split('T')[0]
                return (
                <tr key={inv.id}>
                  <td className="font-mono text-xs font-semibold text-hpa-700">{inv.investment_code}</td>
                  <td>
                    <p className="font-medium text-sm">{inv.clients?.first_name} {inv.clients?.last_name}</p>
                    <p className="text-xs text-hpa-slate-5">{inv.clients?.client_code}</p>
                  </td>
                  <td>
                    <span className="badge badge-blue">{inv.currency}</span>
                  </td>
                  <td className="font-numeric font-semibold">{fmtC(inv.amount, inv.currency)}</td>
                  <td className="font-numeric text-hpa-700 font-semibold">{fmtPercent ? fmtPercent(inv.rate_monthly) : `${inv.rate_monthly}%`}</td>
                  <td className="font-numeric font-semibold">{fmtC(inv.current_balance, inv.currency)}</td>
                  <td className="font-numeric text-emerald-600 font-semibold">{fmtC(inv.accrued_yield, inv.currency)}</td>
                  <td>
                    <span className={`badge ${
                      inv.tier === 'premium'   ? 'badge-gold' :
                      inv.tier === 'corporate' ? 'badge-blue' : 'badge-gray'
                    }`}>
                      {inv.tier || 'standard'}
                    </span>
                  </td>
                  <td><StatusBadge status={inv.status} /></td>
                  <td className="text-xs text-hpa-slate-5">{fmtDate(inv.opened_at)}</td>
                  <td className="text-xs text-hpa-slate-5">
                    {inv.maturity_date ? fmtDate(inv.maturity_date) : '—'}
                  </td>
                  <td>
                    {isClient ? (
                      <div className="flex flex-col gap-1.5 items-start">
                        <button
                          className="btn btn-sm btn-ghost border border-amber-300 text-amber-700 hover:bg-amber-50"
                          onClick={() => generarContratoInversion(inv)}
                        >
                          📄 Contrato
                        </button>
                        {inv.signed_contract_url ? (
                          <span className="text-2xs text-hpa-slate-5">
                            {inv.contract_confirmed ? '✅ Confirmado por la empresa' : '⏳ Subido, esperando confirmación'}
                          </span>
                        ) : (
                          <label className="btn btn-sm btn-ghost border border-hpa-slate-3 cursor-pointer">
                            <Upload size={12} className="inline mr-1" />
                            {uploadingContractId === inv.id ? 'Subiendo...' : 'Subir Firmado'}
                            <input type="file" className="hidden" accept="image/*,.pdf"
                              disabled={uploadingContractId === inv.id}
                              onChange={e => uploadSignedContract(inv, e.target.files[0])} />
                          </label>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5 items-start">
                        <button
                          className="btn btn-sm btn-ghost border border-amber-300 text-amber-700 hover:bg-amber-50"
                          onClick={() => generarContratoInversion(inv)}
                        >
                          📄 Contrato
                        </button>
                        {inv.signed_contract_url && !inv.contract_confirmed && (
                          <>
                            <a href={inv.signed_contract_url} target="_blank" rel="noreferrer"
                              className="btn btn-sm btn-ghost border border-blue-300 text-blue-700 hover:bg-blue-50">
                              Ver firmado
                            </a>
                            <button
                              className="btn btn-sm text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"
                              disabled={confirmingContractId === inv.id}
                              onClick={() => confirmSignedContract(inv)}
                            >
                              <FileCheck2 size={12} className="inline mr-1" />
                              {confirmingContractId === inv.id ? 'Confirmando...' : 'Confirmar'}
                            </button>
                          </>
                        )}
                        {inv.contract_confirmed && <span className="badge badge-green text-2xs">Confirmado</span>}
                      </div>
                    )}
                  </td>
                  {!isClient && (
                    <td>
                      <button
                        className={`btn btn-sm ${promoActiva ? 'bg-amber-50 border border-amber-300 text-amber-700' : 'btn-ghost border border-hpa-slate-3'}`}
                        disabled={promoSavingId === inv.id || inv.status !== 'active'}
                        onClick={() => togglePromo(inv)}
                        title={promoActiva ? `Activa hasta ${fmtDate(inv.promo_compound_until)}` : 'Activar promoción de interés compuesto'}
                      >
                        <Sparkles size={12} className="inline mr-1" />
                        {promoSavingId === inv.id ? '...' : promoActiva ? `Hasta ${fmtDate(inv.promo_compound_until)}` : 'Activar'}
                      </button>
                    </td>
                  )}
                </tr>
              )})}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={pagination.pages} total={pagination.total} limit={20} onChange={setPage} />
      </div>

      {/* ── MODAL NUEVO DEPÓSITO ──────────────────────────────── */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title="Nuevo Depósito de Inversión" size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveInvestment} disabled={saving}>
              {saving ? <Spinner size={14} /> : '✓ Registrar Depósito'}
            </button>
          </>
        }>
        <div className="space-y-4">
          {!isClient && (
            <Field label="Inversionista (Cliente con KYC aprobado)" required>
              <select className="select" value={form.client_id} onChange={e => fc('client_id', e.target.value)}>
                <option value="">Seleccionar cliente...</option>
                {clients.length === 0
                  ? <option disabled>No hay clientes con KYC aprobado</option>
                  : clients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.first_name} {c.last_name} — {c.client_code}
                      </option>
                    ))
                }
              </select>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Moneda del depósito" required>
              <select className="select" value={form.currency} onChange={e => fc('currency', e.target.value)}>
                {Object.entries(CURRENCIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.flag} {k} — {k === 'BRL' ? 'Real Brasileño' : k === 'DOP' ? 'Peso Dominicano' : k === 'USD' ? 'Dólar' : k === 'EUR' ? 'Euro' : 'Libra'}</option>
                ))}
              </select>
            </Field>
            <Field label={`Monto del depósito (${form.currency})`} required>
              <input className="input" type="number" step="0.01" placeholder="0.00"
                value={form.amount} onChange={e => fc('amount', e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tasa mensual (%)" required>
              <input className="input" type="number" step="0.1" placeholder="3.0"
                value={form.rate_monthly} onChange={e => fc('rate_monthly', e.target.value)} />
            </Field>
            <Field label="Plazo (meses)">
              <input className="input" type="number" min="1" placeholder="12"
                value={form.months} onChange={e => fc('months', e.target.value)} />
            </Field>
          </div>

          <Field label="Fecha de vencimiento (opcional)">
            <input className="input" type="date"
              value={form.maturity_date} onChange={e => fc('maturity_date', e.target.value)} />
          </Field>

          <Field label="Notas">
            <textarea className="input h-16 resize-none" placeholder="Condiciones especiales, observaciones..."
              value={form.notes} onChange={e => fc('notes', e.target.value)} />
          </Field>

          {form.amount && form.rate_monthly && form.months && (
            <div className="p-4 bg-hpa-slate-1 rounded-xl border border-hpa-slate-2">
              <p className="text-xs font-bold text-hpa-slate-7 mb-3 uppercase tracking-wide">
                Preview del rendimiento (interés simple)
              </p>
              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                <div>
                  <p className="text-hpa-slate-5">Capital</p>
                  <p className="font-bold text-hpa-slate-9 font-numeric">{fmtC(form.amount, form.currency)}</p>
                </div>
                <div>
                  <p className="text-hpa-slate-5">Rendimiento ({form.months}m)</p>
                  <p className="font-bold text-amber-600 font-numeric">{fmtC(formCalc.yieldTotal, form.currency)}</p>
                </div>
                <div>
                  <p className="text-hpa-slate-5">Total final</p>
                  <p className="font-bold text-emerald-600 font-numeric">{fmtC(formCalc.final, form.currency)}</p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-hpa-slate-2 text-xs text-center text-hpa-slate-5">
                Tier estimado: <strong className="text-hpa-700 uppercase">
                  {parseFloat(form.amount) >= 200000 ? 'CORPORATE' :
                   parseFloat(form.amount) >= 50000  ? 'PREMIUM' : 'STANDARD'}
                </strong>
                {form.currency !== 'BRL' && <span className="ml-2">(calculado en equivalente BRL)</span>}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
