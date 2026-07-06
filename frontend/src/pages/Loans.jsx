import { useState, useEffect, useCallback } from 'react'
import { Plus, CreditCard, Calculator, Upload, ShieldAlert, CheckCircle2, Edit2, CheckSquare, XSquare } from 'lucide-react'
import { db, supabase, fmt, fmtDate } from '@/lib/supabase'
import { StatusBadge, Modal, Field, Pagination, Empty, Spinner, Tabs } from '@/components/ui'
import useAuthStore from '@/store/auth'

function calcularEstructura({ monto, tasaMensual, meses, frecuencia, ingresoNeto, fechaInicio }) {
  if (!monto || !tasaMensual || !meses) return { cuotas: [], error: '', warning: '', montoCuota: 0, plazoTexto: '3 meses' }
  const p = parseFloat(monto)
  const rm = parseFloat(tasaMensual) / 100
  const tiempo = parseFloat(meses)
  let totalCuotas = 0
  let etiqueta = 'Cuota'
  let diasPorPeriodo = 30
  let plazoTexto = `${meses} meses`

  if (frecuencia === 'weekly') {
    totalCuotas = (tiempo === 2.5) ? 10 : 12
    etiqueta = 'Semana'
    diasPorPeriodo = 7
    plazoTexto = (tiempo === 2.5) ? '2.5 Meses (10 cuotas)' : '3 Meses (12 cuotas)'
  } else if (frecuencia === 'biweekly') {
    totalCuotas = (tiempo === 2.5) ? 5 : 6
    etiqueta = 'Quincena'
    diasPorPeriodo = 15
    plazoTexto = (tiempo === 2.5) ? '2.5 Meses (5 cuotas)' : '3 Meses (6 cuotas)'
  } else {
    totalCuotas = tiempo
    etiqueta = 'Mes'
    diasPorPeriodo = 30
  }

  const totalInteres = p * rm
  const totalPagar = p + totalInteres
  const montoCuota = Math.round((totalPagar / totalCuotas) * 100) / 100

  let errorMsg = '', warningMsg = ''
  if (ingresoNeto && parseFloat(ingresoNeto) > 0) {
    const ingreso = parseFloat(ingresoNeto)
    const cuotaMensualEquiv = frecuencia === 'weekly'
      ? montoCuota * 4.333
      : frecuencia === 'biweekly' ? montoCuota * 2 : montoCuota
    const limite30 = ingreso * 0.30
    const exceso = cuotaMensualEquiv - limite30
    if (cuotaMensualEquiv > limite30) {
      if (exceso <= 1000) {
        warningMsg = `⚠️ Requiere Autorización Administrativa: Excede el límite del 30% por RD$ ${exceso.toLocaleString('en-US', { minimumFractionDigits: 2 })}. Se guardará en revisión.`
      } else {
        errorMsg = `❌ Solicitud Bloqueada: Supera la capacidad de pago por RD$ ${exceso.toLocaleString('en-US', { minimumFractionDigits: 2 })} (límite excedido por más de RD$1,000).`
      }
    }
  }

  const base = fechaInicio ? new Date(fechaInicio) : new Date()
  const listado = []
  let saldo = totalPagar

  for (let i = 1; i <= totalCuotas; i++) {
    const fechaVenc = new Date(base.getTime())
    if (frecuencia === 'monthly') {
      fechaVenc.setMonth(fechaVenc.getMonth() + i)
    } else {
      fechaVenc.setDate(fechaVenc.getDate() + (diasPorPeriodo * i))
    }
    
    saldo = Math.max(0, saldo - montoCuota)
    listado.push({
      num: i,
      label: `${etiqueta} ${i}`,
      fechaVenc: fechaVenc.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }),
      fechaVencISO: fechaVenc.toISOString().split('T')[0],
      monto: montoCuota,
      principal: Math.round((p / totalCuotas) * 100) / 100,
      interes: Math.round((totalInteres / totalCuotas) * 100) / 100,
      saldoRestante: Math.round(saldo * 100) / 100,
      pagado: false
    })
  }

  return { cuotas: listado, error: errorMsg, warning: warningMsg, montoCuota, plazoTexto }
}

