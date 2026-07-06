cat > /mnt/user-data/outputs/Loans.jsx << 'ENDOFFILE'
import { useState, useEffect, useCallback } from 'react'
import { Plus, CreditCard, Calculator, Upload, ShieldAlert, CheckCircle2, Edit2, CheckSquare, XSquare } from 'lucide-react'
import { db, supabase, fmt, fmtDate } from '@/lib/supabase'
import { StatusBadge, Modal, Field, Pagination, Empty, Spinner, Tabs } from '@/components/ui'
import useAuthStore from '@/store/auth'

// ─── MOTOR DE AMORTIZACIÓN ────────────────────────────────────
function calcularEstructura({ monto, tasaMensual, meses, frecuencia, ingresoNeto }) {
  if (!monto || !tasaMensual || !meses) return { cuotas: [], error: '', warning: '', montoCuota: 0 }
  const p = parseFloat(monto)
  const rm = parseFloat(tasaMensual) / 100
  const tiempo = parseFloat(meses)
  let totalCuotas = 0, etiqueta = 'Cuota', diasPeriodo = 30
  if (frecuencia === 'weekly') {
    totalCuotas = (tiempo === 2.5) ? 10 : 12
    etiqueta = 'Semana'; diasPeriodo = 7
  } else if (frecuencia === 'biweekly') {
    totalCuotas = (tiempo === 2.5) ? 5 : 6
    etiqueta = 'Quincena'; diasPeriodo = 15
  } else {
    totalCuotas = 3; etiqueta = 'Mes'; diasPeriodo = 30
  }
  const totalInteres = p * rm
  const totalPagar = p + totalInteres
  const montoCuota = Math.round((totalPagar / totalCuotas) * 100) / 100
  let errorMsg = '', warningMsg = ''
  if (ingresoNeto && parseFloat(ingresoNeto) > 0) {
    const ingreso = parseFloat(ingresoNeto)
    const cuotaMensualEquiv = frecuencia === 'weekly' ? montoCuota * 4.333 : frecuencia === 'biweekly' ? montoCuota * 2 : montoCuota
    const limite30 = ingreso * 0.30
    const exceso = cuotaMensualEquiv - limite30
    if (cuotaMensualEquiv > limite30) {
      if (exceso <= 1000) warningMsg = `⚠️ Requiere Autorización Administrativa: Excede el 30% por RD$ ${exceso.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`
      else errorMsg = `❌ Bloqueado: Supera la capacidad de pago por RD$ ${exceso.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`
    }
  }
  const hoy = new Date()
  const listado = []
  let saldo = totalPagar
  for (let i = 1; i <= totalCuotas; i++) {
    saldo = Math.max(0, saldo - montoCuota)
    const fecha = new Date(hoy)
    fecha.setDate(hoy.getDate() + diasPeriodo * i)
    listado.push({
      num: i, label: `${etiqueta} ${i}`,
      monto: montoCuota,
      saldoRestante: Math.round(saldo * 100) / 100,
      fechaVencimiento: fecha.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }),
      fechaISO: fecha.toISOString().split('T')[0],
      pagado: false
    })
  }
  return { cuotas: listado, error: errorMsg, warning: warningMsg, montoCuota, diasPeriodo }
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
  const [form, setForm]         = useState({ type: 'personal', currency: 'DOP', frequency: 'monthly', term_months: 3, rate_monthly: 30 })
  const [approveForm, setApproveForm] = useState({})
  const [saving, setSaving]     = useState(false)
  const [approving, setApproving] = useState(false)
  const [selected, setSelected] = useState(null)
  const [clients, setClients]   = useState([])
  const [analisis, setAnalisis] = useState({ cuotas: [], error: '', warning: '', montoCuota: 0 })
  const [showSchedule, setShowSchedule] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [idDocUrl, setIdDocUrl] = useState('')

  useEffect(() => {
    setAnalisis(calcularEstructura({
      monto: form.amount_requested, tasaMensual: form.rate_monthly,
      meses: form.term_months, frecuencia: form.frequency || 'monthly',
      ingresoNeto: form.monthly_income
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

  async function fetchClients(cid) {
    try {
      const { data: cls } = await supabase
        .from('clients').select('id, first_name, last_name, client_code')
        .eq('company_id', cid).eq('status', 'active').limit(100)
      if (cls) setClients(cls)
    } catch {}
  }

  async function openNew() {
    setForm({ type: 'personal', currency: 'DOP', frequency: 'monthly', term_months: 3, rate_monthly: 30 })
    setSelected(null); setIdDocUrl(''); setShowSchedule(false); setShowModal(true)
    fetchClients(companyId)
  }

  function openEdit(item) {
    setForm({
      client_id: item.client_id, type: item.type, currency: item.currency,
      amount_requested: item.amount_requested, term_months: item.term_months,
      purpose: item.purpose, monthly_income: item.monthly_income,
      analyst_notes: item.analyst_notes,
      frequency: item.ai_analysis?.frequency || 'monthly',
      rate_monthly: item.ai_analysis?.rate_monthly || 30,
    })
    setSelected(item); setShowModal(true)
    fetchClients(companyId)
  }

  function openApprove(item) {
    setSelected(item)
    setApproveForm({
      approved_amount: item.amount_requested,
      approved_rate: item.ai_analysis?.rate_monthly || 30,
      approved_term: item.term_months,
      frequency: item.ai_analysis?.frequency || 'monthly',
      conditions: '',
    })
    setShowApproveModal(true)
  }

  function fc(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function fca(k, v) { setApproveForm(f => ({ ...f, [k]: v })) }

  function alternarCuota(index) {
    setAnalisis(prev => ({ ...prev, cuotas: prev.cuotas.map((c, i) => i === index ? { ...c, pagado: !c.pagado } : c) }))
  }

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
      setIdDocUrl(urlData.publicUrl); fc('id_doc_url', urlData.publicUrl)
    } catch { alert('Error al subir documento.') }
    setUploading(false)
  }

  async function save() {
    if (analisis.error) return
    setSaving(true)
    try {
      const requeridos = [['client_id','Cliente'],['amount_requested','Monto'],['term_months','Plazo'],['purpose','Propósito'],['monthly_income','Ingreso Mensual']]
      for (const [campo, label] of requeridos) { if (!form[campo]) throw new Error(`"${label}" es obligatorio`) }
      if (selected?.id) {
        await supabase.from('loan_applications').update({
          purpose: form.purpose, analyst_notes: form.analyst_notes || null,
          monthly_income: parseFloat(form.monthly_income), type: form.type,
        }).eq('id', selected.id).eq('status', 'submitted')
      } else {
        const estadoInicial = analisis.warning ? 'in_review' : 'submitted'
        await db.createLoanApplication({
          client_id: form.client_id, product_id: form.product_id || null,
          type: form.type || 'personal', amount_requested: parseFloat(form.amount_requested),
          currency: form.currency || 'DOP', term_months: parseFloat(form.term_months),
          purpose: form.purpose, monthly_income: parseFloat(form.monthly_income),
          monthly_expenses: form.monthly_expenses ? parseFloat(form.monthly_expenses) : null,
          analyst_notes: analisis.warning ? `[AUTORIZACIÓN REQUERIDA]: ${form.analyst_notes || ''}` : form.analyst_notes || null,
          ai_analysis: {
            frequency: form.frequency, rate_monthly: parseFloat(form.rate_monthly),
            total_periods: analisis.cuotas.length, cuota_individual: analisis.montoCuota,
            id_doc_url: idDocUrl || null, requiere_autorizacion: !!analisis.warning
          }
        }, companyId, branchId, user.id)
      }
      setShowModal(false); setSelected(null); load()
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  // ─── APROBAR SOLICITUD Y GENERAR PRÉSTAMO ────────────────────
  async function aprobar() {
    if (!selected) return
    setApproving(true)
    try {
      const monto      = parseFloat(approveForm.approved_amount)
      const tasa       = parseFloat(approveForm.approved_rate) / 100
      const plazo      = parseInt(approveForm.approved_term)
      const frecuencia = approveForm.frequency || 'monthly'

      // Calcular cuotas y cronograma
      let totalCuotas = 0, diasPeriodo = 30
      if (frecuencia === 'weekly')   { totalCuotas = (plazo <= 2.5) ? 10 : 12; diasPeriodo = 7 }
      else if (frecuencia === 'biweekly') { totalCuotas = (plazo <= 2.5) ? 5 : 6; diasPeriodo = 15 }
      else { totalCuotas = plazo; diasPeriodo = 30 }

      const totalInteres  = monto * tasa
      const totalPagar    = monto + totalInteres
      const montoCuota    = Math.round((totalPagar / totalCuotas) * 100) / 100
      const hoy           = new Date()

      // 1. Contar loans para generar código
      const { count } = await supabase.from('loans').select('*', { count: 'exact', head: true }).eq('company_id', companyId)
      const loanCode = `HPA-L-${String((count || 0) + 1).padStart(4, '0')}`

      // 2. Crear préstamo en loans
      const firstPayment = new Date(hoy); firstPayment.setDate(hoy.getDate() + diasPeriodo)
      const lastPayment  = new Date(hoy); lastPayment.setDate(hoy.getDate() + diasPeriodo * totalCuotas)

      const { data: loanData, error: loanError } = await supabase.from('loans').insert({
        company_id:      companyId,
        branch_id:       branchId,
        client_id:       selected.client_id,
        application_id:  selected.id,
        product_id:      selected.product_id || null,
        loan_code:       loanCode,
        type:            selected.type || 'personal',
        currency:        selected.currency || 'DOP',
        principal:       monto,
        rate_monthly:    parseFloat(approveForm.approved_rate),
        rate_annual:     parseFloat(approveForm.approved_rate) * 12,
        term_months:     plazo,
        payment_amount:  montoCuota,
        total_interest:  totalInteres,
        total_amount:    totalPagar,
        balance_principal: monto,
        balance_total:   totalPagar,
        disbursed_at:    hoy.toISOString(),
        first_payment_date: firstPayment.toISOString().split('T')[0],
        last_payment_date:  lastPayment.toISOString().split('T')[0],
        next_payment_date:  firstPayment.toISOString().split('T')[0],
        status:          'active',
        days_overdue:    0,
      }).select().single()

      if (loanError) throw new Error(loanError.message)

      // 3. Generar cronograma en loan_schedule
      const schedule = []
      let balance = totalPagar
      for (let i = 1; i <= totalCuotas; i++) {
        const fechaCuota = new Date(hoy)
        fechaCuota.setDate(hoy.getDate() + diasPeriodo * i)
        const interesCuota   = Math.round((balance * tasa / (frecuencia === 'monthly' ? 1 : frecuencia === 'biweekly' ? 2 : 4.333)) * 100) / 100
        const capitalCuota   = Math.round((montoCuota - interesCuota) * 100) / 100
        balance = Math.max(0, Math.round((balance - capitalCuota) * 100) / 100)
        schedule.push({
          loan_id:         loanData.id,
          installment_num: i,
          due_date:        fechaCuota.toISOString().split('T')[0],
          principal:       capitalCuota,
          interest:        interesCuota,
          total_due:       montoCuota,
          principal_paid:  0, interest_paid: 0, penalty_paid: 0, total_paid: 0,
          balance:         balance,
          status:          'pending', days_overdue: 0, penalty_amount: 0,
        })
      }
      const { error: schedError } = await supabase.from('loan_schedule').insert(schedule)
      if (schedError) throw new Error(schedError.message)

      // 4. Actualizar solicitud a approved
      await supabase.from('loan_applications').update({
        status:          'approved',
        approved_amount: monto,
        approved_rate:   parseFloat(approveForm.approved_rate),
        approved_term:   plazo,
        approved_by:     user.id,
        approved_at:     hoy.toISOString(),
        conditions:      approveForm.conditions || null,
      }).eq('id', selected.id)

      // 5. Crear caso de cobranza
      await supabase.from('collection_cases').insert({
        company_id:       companyId,
        branch_id:        branchId,
        client_id:        selected.client_id,
        loan_id:          loanData.id,
        stage:            'preventive',
        status:           'open',
        days_overdue:     0,
        amount_overdue:   0,
        installments_due: 0,
      }).select()

      setShowApproveModal(false); setSelected(null); load()
      alert(`✅ Préstamo ${loanCode} creado con ${totalCuotas} cuotas de RD$ ${montoCuota.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
    } catch (err) { alert('Error al aprobar: ' + err.message) }
    setApproving(false)
  }

  const TABS = [{ id: 'applications', label: 'Solicitudes' }, { id: 'loans', label: 'Préstamos Activos' }]
  const tipoLabel = { 'weekly': 'Semanal', 'biweekly': 'Quincenal', 'monthly': 'Mensual' }

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
              <tr><th>Código</th><th>Cliente</th><th>Monto</th><th>Plazo</th><th>Propósito</th><th>Estado</th><th>Fecha</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-12 text-center"><Spinner size={20} className="mx-auto" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8}><Empty icon={CreditCard} title="Sin registros" desc="Registra la primera solicitud" /></td></tr>
              ) : items.map(item => (
                <tr key={item.id}>
                  <td className="font-mono text-xs font-semibold text-hpa-700">{item.application_code || item.loan_code}</td>
                  <td>
                    <p className="font-medium">{item.clients?.first_name} {item.clients?.last_name}</p>
                    <p className="text-xs text-hpa-slate-5">{item.clients?.phone_primary}</p>
                  </td>
                  <td className="font-numeric">{fmt(item.amount_requested || item.principal, item.currency)}</td>
                  <td>{item.term_months} meses</td>
                  <td className="max-w-xs truncate text-xs">{item.purpose || '—'}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td className="text-xs text-hpa-slate-5">{fmtDate(item.created_at)}</td>
                  <td>
                    <div className="flex gap-1">
                      {(item.status === 'submitted' || item.status === 'in_review') && (
                        <>
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(item)} title="Editar"><Edit2 size={13} /></button>
                          <button className="btn btn-primary btn-sm" onClick={() => openApprove(item)} title="Aprobar">
                            <CheckSquare size={13} /> Aprobar
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

      {/* ─── MODAL APROBAR ─────────────────────────────────────── */}
      <Modal open={showApproveModal} onClose={() => { setShowApproveModal(false); setSelected(null) }}
        title="Aprobar Solicitud de Préstamo" size="md"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => { setShowApproveModal(false); setSelected(null) }}>Cancelar</button>
            <button className="btn btn-primary" onClick={aprobar} disabled={approving}>
              {approving ? <Spinner size={14} /> : '✅ Aprobar y Desembolsar'}
            </button>
          </>
        }>
        {selected && (
          <div className="space-y-4">
            <div className="p-3 bg-hpa-slate-1 rounded-lg text-sm">
              <p className="font-semibold">{selected.clients?.first_name} {selected.clients?.last_name}</p>
              <p className="text-hpa-slate-5 text-xs">{selected.application_code} · {selected.purpose}</p>
            </div>
            <div className="form-row">
              <Field label="Monto Aprobado" required>
                <input className="input" type="number" value={approveForm.approved_amount||''} onChange={e=>fca('approved_amount',e.target.value)} />
              </Field>
              <Field label="Tasa Mensual (%)" required>
                <input className="input" type="number" step="0.1" value={approveForm.approved_rate||''} onChange={e=>fca('approved_rate',e.target.value)} />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Plazo" required>
                <select className="select" value={approveForm.approved_term||3} onChange={e=>fca('approved_term',parseFloat(e.target.value))}>
                  <option value={2.5}>2.5 Meses</option>
                  <option value={3}>3 Meses</option>
                  <option value={6}>6 Meses</option>
                  <option value={12}>12 Meses</option>
                </select>
              </Field>
              <Field label="Frecuencia de Pago">
                <select className="select" value={approveForm.frequency||'monthly'} onChange={e=>fca('frequency',e.target.value)}>
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quincenal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </Field>
            </div>
            <Field label="Condiciones especiales">
              <textarea className="input h-16 resize-none" value={approveForm.conditions||''} onChange={e=>fca('conditions',e.target.value)} placeholder="Garantías, condiciones adicionales..." />
            </Field>
            {approveForm.approved_amount && approveForm.approved_rate && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs">
                {(() => {
                  const a = calcularEstructura({ monto: approveForm.approved_amount, tasaMensual: approveForm.approved_rate, meses: approveForm.approved_term || 3, frecuencia: approveForm.frequency || 'monthly' })
                  return (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><p className="text-hpa-slate-5">Cuota {tipoLabel[approveForm.frequency]}</p><p className="font-bold text-hpa-700">RD$ {a.montoCuota.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p></div>
                      <div><p className="text-hpa-slate-5">Total Cuotas</p><p className="font-bold">{a.cuotas.length}</p></div>
                      <div><p className="text-hpa-slate-5">Total a Pagar</p><p className="font-bold text-emerald-600">RD$ {a.cuotas.reduce((s,c)=>s+c.monto,0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p></div>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ─── MODAL NUEVA/EDITAR SOLICITUD ──────────────────────── */}
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
        {analisis.error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex gap-2 items-start rounded-lg"><ShieldAlert size={16} className="flex-shrink-0 mt-0.5" /> {analisis.error}</div>}
        {analisis.warning && <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold flex gap-2 items-start rounded-lg"><ShieldAlert size={16} className="flex-shrink-0 mt-0.5" /> {analisis.warning}</div>}

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
                <input className="input" type="number" step="0.1" value={form.rate_monthly||''} onChange={e=>fc('rate_monthly',e.target.value)} />
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
                  <option value={2.5}>2.5 Meses {form.frequency === 'weekly' ? '(10 cuotas)' : form.frequency === 'biweekly' ? '(5 cuotas)' : ''}</option>
                  <option value={3}>3 Meses {form.frequency === 'weekly' ? '(12 cuotas)' : form.frequency === 'biweekly' ? '(6 cuotas)' : '(3 cuotas)'}</option>
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
                  <p className="text-xs font-bold text-hpa-slate-7">Simulador — {tipoLabel[form.frequency]} · {analisis.cuotas.length} cuotas</p>
                </div>
                <button type="button" className="text-xs text-hpa-700 font-semibold underline" onClick={() => setShowSchedule(!showSchedule)}>
                  {showSchedule ? 'Ocultar' : 'Ver desglose con fechas'}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center bg-white p-3 rounded-lg border border-hpa-slate-2 text-xs">
                <div><p className="text-hpa-slate-5">Cuota</p><p className="font-bold text-hpa-700 font-numeric">RD$ {analisis.montoCuota.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p></div>
                <div><p className="text-hpa-slate-5">Pendientes</p><p className="font-bold text-hpa-700">{analisis.cuotas.length - cuotasPagadas} / {analisis.cuotas.length}</p></div>
                <div><p className="text-hpa-slate-5">Cobrado</p><p className="font-bold text-emerald-600">RD$ {totalCobrado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p></div>
                <div><p className="text-hpa-slate-5">Balance</p><p className="font-bold text-amber-600">RD$ {balancePendiente.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p></div>
              </div>
              {showSchedule && (
                <div className="max-h-52 overflow-y-auto bg-white rounded-lg border border-hpa-slate-2">
                  <table className="table text-[11px] w-full">
                    <thead><tr><th>Período</th><th>Fecha Venc.</th><th>Cuota</th><th>Balance</th><th>Estado</th><th>Acción</th></tr></thead>
                    <tbody>
                      {analisis.cuotas.map((c, i) => (
                        <tr key={c.num} className={c.pagado ? 'bg-emerald-50/60' : ''}>
                          <td className="font-medium">{c.label}</td>
                          <td className="text-hpa-slate-5">{c.fechaVencimiento}</td>
                          <td className="font-semibold font-numeric">RD$ {c.monto.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td className="text-hpa-slate-5 font-numeric">RD$ {c.saldoRestante.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.pagado ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{c.pagado ? 'PAGADO' : 'PENDIENTE'}</span></td>
                          <td>
                            <button type="button" onClick={() => alternarCuota(i)} className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${c.pagado ? 'bg-hpa-slate-4' : 'bg-emerald-600'}`}>
                              {c.pagado ? 'Revertir' : 'Cobrar'}
                            </button>
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
              <textarea className="input h-16 resize-none" placeholder="Observaciones, garantías..." value={form.analyst_notes||''} onChange={e=>fc('analyst_notes',e.target.value)} />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  )
}
ENDOFFILE
echo "OK: $(wc -l < /mnt/user-data/outputs/Loans.jsx) líneas"
