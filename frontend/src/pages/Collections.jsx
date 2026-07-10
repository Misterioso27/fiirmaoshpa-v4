import { useState, useEffect, useCallback } from 'react'
import { PhoneCall, AlertTriangle, Search } from 'lucide-react'
import { supabase, fmt, fmtDate } from '@/lib/supabase'
import { StatusBadge, Modal, Field, Pagination, Empty, Spinner } from '@/components/ui'
import useAuthStore from '@/store/auth'

const STAGE_COLORS = {
  preventive: 'badge-blue', early: 'badge-amber',
  advanced: 'badge-red', recovery: 'badge-red', legal: 'badge-red'
}
const STAGE_LABELS = {
  preventive: 'Preventiva', early: 'Temprana',
  advanced: 'Avanzada', recovery: 'Recuperación', legal: 'Legal'
}

export default function Collections() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id || 'a0000000-0000-4000-8000-000000000001'

  const [cases, setCases]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(1)
  const [pagination, setPagination] = useState({})
  const [stage, setStage]           = useState('')
  const [selected, setSelected]     = useState(null)
  const [schedule, setSchedule]     = useState([])
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [showAction, setShowAction] = useState(false)
  const [actionForm, setActionForm] = useState({})
  const [saving, setSaving]         = useState(false)
  const [payAmount, setPayAmount]   = useState('')
  const [paying, setPaying]         = useState(false)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const limit = 20
      const offset = (page - 1) * limit
      let query = supabase
        .from('collection_cases')
        .select(`
          id, stage, status, days_overdue, amount_overdue, installments_due,
          next_action_at, created_at,
          clients(id, first_name, last_name, phone_primary, national_id),
          loans(id, loan_code, balance_total, balance_principal, principal,
                payment_amount, next_payment_date, status, days_overdue)
        `, { count: 'exact' })
        .eq('company_id', companyId)
        .order('days_overdue', { ascending: false })
        .range(offset, offset + limit - 1)

      if (stage) query = query.eq('stage', stage)

      const { data, error, count } = await query
      if (!error) {
        setCases(data || [])
        setPagination({ total: count, page, limit, pages: Math.ceil((count || 0) / limit) })
      }
    } catch {}
    setLoading(false)
  }, [page, stage, companyId])

  useEffect(() => { load() }, [load])

  async function selectCase(c) {
    setSelected(c)
    setPayAmount('')
    setLoadingSchedule(true)
    try {
      const { data, error } = await supabase
        .from('loan_schedule')
        .select('*')
        .eq('loan_id', c.loans?.id)
        .order('installment_num')
      if (!error) setSchedule(data || [])
    } catch {}
    setLoadingSchedule(false)
  }

  async function applyPayment() {
    if (!payAmount || !selected) return
    setPaying(true)
    try {
      const monto = parseFloat(payAmount)
      const pendientes = schedule.filter(s => s.status === 'pending').sort((a,b) => a.installment_num - b.installment_num)
      if (!pendientes.length) throw new Error('No hay cuotas pendientes')

      const cuota = pendientes[0]
      
      // Marcar cuota como pagada
      await supabase.from('loan_schedule').update({
        total_paid: monto,
        principal_paid: cuota.principal,
        interest_paid: cuota.interest,
        status: monto >= cuota.total_due ? 'paid' : 'partial',
        paid_at: new Date().toISOString()
      }).eq('id', cuota.id)

      // Actualizar balance del préstamo
      const nuevaBalance = Math.max(0, (selected.loans?.balance_total || 0) - monto)
      await supabase.from('loans').update({
        balance_total: nuevaBalance,
        balance_principal: Math.max(0, (selected.loans?.balance_principal || 0) - cuota.principal)
      }).eq('id', selected.loans?.id)

      // Actualizar caso de cobranza
      const cuotasPagadas = schedule.filter(s => s.status === 'paid').length + 1
      const cuotasTotal = schedule.length
      await supabase.from('collection_cases').update({
        amount_overdue: nuevaBalance,
        installments_due: Math.max(0, (selected.installments_due || 0) - 1)
      }).eq('id', selected.id)

      setPayAmount('')
      await selectCase({ ...selected, loans: { ...selected.loans, balance_total: nuevaBalance } })
      load()
      alert(`✅ Pago de RD$ ${monto.toLocaleString('en-US', { minimumFractionDigits: 2 })} aplicado correctamente.\nCuota ${cuota.installment_num}/${cuotasTotal} marcada como pagada.`)
    } catch (err) { alert(err.message) }
    setPaying(false)
  }

  async function saveAction() {
    if (!actionForm.type || !actionForm.notes) return
    setSaving(true)
    try {
      await supabase.from('collection_actions').insert({
        case_id: selected.id,
        company_id: companyId,
        type: actionForm.type,
        result: actionForm.result || null,
        notes: actionForm.notes,
        next_action: actionForm.next_action || null,
        next_action_date: actionForm.next_action_date || null,
        created_by: user.id
      })
      if (actionForm.next_action_date) {
        await supabase.from('collection_cases').update({
          next_action_at: actionForm.next_action_date
        }).eq('id', selected.id)
      }
      setShowAction(false)
      setActionForm({})
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  const cuotasPagadas = schedule.filter(s => s.status === 'paid').length
  const cuotasPendientes = schedule.filter(s => s.status === 'pending').length
  const proximaCuota = schedule.find(s => s.status === 'pending')

  return (
    <div className="h-[calc(100vh-120px)] flex gap-4 animate-fade-in">
      {/* Panel izquierdo — lista de casos */}
      <div className="w-80 flex-shrink-0 flex flex-col">
        <div className="mb-3">
          <h2 className="text-lg font-bold text-hpa-slate-9">Cobranza</h2>
          <p className="text-xs text-hpa-slate-5">{pagination.total || 0} casos activos</p>
        </div>

        <div className="mb-3">
          <select className="select w-full" value={stage} onChange={e => { setStage(e.target.value); setPage(1) }}>
            <option value="">Todas las etapas</option>
            {Object.entries(STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {loading ? (
            <div className="flex justify-center py-8"><Spinner size={20} /></div>
          ) : cases.length === 0 ? (
            <Empty icon={PhoneCall} title="Sin casos" desc="No hay casos de cobranza activos" />
          ) : cases.map(c => (
            <div key={c.id}
              className={`card-sm cursor-pointer transition-all border-2 ${selected?.id === c.id ? 'border-hpa-700 bg-hpa-700/5' : 'border-transparent hover:border-hpa-slate-3'}`}
              onClick={() => selectCase(c)}>
              <div className="flex items-start justify-between mb-1">
                <p className="font-semibold text-sm text-hpa-slate-9">{c.clients?.first_name} {c.clients?.last_name}</p>
                <span className={`badge ${STAGE_COLORS[c.stage] || 'badge-gray'}`}>{STAGE_LABELS[c.stage] || c.stage}</span>
              </div>
              <p className="text-xs text-hpa-slate-5 font-mono">{c.loans?.loan_code}</p>
              <div className="flex items-center justify-between mt-2">
                <p className="text-sm font-bold font-numeric text-hpa-slate-9">
                  Balance: {fmt(c.loans?.balance_total || c.amount_overdue || 0)}
                </p>
                {c.days_overdue > 0 && (
                  <span className="text-xs font-bold text-red-500">{c.days_overdue}d mora</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Panel derecho — detalle */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="h-full flex items-center justify-center">
            <Empty icon={PhoneCall} title="Selecciona un caso" desc="Elige un cliente de la lista para ver el detalle y aplicar cobros" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header del caso */}
            <div className="card">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-hpa-slate-9">{selected.clients?.first_name} {selected.clients?.last_name}</h3>
                  <p className="text-xs text-hpa-slate-5">{selected.clients?.phone_primary} · {selected.clients?.national_id}</p>
                  <p className="text-xs font-mono text-hpa-700 mt-0.5">{selected.loans?.loan_code}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold font-numeric text-hpa-slate-9">{fmt(selected.loans?.balance_total || 0)}</p>
                  <p className="text-xs text-hpa-slate-5">Balance pendiente</p>
                  {selected.days_overdue > 0 && (
                    <span className="badge badge-red mt-1">{selected.days_overdue} días en mora</span>
                  )}
                </div>
              </div>

              {/* Resumen cuotas */}
              <div className="grid grid-cols-4 gap-3 p-3 bg-hpa-slate-1 rounded-xl">
                <div className="text-center">
                  <p className="text-xs text-hpa-slate-5">Total Cuotas</p>
                  <p className="font-bold text-hpa-slate-9">{schedule.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-hpa-slate-5">Pagadas</p>
                  <p className="font-bold text-emerald-600">{cuotasPagadas}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-hpa-slate-5">Pendientes</p>
                  <p className="font-bold text-amber-600">{cuotasPendientes}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-hpa-slate-5">Próx. Venc.</p>
                  <p className="font-bold text-hpa-700 text-xs">{proximaCuota ? fmtDate(proximaCuota.due_date) : '—'}</p>
                </div>
              </div>
            </div>

            {/* Aplicar cobro */}
            <div className="card">
              <h4 className="text-sm font-semibold text-hpa-slate-9 mb-3">Aplicar Cobro</h4>
              {proximaCuota ? (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs font-bold text-amber-800">
                      Próxima cuota #{proximaCuota.installment_num} — Vence: {fmtDate(proximaCuota.due_date)}
                    </p>
                    <p className="text-lg font-bold font-numeric text-amber-900 mt-1">
                      {fmt(proximaCuota.total_due)}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Field label="Monto a cobrar (RD$)" className="flex-1">
                      <input className="input" type="number" placeholder={proximaCuota.total_due}
                        value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                    </Field>
                    <div className="flex items-end">
                      <button className="btn btn-primary" onClick={applyPayment} disabled={paying || !payAmount}>
                        {paying ? <Spinner size={14} /> : '💰 Cobrar'}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-ghost btn-sm" onClick={() => setPayAmount(proximaCuota.total_due.toString())}>
                      Monto exacto
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setShowAction(true); setActionForm({}) }}>
                      <PhoneCall size={13} /> Registrar acción
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
                  <p className="text-sm font-bold text-emerald-800">✅ Préstamo completamente pagado</p>
                </div>
              )}
            </div>

            {/* Cronograma de cuotas */}
            <div className="card p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-hpa-slate-2">
                <h4 className="text-sm font-semibold text-hpa-slate-9">Cronograma de Pagos</h4>
              </div>
              {loadingSchedule ? (
                <div className="py-8 text-center"><Spinner size={20} className="mx-auto" /></div>
              ) : schedule.length === 0 ? (
                <Empty icon={AlertTriangle} title="Sin cronograma" desc="No hay cuotas generadas para este préstamo" />
              ) : (
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr><th>#</th><th>Fecha Venc.</th><th>Cuota</th><th>Capital</th><th>Interés</th><th>Pagado</th><th>Balance</th><th>Estado</th></tr>
                    </thead>
                    <tbody>
                      {schedule.map(s => (
                        <tr key={s.id} className={s.status === 'paid' ? 'bg-emerald-50/50' : ''}>
                          <td className="font-semibold">{s.installment_num}</td>
                          <td className={`text-xs font-medium ${new Date(s.due_date) < new Date() && s.status === 'pending' ? 'text-red-500' : 'text-hpa-700'}`}>
                            {fmtDate(s.due_date)}
                          </td>
                          <td className="font-numeric font-semibold">{fmt(s.total_due)}</td>
                          <td className="font-numeric text-xs">{fmt(s.principal)}</td>
                          <td className="font-numeric text-xs text-amber-600">{fmt(s.interest)}</td>
                          <td className="font-numeric text-xs text-emerald-600">{fmt(s.total_paid)}</td>
                          <td className="font-numeric">{fmt(s.balance)}</td>
                          <td>
                            <span className={`badge ${s.status === 'paid' ? 'badge-green' : new Date(s.due_date) < new Date() ? 'badge-red' : 'badge-amber'}`}>
                              {s.status === 'paid' ? 'PAGADO' : new Date(s.due_date) < new Date() ? 'VENCIDO' : 'PENDIENTE'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal acción de cobranza */}
      <Modal open={showAction} onClose={() => setShowAction(false)} title="Registrar Acción de Cobranza"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowAction(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveAction} disabled={saving}>
              {saving ? <Spinner size={14} /> : 'Guardar Acción'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="form-row">
            <Field label="Tipo de acción">
              <select className="select" value={actionForm.type||''} onChange={e=>setActionForm(f=>({...f,type:e.target.value}))}>
                <option value="">Seleccionar...</option>
                {['call','visit','message','email','notice','agreement','other'].map(t=><option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Resultado">
              <select className="select" value={actionForm.result||''} onChange={e=>setActionForm(f=>({...f,result:e.target.value}))}>
                <option value="">Seleccionar...</option>
                {['contact','no_contact','promise','paid','refused','rescheduled','other'].map(r=><option key={r}>{r}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Notas" required>
            <textarea className="input h-20 resize-none" value={actionForm.notes||''} onChange={e=>setActionForm(f=>({...f,notes:e.target.value}))} />
          </Field>
          <div className="form-row">
            <Field label="Próxima acción">
              <input className="input" value={actionForm.next_action||''} onChange={e=>setActionForm(f=>({...f,next_action:e.target.value}))} />
            </Field>
            <Field label="Fecha próx. acción">
              <input className="input" type="date" value={actionForm.next_action_date||''} onChange={e=>setActionForm(f=>({...f,next_action_date:e.target.value}))} />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  )
}