export default function Loans() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id || 'a0000000-0000-4000-8000-000000000001'
  const branchId  = user?.branch?.id  || 'b0000000-0000-4000-8000-000000000001'

  const [tab, setTab]           = useState('applications')
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(1)
  const [pagination, setPagination] = useState({})
  const [status, setStatus]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [approveItem, setApproveItem] = useState(null)
  const [approveForm, setApproveForm] = useState({})
  const [approveSaving, setApproveSaving] = useState(false)
  const [form, setForm]         = useState({ type: 'personal', currency: 'DOP', frequency: 'monthly', term_months: 3, rate_monthly: 30 })
  const [saving, setSaving]     = useState(false)
  const [selected, setSelected] = useState(null)
  const [clients, setClients]   = useState([])
  const [analisis, setAnalisis] = useState({ cuotas: [], error: '', warning: '', montoCuota: 0, plazoTexto: '3 meses' })
  const [showSchedule, setShowSchedule] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [idDocUrl, setIdDocUrl] = useState('')

  useEffect(() => {
    setAnalisis(calcularEstructura({
      monto: form.amount_requested,
      tasaMensual: form.rate_monthly,
      meses: form.term_months,
      frecuencia: form.frequency || 'monthly',
      ingresoNeto: form.monthly_income,
      fechaInicio: new Date().toISOString()
    }))
  }, [form.amount_requested, form.rate_monthly, form.term_months, form.frequency, form.monthly_income])

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
    } catch {}
    setLoading(false)
  }, [tab, page, status, companyId])

  useEffect(() => { load() }, [load])

  async function openNew() {
    const cid = companyId
    setForm({ type: 'personal', currency: 'DOP', frequency: 'monthly', term_months: 3, rate_monthly: 30 })
    setSelected(null)
    setIdDocUrl('')
    setShowSchedule(false)
    setShowModal(true)
    async function fetchClients() {
      try {
        const { data: cls, error } = await supabase
          .from('clients')
          .select('id, first_name, last_name, client_code')
          .eq('company_id', cid)
          .eq('status', 'active')
          .limit(100)
        if (!error && cls) setClients(cls)
      } catch {}
    }
    fetchClients()
  }

  function openEdit(item) {
    setForm({
      client_id: item.client_id,
      type: item.type,
      currency: item.currency,
      amount_requested: item.amount_requested,
      term_months: item.term_months,
      purpose: item.purpose,
      monthly_income: item.monthly_income,
      analyst_notes: item.analyst_notes,
      frequency: item.ai_analysis?.frequency || 'monthly',
      rate_monthly: item.ai_analysis?.rate_monthly || 30,
    })
    setSelected(item)
    setShowModal(true)
    async function fetchClients() {
      try {
        const { data: cls } = await supabase
          .from('clients').select('id, first_name, last_name, client_code')
          .eq('company_id', companyId).eq('status', 'active').limit(100)
        if (cls) setClients(cls)
      } catch {}
    }
    fetchClients()
  }

  function openApprove(item) {
    setApproveItem(item)
    setApproveForm({
      approved_amount: item.amount_requested,
      approved_rate: item.ai_analysis?.rate_monthly || 30,
      approved_term: item.term_months, // Se carga el valor original (ej: 2.5)
      frequency: item.ai_analysis?.frequency || 'monthly',
      disbursement_date: new Date().toISOString().split('T')[0],
      conditions: ''
    })
    setShowApproveModal(true)
  }

  function fc(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function afc(k, v) { setApproveForm(f => ({ ...f, [k]: v })) }

  const cuotasPagadas    = analisis.cuotas.filter(c => c.pagado).length
  const totalCobrado     = analisis.cuotas.filter(c => c.pagado).reduce((a, c) => a + c.monto, 0)
  const balancePendiente = analisis.cuotas.filter(c => !c.pagado).reduce((a, c) => a + c.monto, 0)

  async function uploadIdDoc(file) {
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `loan-docs/${companyId}/${Date.now()}.${ext}`
      const { error: err } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
      if (err) throw err
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
      setIdDocUrl(urlData.publicUrl)
      fc('id_doc_url', urlData.publicUrl)
    } catch { alert('Error al subir documento.') }
    setUploading(false)
  }

  async function save() {
    if (analisis.error) return
    setSaving(true)
    try {
      const requeridos = [
        ['client_id', 'Cliente'], ['amount_requested', 'Monto Solicitado'],
        ['term_months', 'Plazo'], ['purpose', 'Propósito'], ['monthly_income', 'Ingreso Mensual'],
      ]
      for (const [campo, label] of requeridos) {
        if (!form[campo]) throw new Error(`El campo "${label}" es obligatorio`)
      }
      
      const plazoFinalTexto = analisis.plazoTexto || `${form.term_months} meses`;
      // Truco del redondeo para que pase limpio por la columna entera de Supabase
      const plazoParaBaseDatos = form.term_months === 2.5 ? 3 : Math.round(form.term_months);

      if (selected?.id) {
        await supabase.from('loan_applications')
          .update({
            purpose: form.purpose,
            analyst_notes: form.analyst_notes || null,
            monthly_income: parseFloat(form.monthly_income),
            type: form.type,
            term_months: plazoParaBaseDatos,
            term_text: plazoFinalTexto 
          })
          .eq('id', selected.id)
      } else {
        const estadoInicial = analisis.warning ? 'in_review' : 'submitted'
        await db.createLoanApplication({
          client_id: form.client_id,
          product_id: form.product_id || null,
          type: form.type || 'personal',
          amount_requested: parseFloat(form.amount_requested),
          currency: form.currency || 'DOP',
          term_months: plazoParaBaseDatos, // Redondeado a 3 en la BD
          purpose: form.purpose,
          monthly_income: parseFloat(form.monthly_income),
          monthly_expenses: form.monthly_expenses ? parseFloat(form.monthly_expenses) : null,
          payment_capacity: form.monthly_income && form.monthly_expenses
            ? parseFloat(form.monthly_income) - parseFloat(form.monthly_expenses) : null,
          analyst_notes: analisis.warning
            ? `[AUTORIZACIÓN REQUERIDA]: ${form.analyst_notes || ''}` : form.analyst_notes || null,
          status: estadoInicial,
          term_text: plazoFinalTexto, // Aquí queda guardado "2.5 Meses" intacto para que todos lo vean
          ai_analysis: {
            frequency: form.frequency,
            rate_monthly: parseFloat(form.rate_monthly),
            total_periods: analisis.cuotas.length,
            cuota_individual: analisis.montoCuota,
            id_doc_url: idDocUrl || null,
            requiere_autorizacion: !!analisis.warning,
            cronograma: analisis.cuotas.map(c => ({
              num: c.num, fecha: c.fechaVencISO, monto: c.monto
            }))
          }
        }, companyId, branchId, user.id)
      }
      setShowModal(false)
      setSelected(null)
      load()
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  async function approveAndDisburse() {
    if (!approveItem) return
    setApproveSaving(true)
    try {
      const monto = parseFloat(approveForm.approved_amount)
      const tasa = parseFloat(approveForm.approved_rate) / 100
      const mesesOriginal = parseFloat(approveForm.approved_term) 
      const freq = approveForm.frequency
      const fechaBase = new Date(approveForm.disbursement_date + 'T00:00:00')

      // Para Supabase lo enviamos como entero (3) evitando errores de sintaxis
      const mesesParaBaseDatos = mesesOriginal === 2.5 ? 3 : Math.round(mesesOriginal)

      let totalCuotas = 0, diasPeriodo = 7
      if (freq === 'weekly') { totalCuotas = (mesesOriginal <= 2.5) ? 10 : 12; diasPeriodo = 7 }
      else if (freq === 'biweekly') { totalCuotas = (mesesOriginal <= 2.5) ? 5 : 6; diasPeriodo = 15 }
      else { totalCuotas = mesesOriginal; diasPeriodo = 30 }

      const totalInteres = monto * tasa
      const totalPagar = monto + totalInteres
      const cuotaMonto = Math.round((totalPagar / totalCuotas) * 100) / 100
      const cuotaPrincipal = Math.round((monto / totalCuotas) * 100) / 100
      const cuotaInteres = Math.round((totalInteres / totalCuotas) * 100) / 100

      await supabase.from('loan_applications').update({
        status: 'approved',
        approved_amount: monto,
        approved_rate: parseFloat(approveForm.approved_rate),
        approved_term: mesesParaBaseDatos, 
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        conditions: approveForm.conditions || null
      }).eq('id', approveItem.id)

      const primerPago = new Date(fechaBase.getTime())
      if (freq === 'monthly') primerPago.setMonth(primerPago.getMonth() + 1)
      else primerPago.setDate(primerPago.getDate() + diasPeriodo)

      const ultimoPago = new Date(fechaBase.getTime())
      if (freq === 'monthly') ultimoPago.setMonth(ultimoPago.getMonth() + totalCuotas)
      else ultimoPago.setDate(ultimoPago.getDate() + (diasPeriodo * totalCuotas))

      const { data: loanData, error: loanError } = await supabase
        .from('loans')
        .insert({
          company_id: companyId,
          branch_id: branchId,
          client_id: approveItem.client_id,
          application_id: approveItem.id,
          product_id: approveItem.product_id,
          loan_code: `HPA-L-${String(Date.now()).slice(-4)}`,
          type: approveItem.type,
          currency: approveItem.currency || 'DOP',
          principal: monto,
          rate_monthly: parseFloat(approveForm.approved_rate),
          rate_annual: parseFloat(approveForm.approved_rate) * 12,
          term_months: mesesParaBaseDatos, // Enviado como 3
          term_text: mesesOriginal === 2.5 ? '2.5 Meses' : `${mesesOriginal} Meses`, // Persiste el texto original
          payment_amount: cuotaMonto,
          total_interest: totalInteres,
          total_amount: totalPagar,
          balance_principal: monto,
          balance_total: totalPagar,
          disbursed_at: approveForm.disbursement_date,
          first_payment_date: primerPago.toISOString().split('T')[0],
          last_payment_date: ultimoPago.toISOString().split('T')[0],
          next_payment_date: primerPago.toISOString().split('T')[0],
          status: 'active',
          days_overdue: 0,
          disbursed_by: user.id
        })
        .select()
        .single()

      if (loanError) throw new Error('Error al crear préstamo: ' + loanError.message)

      const scheduleRows = []
      let acumuladoMonto = 0
      
      for (let i = 1; i <= totalCuotas; i++) {
        const fechaVenc = new Date(fechaBase.getTime())
        if (freq === 'monthly') fechaVenc.setMonth(fechaVenc.getMonth() + i)
        else fechaVenc.setDate(fechaVenc.getDate() + (diasPeriodo * i))

        const esUltima = i === totalCuotas
        const cuotaFinalMonto = esUltima ? (totalPagar - acumuladoMonto) : cuotaMonto
        acumuladoMonto += cuotaFinalMonto

        scheduleRows.push({
          loan_id: loanData.id,
          installment_num: i,
          due_date: fechaVenc.toISOString().split('T')[0],
          principal: esUltima ? (monto - (cuotaPrincipal * (totalCuotas - 1))) : cuotaPrincipal,
          interest: esUltima ? (totalInteres - (cuotaInteres * (totalCuotas - 1))) : cuotaInteres,
          total_due: Math.round(cuotaFinalMonto * 100) / 100,
          principal_paid: 0,
          interest_paid: 0,
          penalty_paid: 0,
          total_paid: 0,
          balance: Math.max(0, Math.round((totalPagar - acumuladoMonto) * 100) / 100),
          status: 'pending',
          days_overdue: 0,
          penalty_amount: 0
        })
      }

      const { error: schedError } = await supabase.from('loan_schedule').insert(scheduleRows)
      if (schedError) throw new Error('Error al crear cronograma: ' + schedError.message)

      await supabase.from('collection_cases').insert({
        company_id: companyId,
        branch_id: branchId,
        client_id: approveItem.client_id,
        loan_id: loanData.id,
        stage: 'preventive',
        status: 'open',
        days_overdue: 0,
        amount_overdue: 0,
        installments_due: 0
      })

      setShowApproveModal(false)
      setApproveItem(null)
      load()
      alert(`✅ Préstamo aprobado y desembolsado exitosamente.\nCódigo: ${loanData.loan_code}`)
    } catch (err) { alert(err.message) }
    setApproveSaving(false)
  }

  async function rejectApplication(item) {
    if (!confirm(`¿Rechazar la solicitud ${item.application_code || ''}?`)) return
    try {
      await supabase.from('loan_applications').update({
        status: 'rejected',
        rejected_by: user.id,
        rejected_at: new Date().toISOString(),
        rejection_reason: 'Rechazada por el analista'
      }).eq('id', item.id)
      load()
    } catch (err) { alert(err.message) }
  }

  const TABS = [
    { id: 'applications', label: 'Solicitudes' },
    { id: 'loans',        label: 'Préstamos Activos' },
  ]
  const tipoLabel = { 'weekly': 'Semanal', 'biweekly': 'Quincenal', 'monthly': 'Mensual' }

  const approveAnalisis = approveForm.approved_amount && approveForm.approved_rate && approveForm.approved_term
    ? calcularEstructura({
        monto: approveForm.approved_amount,
        tasaMensual: approveForm.approved_rate,
        meses: parseFloat(approveForm.approved_term),
        frecuencia: approveForm.frequency || 'monthly',
        fechaInicio: approveForm.disbursement_date
      })
    : { cuotas: [], montoCuota: 0 }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Préstamos</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">{pagination.total || 0} registros en cartera</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={15} /> Nueva Solicitud
        </button>
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
              <tr>
                <th>Código</th><th>Cliente</th><th>Monto</th>
                <th>Plazo</th><th>Propósito</th><th>Estado</th><th>Fecha</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-12 text-center"><Spinner size={20} className="mx-auto" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8}>
                  <Empty icon={CreditCard} title="Sin registros" desc="Registra la primera solicitud de préstamo" />
                </td></tr>
              ) : items.map(item => (
                <tr key={item.id}>
                  <td className="font-mono text-xs font-semibold text-hpa-700">
                    {item.application_code || item.loan_code}
                  </td>
                  <td>
                    <p className="font-medium">{item.clients?.first_name} {item.clients?.last_name}</p>
                    <p className="text-xs text-hpa-slate-5">{item.clients?.phone_primary}</p>
                  </td>
                  <td className="font-numeric">{fmt(item.amount_requested || item.principal, item.currency)}</td>
                  <td>{item.term_text || (item.term_months === 3 && item.ai_analysis?.frequency === 'weekly' ? '2.5 Meses' : `${item.term_months} meses`)}</td>
                  <td className="max-w-xs truncate text-xs">{item.purpose || '—'}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td className="text-xs text-hpa-slate-5">{fmtDate(item.created_at)}</td>
                  <td>
                    <div className="flex gap-1">
                      {(item.status === 'submitted' || item.status === 'in_review') && (
                        <>
                          <button className="btn btn-ghost btn-sm btn-icon" title="Editar" onClick={() => openEdit(item)}>
                            <Edit2 size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm btn-icon text-emerald-600" title="Aprobar y Desembolsar" onClick={() => openApprove(item)}>
                            <CheckSquare size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm btn-icon text-red-500" title="Rechazar" onClick={() => rejectApplication(item)}>
                            <XSquare size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
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
        {analisis.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex gap-2 items-start rounded-lg">
            <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" /> {analisis.error}
          </div>
        )}
        {analisis.warning && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold flex gap-2 items-start rounded-lg">
            <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" /> {analisis.warning}
          </div>
        )}
        <div className="space-y-5">
          <div>
            <p className="form-section-title">Datos del Solicitante</p>
            <div className="form-row">
              <Field label="Cliente" required>
                <select className="select" value={form.client_id||''} onChange={e=>fc('client_id',e.target.value)} disabled={!!selected}>
                  <option value="">Seleccionar cliente...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} — {c.client_code}</option>)}
                </select>
              </Field>
              <Field label="Tipo de Préstamo" required>
                <select className="select" value={form.type||'personal'} onChange={e=>fc('type',e.target.value)}>
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
                <Field label="Documento de Identificación" required>
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
            <div className="grid grid-cols-3 gap-3">
              <Field label="Monto Solicitado (RD$)" required>
                <input className="input" type="number" placeholder="0.00" value={form.amount_requested||''} onChange={e=>fc('amount_requested',e.target.value)} readOnly={!!selected} />
              </Field>
              <Field label="Tasa Mensual (%)" required>
                <input className="input" type="number" step="0.1" placeholder="3" value={form.rate_monthly||''} onChange={e=>fc('rate_monthly',e.target.value)} />
              </Field>
              <Field label="Frecuencia de Pago" required>
                <select className="select" value={form.frequency||'monthly'} onChange={e=>fc('frequency',e.target.value)}>
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quincenal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Plazo" required>
                <select className="select" value={form.term_months||3} onChange={e=>fc('term_months',parseFloat(e.target.value))}>
                  <option value={2.5}>2.5 Meses {form.frequency==='weekly'?'(10 cuotas)':form.frequency==='biweekly'?'(5 cuotas)':''}</option>
                  <option value={3}>3 Meses {form.frequency==='weekly'?'(12 cuotas)':form.frequency==='biweekly'?'(6 cuotas)':'(3 cuotas)'}</option>
                </select>
              </Field>
              <Field label="Ingreso Mensual (RD$)" required>
                <input className="input" type="number" placeholder="0.00" value={form.monthly_income||''} onChange={e=>fc('monthly_income',e.target.value)} />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Propósito del préstamo" required>
                <input className="input" placeholder="Ej: Capital de trabajo..." value={form.purpose||''} onChange={e=>fc('purpose',e.target.value)} />
              </Field>
            </div>
          </div>
          {analisis.cuotas.length > 0 && (
            <div className="bg-hpa-slate-1 rounded-xl p-4 border border-hpa-slate-3 space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Calculator size={14} className="text-hpa-700" />
                  <p className="text-xs font-bold text-hpa-slate-7">
                    Simulador — {tipoLabel[form.frequency]} · {analisis.cuotas.length} cuotas · RD$ {analisis.montoCuota.toLocaleString('en-US', { minimumFractionDigits: 2 })} c/u
                  </p>
                </div>
                <button type="button" className="text-xs text-hpa-700 font-semibold underline" onClick={() => setShowSchedule(!showSchedule)}>
                  {showSchedule ? 'Ocultar' : 'Ver cronograma con fechas'}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center bg-white p-3 rounded-lg border border-hpa-slate-2 text-xs">
                <div><p className="text-hpa-slate-5">Cuota</p><p className="font-bold text-hpa-700 font-numeric">RD$ {analisis.montoCuota.toLocaleString('en-US',{minimumFractionDigits:2})}</p></div>
                <div><p className="text-hpa-slate-5">Pendientes</p><p className="font-bold text-hpa-700">{analisis.cuotas.length - cuotasPagadas}/{analisis.cuotas.length}</p></div>
                <div><p className="text-hpa-slate-5">Cobrado</p><p className="font-bold text-emerald-600">RD$ {totalCobrado.toLocaleString('en-US',{minimumFractionDigits:2})}</p></div>
                <div><p className="text-hpa-slate-5">Balance</p><p className="font-bold text-amber-600">RD$ {balancePendiente.toLocaleString('en-US',{minimumFractionDigits:2})}</p></div>
              </div>
              {showSchedule && (
                <div className="max-h-52 overflow-y-auto bg-white rounded-lg border border-hpa-slate-2">
                  <table className="table text-[11px] w-full">
                    <thead><tr><th>#</th><th>Fecha Venc.</th><th>Cuota</th><th>Balance</th><th>Estado</th></tr></thead>
                    <tbody>
                      {analisis.cuotas.map((c) => (
                        <tr key={c.num} className={c.pagado ? 'bg-emerald-50/60' : ''}>
                          <td>{c.num}</td>
                          <td className="font-medium text-hpa-700">{c.fechaVenc}</td>
                          <td className="font-semibold">RD$ {c.monto.toLocaleString('en-US',{minimumFractionDigits:2})}</td>
                          <td className="text-hpa-slate-5">RD$ {c.saldoRestante.toLocaleString('en-US',{minimumFractionDigits:2})}</td>
                          <td>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.pagado?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-800'}`}>
                              {c.pagado?'PAGADO':'PENDIENTE'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          <div>
            <Field label="Notas del Analista">
              <textarea className="input h-16 resize-none" placeholder="Observaciones, condiciones especiales..." value={form.analyst_notes||''} onChange={e=>fc('analyst_notes',e.target.value)} />
            </Field>
          </div>
        </div>
      </Modal>

      {/* MODAL APROBACIÓN Y DESEMBOLSO */}
      <Modal open={showApproveModal} onClose={() => { setShowApproveModal(false); setApproveItem(null) }}
        title="Aprobar y Desembolsar Préstamo" size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => { setShowApproveModal(false); setApproveItem(null) }}>Cancelar</button>
            <button className="btn btn-gold" onClick={approveAndDisburse} disabled={approveSaving}>
              {approveSaving ? <Spinner size={14} /> : '✅ Aprobar y Desembolsar'}
            </button>
          </>
        }>
        {approveItem && (
          <div className="space-y-4">
            <div className="p-3 bg-hpa-slate-1 rounded-lg text-sm">
              <p className="font-semibold">{approveItem.clients?.first_name} {approveItem.clients?.last_name}</p>
              <p className="text-xs text-hpa-slate-5">{approveItem.application_code} · {approveItem.purpose}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Monto Aprobado (RD$)" required>
                <input className="input" type="number" value={approveForm.approved_amount||''} onChange={e=>afc('approved_amount',e.target.value)} />
              </Field>
              <Field label="Tasa Mensual (%)" required>
                <input className="input" type="number" step="0.1" value={approveForm.approved_rate||''} onChange={e=>afc('approved_rate',e.target.value)} />
              </Field>
              <Field label="Frecuencia">
                <select className="select" value={approveForm.frequency||'monthly'} onChange={e=>afc('frequency',e.target.value)}>
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quincenal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* Aquí se despliega la opción exacta y limpia con decimales tal como solicitaste */}
              <Field label="Plazo (meses)" required>
                <select className="select" value={approveForm.approved_term||3} onChange={e=>afc('approved_term',parseFloat(e.target.value))}>
                  <option value={2.5}>2.5 Meses</option>
                  <option value={3}>3 Meses</option>
                </select>
              </Field>
              <Field label="Fecha de Desembolso" required>
                <input className="input" type="date" value={approveForm.disbursement_date||''} onChange={e=>afc('disbursement_date',e.target.value)} />
              </Field>
            </div>
            <div>
              <Field label="Condiciones Particulares de Aprobación">
                <textarea className="input h-16 resize-none" placeholder="Ej: Retener título físico hasta saldar..." value={approveForm.conditions||''} onChange={e=>afc('conditions',e.target.value)} />
              </Field>
            </div>
            {approveAnalisis.cuotas.length > 0 && (
              <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200 text-xs">
                <p className="font-bold text-amber-900 mb-1">Vista previa del Plan de Pagos Generado:</p>
                <p className="text-amber-800 mb-2">Se registrarán {approveAnalisis.cuotas.length} cuotas fijas de <strong>RD$ {approveAnalisis.montoCuota.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>.</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
