import { useState, useEffect, useCallback } from 'react'
import { Plus, CreditCard, Calculator, Upload, ShieldAlert,
         CheckCircle2, Edit2, CheckSquare, XSquare, DollarSign, Building2 } from 'lucide-react'
import { db, supabase, fmt, fmtDate } from '@/lib/supabase'
import { StatusBadge, Modal, Field, Pagination, Empty, Spinner, Tabs } from '@/components/ui'
import useAuthStore from '@/store/auth'

// ── MONEDAS SOPORTADAS ─────────────────────────────────────────
const CURRENCIES = {
  DOP: { symbol: 'RD$', label: 'Peso Dominicano', flag: '🇩🇴' },
  BRL: { symbol: 'R$',  label: 'Real Brasileño',  flag: '🇧🇷' },
  USD: { symbol: '$',   label: 'Dólar Americano', flag: '🇺🇸' },
  EUR: { symbol: '€',   label: 'Euro',             flag: '🇪🇺' },
  GBP: { symbol: '£',   label: 'Libra Esterlina',  flag: '🇬🇧' },
}

function fmtCurrency(amount, currency = 'DOP') {
  const c = CURRENCIES[currency] || CURRENCIES.DOP
  return `${c.symbol} ${parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── CALCULADORA CORREGIDA ──────────────────────────────────────
// Fórmula HPA: Interés = Capital × (Tasa% / 100) × 3 — SIEMPRE × 3
// Total = Capital + Interés
// Cuota = Total ÷ NúmeroDeCuotas
function calcularEstructura({ monto, tasaMensual, meses, cuotasManual, frecuencia, ingresoNeto, fechaInicio, currency = 'DOP' }) {
  if (!monto || !tasaMensual) return { cuotas: [], error: '', warning: '', montoCuota: 0, totalCuotas: 0, totalInteres: 0, totalPagar: 0 }

  const p    = parseFloat(monto)
  const rm   = parseFloat(tasaMensual) / 100
  const mesesNum = parseFloat(meses) || 3

  // Cuotas sugeridas por frecuencia y plazo
  let cuotasSugeridas = 0
  let diasPorPeriodo  = 30
  let etiqueta        = 'Cuota'

  if (frecuencia === 'weekly') {
    cuotasSugeridas = mesesNum === 2.5 ? 10 : 12
    diasPorPeriodo  = 7
    etiqueta        = 'Semana'
  } else if (frecuencia === 'biweekly') {
    cuotasSugeridas = mesesNum === 2.5 ? 5 : 6
    diasPorPeriodo  = 15
    etiqueta        = 'Quincena'
  } else {
    cuotasSugeridas = Math.round(mesesNum)
    diasPorPeriodo  = 30
    etiqueta        = 'Mes'
  }

  // Si el usuario ingresó cuotas manualmente, usar ese valor
  const totalCuotas = cuotasManual && parseInt(cuotasManual) > 0
    ? parseInt(cuotasManual)
    : cuotasSugeridas

  if (totalCuotas <= 0) return { cuotas: [], error: 'Número de cuotas inválido', warning: '', montoCuota: 0, totalCuotas: 0, totalInteres: 0, totalPagar: 0 }

  // FÓRMULA CORREGIDA HPA — siempre × 3
  const totalInteres = Math.round(p * rm * 3 * 100) / 100
  const totalPagar   = Math.round((p + totalInteres) * 100) / 100
  const montoCuota   = Math.round((totalPagar / totalCuotas) * 100) / 100

  // Regla del 30%
  let errorMsg = '', warningMsg = ''
  const ingresoNum = parseFloat(String(ingresoNeto || '0').replace(/,/g, ''))
  if (ingresoNum > 0 && montoCuota > 0) {
    // Convertir cuota a equivalente mensual según frecuencia
    const cuotaMensualEq = frecuencia === 'weekly'   ? montoCuota * 4.333
                         : frecuencia === 'biweekly' ? montoCuota * 2
                         : montoCuota

    const limite30 = ingresoNum * 0.30
    const exceso   = parseFloat((cuotaMensualEq - limite30).toFixed(2))

    if (cuotaMensualEq > limite30) {
      if (exceso <= 1000) {
        warningMsg = `⚠️ Requiere Autorización Administrativa: La cuota mensual equivalente es ${fmtCurrency(cuotaMensualEq, currency)}, excede el límite del 30% (${fmtCurrency(limite30, currency)}) por ${fmtCurrency(exceso, currency)}. Se guardará en revisión.`
      } else {
        errorMsg = `❌ Solicitud Bloqueada: La cuota mensual equivalente es ${fmtCurrency(cuotaMensualEq, currency)}, supera la capacidad de pago (${fmtCurrency(limite30, currency)}) por ${fmtCurrency(exceso, currency)} — más de ${fmtCurrency(1000, currency)} sobre el límite permitido.`
      }
    }
  }

  // Generar cronograma
  const base    = fechaInicio ? new Date(fechaInicio) : new Date()
  const listado = []
  let   saldo   = totalPagar

  for (let i = 1; i <= totalCuotas; i++) {
    const fechaVenc = new Date(base)
    if (frecuencia === 'monthly') fechaVenc.setMonth(fechaVenc.getMonth() + i)
    else fechaVenc.setDate(fechaVenc.getDate() + diasPorPeriodo * i)

    saldo = i === totalCuotas ? 0 : Math.max(0, Math.round((saldo - montoCuota) * 100) / 100)

    listado.push({
      num:           i,
      label:         `${etiqueta} ${i}`,
      fechaVenc:     fechaVenc.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }),
      fechaVencISO:  fechaVenc.toISOString().split('T')[0],
      monto:         montoCuota,
      principal:     Math.round((p / totalCuotas) * 100) / 100,
      interes:       Math.round((totalInteres / totalCuotas) * 100) / 100,
      saldoRestante: saldo,
    })
  }

  return { cuotas: listado, error: errorMsg, warning: warningMsg, montoCuota, totalCuotas, totalInteres, totalPagar }
}

// ── COMPONENTE PRINCIPAL ───────────────────────────────────────
export default function Loans() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id || 'a0000000-0000-4000-8000-000000000001'
  const branchId  = user?.branch?.id  || 'b0000000-0000-4000-8000-000000000001'

  const [tab, setTab]                         = useState('applications')
  const [items, setItems]                     = useState([])
  const [loading, setLoading]                 = useState(true)
  const [page, setPage]                       = useState(1)
  const [pagination, setPagination]           = useState({})
  const [status, setStatus]                   = useState('')

  // Modales
  const [showModal, setShowModal]             = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showDisbursalModal, setShowDisbursalModal] = useState(false)
  const [approveItem, setApproveItem]         = useState(null)
  const [disbursalItem, setDisbursalItem]     = useState(null)
  const [approveForm, setApproveForm]         = useState({})
  const [disbursalForm, setDisbursalForm]     = useState({ method: 'cash', currency: 'DOP' })
  const [approveSaving, setApproveSaving]     = useState(false)
  const [disbursalSaving, setDisbursalSaving] = useState(false)
  const [bankAccounts, setBankAccounts]       = useState([])

  // Formulario solicitud
  const [form, setForm]       = useState({
    type: 'personal', currency: 'DOP',
    frequency: 'monthly', term_months: 3,
    rate_monthly: 10, cuotas_manual: ''
  })
  const [saving, setSaving]   = useState(false)
  const [selected, setSelected] = useState(null)
  const [clients, setClients]   = useState([])
  const [analisis, setAnalisis] = useState({ cuotas: [], error: '', warning: '', montoCuota: 0, totalCuotas: 0, totalInteres: 0, totalPagar: 0 })
  const [showSchedule, setShowSchedule] = useState(false)
  const [uploading, setUploading]       = useState(false)
  const [idDocUrl, setIdDocUrl]         = useState('')

  // Recalcular análisis en tiempo real
  useEffect(() => {
    setAnalisis(calcularEstructura({
      monto:        form.amount_requested,
      tasaMensual:  form.rate_monthly,
      meses:        form.term_months,
      cuotasManual: form.cuotas_manual,
      frecuencia:   form.frequency || 'monthly',
      ingresoNeto:  form.monthly_income,
      fechaInicio:  new Date().toISOString(),
      currency:     form.currency || 'DOP',
    }))
  }, [form.amount_requested, form.rate_monthly, form.term_months, form.frequency, form.monthly_income, form.cuotas_manual, form.currency])

  // Recalcular análisis del modal de aprobación
  const approveAnalisis = approveForm.approved_amount && approveForm.approved_rate
    ? calcularEstructura({
        monto:        approveForm.approved_amount,
        tasaMensual:  approveForm.approved_rate,
        meses:        approveForm.approved_term || 3,
        cuotasManual: approveForm.cuotas_manual,
        frecuencia:   approveForm.frequency || 'monthly',
        fechaInicio:  approveForm.disbursement_date,
        currency:     approveForm.currency || 'DOP',
      })
    : { cuotas: [], montoCuota: 0, totalCuotas: 0, totalInteres: 0, totalPagar: 0 }

  // ── Carga de datos ─────────────────────────────────────────
  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      if (tab === 'applications') {
        const data = await db.getLoanApplications({ page, limit: 20, status, companyId })
        setItems(data.applications || [])
        setPagination(data.pagination || {})
      } else {
        const data = await db.getLoans({ page, limit: 20, status, companyId })
        setItems(data.loans || [])
        setPagination(data.pagination || {})
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
      const { data: cls } = await supabase
        .from('clients').select('id, first_name, last_name, client_code')
        .eq('company_id', companyId).eq('status', 'active').limit(100)
      if (cls) setClients(cls)
    } catch (e) { console.error(e) }
  }

  async function fetchBankAccounts() {
    try {
      const { data } = await supabase
        .from('bank_accounts')
        .select('id, label, bank_name, account_number, currency, is_primary, pix_key, swift_bic, routing_aba')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('is_primary', { ascending: false })
      if (data) setBankAccounts(data)
    } catch (e) { console.error(e) }
  }

  async function openNew() {
    setForm({ type: 'personal', currency: 'DOP', frequency: 'monthly', term_months: 3, rate_monthly: 10, cuotas_manual: '' })
    setSelected(null); setIdDocUrl(''); setShowSchedule(false); setShowModal(true)
    await fetchClients()
  }

  async function openEdit(item) {
    setForm({
      client_id:       item.client_id,
      type:            item.type,
      currency:        item.currency || 'DOP',
      amount_requested:item.amount_requested,
      term_months:     item.term_months,
      purpose:         item.purpose,
      monthly_income:  item.monthly_income,
      analyst_notes:   item.analyst_notes,
      frequency:       item.ai_analysis?.frequency    || 'monthly',
      rate_monthly:    item.ai_analysis?.rate_monthly || 10,
      cuotas_manual:   item.ai_analysis?.total_periods || '',
    })
    setSelected(item); setShowModal(true)
    await fetchClients()
  }

  function openApprove(item) {
    setApproveItem(item)
    setApproveForm({
      approved_amount:   item.amount_requested,
      approved_rate:     item.ai_analysis?.rate_monthly || 10,
      approved_term:     item.term_months,
      frequency:         item.ai_analysis?.frequency    || 'monthly',
      currency:          item.currency || 'DOP',
      cuotas_manual:     item.ai_analysis?.total_periods || '',
      disbursement_date: new Date().toISOString().split('T')[0],
      conditions:        '',
    })
    setShowApproveModal(true)
  }

  async function uploadIdDoc(file) {
    if (!file) return
    setUploading(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = `loan-docs/${companyId}/${Date.now()}.${ext}`
      const { error: err } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
      if (err) throw err
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
      setIdDocUrl(urlData.publicUrl)
      fc('id_doc_url', urlData.publicUrl)
    } catch { alert('Error al subir documento.') }
    setUploading(false)
  }

  // ── GUARDAR SOLICITUD ─────────────────────────────────────
  async function save() {
    if (analisis.error) return
    setSaving(true)
    try {
      const requeridos = [
        ['client_id','Cliente'], ['amount_requested','Monto'],
        ['term_months','Plazo'], ['purpose','Propósito'], ['monthly_income','Ingreso'],
      ]
      for (const [campo, label] of requeridos) {
        if (!form[campo]) throw new Error(`El campo "${label}" es obligatorio`)
      }

      if (selected?.id) {
        await supabase.from('loan_applications').update({
          purpose: form.purpose, analyst_notes: form.analyst_notes || null,
          monthly_income: parseFloat(form.monthly_income), type: form.type,
        }).eq('id', selected.id)
      } else {
        const estadoInicial = analisis.warning ? 'in_review' : 'submitted'
        await db.createLoanApplication({
          client_id:        form.client_id,
          product_id:       form.product_id || null,
          type:             form.type || 'personal',
          amount_requested: parseFloat(form.amount_requested),
          currency:         form.currency || 'DOP',
          term_months:      parseFloat(form.term_months),
          purpose:          form.purpose,
          monthly_income:   parseFloat(form.monthly_income),
          monthly_expenses: form.monthly_expenses ? parseFloat(form.monthly_expenses) : null,
          payment_capacity: form.monthly_income && form.monthly_expenses
            ? parseFloat(form.monthly_income) - parseFloat(form.monthly_expenses) : null,
          analyst_notes: analisis.warning
            ? `[AUTORIZACIÓN REQUERIDA]: ${form.analyst_notes || ''}` : form.analyst_notes || null,
          ai_analysis: {
            frequency:             form.frequency,
            rate_monthly:          parseFloat(form.rate_monthly),
            total_periods:         analisis.totalCuotas,
            cuota_individual:      analisis.montoCuota,
            total_interes:         analisis.totalInteres,
            total_pagar:           analisis.totalPagar,
            id_doc_url:            idDocUrl || null,
            requiere_autorizacion: !!analisis.warning,
            cronograma:            analisis.cuotas.map(c => ({
              num: c.num, fecha: c.fechaVencISO, monto: c.monto,
            })),
          },
          status: estadoInicial,
        }, companyId, branchId, user.id)
      }
      setShowModal(false); setSelected(null); load()
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  // ── APROBAR SOLICITUD (sin desembolsar aún) ───────────────
  async function approveApplication() {
    if (!approveItem || approveAnalisis.error) return
    setApproveSaving(true)
    try {
      await supabase.from('loan_applications').update({
        status:          'approved',
        approved_amount: parseFloat(approveForm.approved_amount),
        approved_rate:   parseFloat(approveForm.approved_rate),
        approved_term:   parseFloat(approveForm.approved_term),
        approved_by:     user.id,
        approved_at:     new Date().toISOString(),
        conditions:      approveForm.conditions || null,
        ai_analysis:     {
          ...(approveItem.ai_analysis || {}),
          frequency:        approveForm.frequency,
          rate_monthly:     parseFloat(approveForm.approved_rate),
          total_periods:    approveAnalisis.totalCuotas,
          cuota_individual: approveAnalisis.montoCuota,
          total_interes:    approveAnalisis.totalInteres,
          total_pagar:      approveAnalisis.totalPagar,
        },
      }).eq('id', approveItem.id)

      setShowApproveModal(false)
      setApproveItem(null)
      load()
      alert(`✅ Solicitud aprobada.\nAhora puedes proceder al desembolso desde la tabla.`)
    } catch (err) { alert('❌ ' + err.message) }
    setApproveSaving(false)
  }

  // ── ABRIR MODAL DE DESEMBOLSO ─────────────────────────────
  async function openDisbursal(item) {
    setDisbursalItem(item)
    setDisbursalForm({
      method:            'cash',
      currency:          item.currency || item.ai_analysis?.currency || 'DOP',
      bank_account_id:   '',
      reference:         '',
      notes:             '',
      disbursement_date: new Date().toISOString().split('T')[0],
    })
    setShowDisbursalModal(true)
    await fetchBankAccounts()
  }

  // ── EJECUTAR DESEMBOLSO ────────────────────────────────────
  async function executeDisbursal() {
    if (!disbursalItem) return
    setDisbursalSaving(true)
    try {
      const item     = disbursalItem
      const ai       = item.ai_analysis || {}
      const monto    = parseFloat(item.approved_amount || item.amount_requested)
      const tasa     = parseFloat(item.approved_rate   || ai.rate_monthly || 10)
      const mesesNum = parseFloat(item.approved_term   || item.term_months || 3)
      const freq     = ai.frequency || 'monthly'
      const currency = disbursalForm.currency || item.currency || 'DOP'

      // Recalcular con la fórmula correcta
      const calc = calcularEstructura({
        monto, tasaMensual: tasa, meses: mesesNum,
        cuotasManual: ai.total_periods,
        frecuencia: freq, currency,
        fechaInicio: disbursalForm.disbursement_date,
      })

      if (calc.cuotas.length === 0) throw new Error('Error en el cálculo del cronograma')

      const totalCuotas    = calc.totalCuotas
      const cuotaMonto     = calc.montoCuota
      const cuotaPrincipal = Math.round((monto / totalCuotas) * 100) / 100
      const cuotaInteres   = Math.round((calc.totalInteres / totalCuotas) * 100) / 100
      const diasPeriodo    = freq === 'weekly' ? 7 : freq === 'biweekly' ? 15 : 30
      const fechaBase      = new Date(disbursalForm.disbursement_date)

      const primerPago = new Date(fechaBase)
      if (freq === 'monthly') primerPago.setMonth(primerPago.getMonth() + 1)
      else primerPago.setDate(primerPago.getDate() + diasPeriodo)

      const ultimoPago = new Date(fechaBase)
      if (freq === 'monthly') ultimoPago.setMonth(ultimoPago.getMonth() + totalCuotas)
      else ultimoPago.setDate(ultimoPago.getDate() + diasPeriodo * totalCuotas)

      // Código secuencial
      const { count: loanCount } = await supabase
        .from('loans').select('*', { count: 'exact', head: true }).eq('company_id', companyId)
      const loan_code = `HPA-L-${String((loanCount || 0) + 1).padStart(4, '0')}`

      // 1. Crear préstamo
      const { data: loanData, error: loanError } = await supabase.from('loans').insert({
        company_id:         companyId,
        branch_id:          branchId,
        client_id:          item.client_id,
        application_id:     item.id,
        product_id:         item.product_id || null,
        loan_code,
        type:               item.type,
        currency,
        principal:          monto,
        rate_monthly:       tasa,
        rate_annual:        tasa * 12,
        term_months:        mesesNum,
        payment_amount:     cuotaMonto,
        total_interest:     calc.totalInteres,
        total_amount:       calc.totalPagar,
        origination_fee:    0,
        balance_principal:  monto,
        balance_interest:   0,
        balance_penalties:  0,
        balance_total:      calc.totalPagar,
        disbursed_at:       disbursalForm.disbursement_date,
        first_payment_date: primerPago.toISOString().split('T')[0],
        last_payment_date:  ultimoPago.toISOString().split('T')[0],
        next_payment_date:  primerPago.toISOString().split('T')[0],
        status:             'active',
        days_overdue:       0,
        disbursed_by:       user.id,
      }).select().single()

      if (loanError) throw new Error('Error al crear préstamo: ' + loanError.message)

      // 2. Cronograma
      const { error: schedError } = await supabase.from('loan_schedule').insert(
        calc.cuotas.map(c => ({
          loan_id:         loanData.id,
          installment_num: c.num,
          due_date:        c.fechaVencISO,
          principal:       c.principal,
          interest:        c.interes,
          total_due:       c.monto,
          principal_paid:  0,
          interest_paid:   0,
          penalty_paid:    0,
          total_paid:      0,
          balance:         c.saldoRestante,
          status:          'pending',
          days_overdue:    0,
          penalty_amount:  0,
        }))
      )
      if (schedError) throw new Error('Error al crear cronograma: ' + schedError.message)

      // 3. Caso de cobranza
      await supabase.from('collection_cases').insert({
        company_id:       companyId,
        branch_id:        branchId,
        client_id:        item.client_id,
        loan_id:          loanData.id,
        stage:            'preventive',
        status:           'open',
        days_overdue:     0,
        amount_overdue:   0,
        installments_due: 0,
      })

      // 4. Registrar desembolso en caja si hay sesión abierta
      if (disbursalForm.method === 'cash') {
        const { data: openSession } = await supabase
          .from('cash_sessions')
          .select('id, opening_balance, total_income, total_expense')
          .eq('status', 'open')
          .eq('register_id', (
            await supabase.from('cash_registers')
              .select('id').eq('company_id', companyId)
              .eq('status', 'open').limit(1).single()
              .then(r => r.data?.id)
          ))
          .single()

        if (openSession) {
          const { count: mvCount } = await supabase
            .from('cash_movements')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', openSession.id)

          const current = (openSession.opening_balance || 0) +
                          (openSession.total_income    || 0) -
                          (openSession.total_expense   || 0)

          await supabase.from('cash_movements').insert({
            session_id:     openSession.id,
            company_id:     companyId,
            movement_number:`MV-${String((mvCount || 0) + 1).padStart(4, '0')}`,
            type:           'expense',
            category:       'loan_disbursement',
            reference_type: 'loan',
            reference_id:   loanData.id,
            amount:         monto,
            currency,
            fx_rate:        1,
            amount_base:    monto,
            balance_after:  Math.max(0, current - monto),
            description:    `Desembolso préstamo ${loan_code} — ${item.clients?.first_name || ''} ${item.clients?.last_name || ''}`,
            client_id:      item.client_id,
            created_by:     user.id,
          })
        }
      }

      // 5. Registrar transferencia bancaria si aplica
      if (disbursalForm.method !== 'cash' && disbursalForm.bank_account_id) {
        const { count: trfCount } = await supabase
          .from('bank_transfers')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', companyId)

        await supabase.from('bank_transfers').insert({
          company_id:      companyId,
          transfer_code:   `TRF-${String((trfCount || 0) + 1).padStart(5, '0')}`,
          from_account_id: disbursalForm.bank_account_id,
          amount:          monto,
          currency,
          fx_rate:         1,
          amount_base:     monto,
          fees:            0,
          type:            disbursalForm.method,
          reference:       disbursalForm.reference || loan_code,
          description:     `Desembolso préstamo ${loan_code}`,
          status:          'completed',
          reference_type:  'loan',
          reference_id:    loanData.id,
          client_id:       item.client_id,
          initiated_by:    user.id,
          approved_by:     user.id,
          executed_at:     new Date().toISOString(),
        })
      }

      setShowDisbursalModal(false)
      setDisbursalItem(null)
      load()

      alert(
        `✅ Préstamo desembolsado exitosamente.\n` +
        `Código: ${loan_code}\n` +
        `Monto: ${fmtCurrency(monto, currency)}\n` +
        `${totalCuotas} cuotas de ${fmtCurrency(cuotaMonto, currency)}\n` +
        `Método: ${disbursalForm.method === 'cash' ? 'Efectivo' : disbursalForm.method.toUpperCase()}`
      )
    } catch (err) { alert('❌ ' + err.message) }
    setDisbursalSaving(false)
  }

  async function rejectApplication(item) {
    if (!confirm(`¿Rechazar la solicitud ${item.application_code}?`)) return
    try {
      await supabase.from('loan_applications').update({
        status:           'rejected',
        rejected_by:      user.id,
        rejected_at:      new Date().toISOString(),
        rejection_reason: 'Rechazada por el analista',
      }).eq('id', item.id)
      load()
    } catch (err) { alert(err.message) }
  }

  const tipoLabel = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }
  const TABS = [{ id: 'applications', label: 'Solicitudes' }, { id: 'loans', label: 'Préstamos Activos' }]

  const methodOptions = [
    { value: 'cash',     label: '💵 Efectivo' },
    { value: 'pix',      label: '⚡ PIX' },
    { value: 'swift',    label: '🌐 SWIFT' },
    { value: 'transfer', label: '🏦 Transferencia Bancaria' },
    { value: 'check',    label: '📝 Cheque' },
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
        <div className="px-5 pt-4">
          <Tabs tabs={TABS} active={tab} onChange={t => { setTab(t); setPage(1) }} />
        </div>
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
                const cuotas = ai.total_periods || '—'
                const freq   = tipoLabel[ai.frequency] || '—'
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
                      <p className="font-semibold">{cuotas} cuotas</p>
                      <p className="text-xs text-hpa-slate-5">{freq}</p>
                    </td>
                    <td className="max-w-xs truncate text-xs">{item.purpose || '—'}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td className="text-xs text-hpa-slate-5">{fmtDate(item.created_at)}</td>
                    <td>
                      <div className="flex gap-1 items-center">
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
                              className="btn btn-sm text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"
                              onClick={() => openDisbursal(item)}
                            >
                              <DollarSign size={13} />
                              <span className="ml-1 text-xs font-semibold">Desembolsar</span>
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

      {/* ── MODAL NUEVA / EDITAR SOLICITUD ─────────────────── */}
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
        {analisis.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex gap-2 items-start rounded-lg">
            <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" />{analisis.error}
          </div>
        )}
        {analisis.warning && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold flex gap-2 items-start rounded-lg">
            <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" />{analisis.warning}
          </div>
        )}
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
                  {Object.entries(CURRENCIES).map(([k, v]) =>
                    <option key={k} value={k}>{v.flag} {k} — {v.label}</option>
                  )}
                </select>
              </Field>
              <input className="input" type="number" placeholder="0.00"
  value={form.amount_requested || ''} onChange={e => fc('amount_requested', e.target.value)} />
              </Field>
              <Field label="Tasa Mensual (%)" required>
                <input className="input" type="number" step="0.5" placeholder="10"
                  value={form.rate_monthly || ''} onChange={e => fc('rate_monthly', e.target.value)} />
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
                <input className="input" type="number" step="0.5" placeholder="2.5 o 3"
                  value={form.term_months || ''} onChange={e => { fc('term_months', e.target.value); fc('cuotas_manual', '') }} />
              </Field>
              <Field label={`Número de Cuotas ${analisis.totalCuotas ? `(sugerido: ${calcularEstructura({ monto: form.amount_requested, tasaMensual: form.rate_monthly, meses: form.term_months, frecuencia: form.frequency, currency: form.currency }).totalCuotas})` : ''}`}>
                <input className="input" type="number" min="1" step="1"
                  placeholder={`Sugerido: ${analisis.totalCuotas || '—'}`}
                  value={form.cuotas_manual || ''}
                  onChange={e => fc('cuotas_manual', e.target.value)} />
              </Field>
              <Field label="Ingreso Mensual Neto" required>
                <input className="input" type="number" placeholder="0.00"
                  value={form.monthly_income || ''} onChange={e => fc('monthly_income', e.target.value)} />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Propósito del préstamo" required>
                <input className="input" placeholder="Ej: Capital de trabajo, compra de equipo..."
                  value={form.purpose || ''} onChange={e => fc('purpose', e.target.value)} />
              </Field>
            </div>
          </div>

          {/* Simulador */}
          {analisis.cuotas.length > 0 && (
            <div className="bg-hpa-slate-1 rounded-xl p-4 border border-hpa-slate-3 space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Calculator size={14} className="text-hpa-700" />
                  <p className="text-xs font-bold text-hpa-slate-7">
                    Simulador — {tipoLabel[form.frequency]} · {analisis.totalCuotas} cuotas · {fmtCurrency(analisis.montoCuota, form.currency)} c/u
                  </p>
                </div>
                <button type="button" className="text-xs text-hpa-700 font-semibold underline" onClick={() => setShowSchedule(!showSchedule)}>
                  {showSchedule ? 'Ocultar' : 'Ver cronograma'}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center bg-white p-3 rounded-lg border border-hpa-slate-2 text-xs">
                <div>
                  <p className="text-hpa-slate-5">Cuota</p>
                  <p className="font-bold text-hpa-700 font-numeric">{fmtCurrency(analisis.montoCuota, form.currency)}</p>
                </div>
                <div>
                  <p className="text-hpa-slate-5">Interés Total</p>
                  <p className="font-bold text-amber-600 font-numeric">{fmtCurrency(analisis.totalInteres, form.currency)}</p>
                </div>
                <div>
                  <p className="text-hpa-slate-5">Total a Pagar</p>
                  <p className="font-bold text-hpa-slate-9 font-numeric">{fmtCurrency(analisis.totalPagar, form.currency)}</p>
                </div>
                <div>
                  <p className="text-hpa-slate-5">Capital</p>
                  <p className="font-bold text-emerald-600 font-numeric">{fmtCurrency(form.amount_requested || 0, form.currency)}</p>
                </div>
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
            <textarea className="input h-16 resize-none" placeholder="Observaciones, condiciones especiales..."
              value={form.analyst_notes || ''} onChange={e => fc('analyst_notes', e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* ── MODAL APROBACIÓN ───────────────────────────────── */}
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
              <input className="input" type="number" min="1" step="1"
                placeholder={`Sugerido: ${approveAnalisis.totalCuotas || '—'}`}
                value={approveForm.cuotas_manual || ''} onChange={e => afc('cuotas_manual', e.target.value)} />
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

      {/* ── MODAL DESEMBOLSO ──────────────────────────────── */}
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
            {/* Resumen */}
            <div className="p-4 bg-hpa-slate-1 rounded-xl">
              <p className="font-bold text-hpa-slate-9">{disbursalItem.clients?.first_name} {disbursalItem.clients?.last_name}</p>
              <p className="text-xs text-hpa-slate-5 mb-3">{disbursalItem.application_code} · {disbursalItem.purpose}</p>
              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                <div>
                  <p className="text-hpa-slate-5">Monto Aprobado</p>
                  <p className="font-bold text-hpa-slate-9 font-numeric text-sm">
                    {fmtCurrency(disbursalItem.approved_amount || disbursalItem.amount_requested, disbursalItem.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-hpa-slate-5">Cuotas</p>
                  <p className="font-bold text-hpa-slate-9">{disbursalItem.ai_analysis?.total_periods || '—'}</p>
                </div>
                <div>
                  <p className="text-hpa-slate-5">Frecuencia</p>
                  <p className="font-bold text-hpa-slate-9">{tipoLabel[disbursalItem.ai_analysis?.frequency] || '—'}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha de Desembolso" required>
                <input className="input" type="date" value={disbursalForm.disbursement_date || ''}
                  onChange={e => dfc('disbursement_date', e.target.value)} />
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

            {/* Si no es efectivo, mostrar cuentas bancarias */}
            {disbursalForm.method !== 'cash' && (
              <Field label="Cuenta Bancaria de Origen">
                {bankAccounts.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    ⚠️ No hay cuentas bancarias registradas. Ve a Cuentas Bancarias para agregar una.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {bankAccounts.map(acc => (
                      <div key={acc.id}
                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${disbursalForm.bank_account_id === acc.id ? 'border-hpa-700 bg-hpa-700/5' : 'border-hpa-slate-2 hover:border-hpa-slate-3'}`}
                        onClick={() => dfc('bank_account_id', acc.id)}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold text-hpa-slate-9">{acc.label}</p>
                            <p className="text-xs text-hpa-slate-5">{acc.bank_name} · {acc.account_number}</p>
                            {acc.pix_key && <p className="text-xs text-hpa-slate-5">PIX: {acc.pix_key}</p>}
                            {acc.swift_bic && <p className="text-xs text-hpa-slate-5">SWIFT: {acc.swift_bic}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`badge ${acc.currency === 'BRL' ? 'badge-green' : acc.currency === 'USD' ? 'badge-blue' : 'badge-gray'}`}>{acc.currency}</span>
                            {acc.is_primary && <span className="text-xs text-amber-600">⭐ Principal</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Referencia / Número de Operación">
                <input className="input" placeholder="Ej: TRF-20260712..."
                  value={disbursalForm.reference || ''} onChange={e => dfc('reference', e.target.value)} />
              </Field>
              <Field label="Notas">
                <input className="input" placeholder="Observaciones opcionales..."
                  value={disbursalForm.notes || ''} onChange={e => dfc('notes', e.target.value)} />
              </Field>
            </div>

            {/* Aviso caja */}
            {disbursalForm.method === 'cash' && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
                <Building2 size={14} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800">
                  El desembolso en efectivo se registrará automáticamente como egreso en la caja activa.
                  Si no hay caja abierta, el préstamo se crea pero el movimiento de caja deberá registrarse manualmente.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
