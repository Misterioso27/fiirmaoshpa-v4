import { useState, useEffect, useCallback } from 'react'
import { PhoneCall, AlertTriangle, RotateCcw, CheckCircle2, XCircle } from 'lucide-react'
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

  const [cases, setCases]                   = useState([])
  const [loading, setLoading]               = useState(true)
  const [page, setPage]                     = useState(1)
  const [pagination, setPagination]         = useState({})
  const [stage, setStage]                   = useState('')
  const [selected, setSelected]             = useState(null)
  const [schedule, setSchedule]             = useState([])
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [showAction, setShowAction]         = useState(false)
  const [actionForm, setActionForm]         = useState({})
  const [saving, setSaving]                 = useState(false)
  const [payAmount, setPayAmount]           = useState('')
  const [paying, setPaying]                 = useState(false)
  const [showRevert, setShowRevert]         = useState(false)
  const [revertTarget, setRevertTarget]     = useState(null)
  const [revertReason, setRevertReason]     = useState('')
  const [reverting, setReverting]           = useState(false)
  const [revertHistory, setRevertHistory]   = useState([])

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const limit  = 20
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
    } catch (e) { console.error(e) }
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
    } catch (e) { console.error(e) }
    setLoadingSchedule(false)
  }

  async function reloadSchedule() {
    if (!selected?.loans?.id) return
    try {
      const { data } = await supabase
        .from('loan_schedule')
        .select('*')
        .eq('loan_id', selected.loans.id)
        .order('installment_num')
      if (data) setSchedule(data)
      const { data: loanData } = await supabase
        .from('loans')
        .select('id, loan_code, balance_total, balance_principal, principal, payment_amount, next_payment_date, status, days_overdue')
        .eq('id', selected.loans.id)
        .single()
      if (loanData) {
        setSelected(prev => ({ ...prev, loans: loanData }))
        setCases(prev => prev.map(c => c.id === selected.id ? { ...c, loans: loanData } : c))
      }
    } catch (e) { console.error(e) }
  }

  async function applyPayment() {
    if (!payAmount || !selected) return
    setPaying(true)
    try {
      const monto = parseFloat(String(payAmount).replace(/,/g, '').replace(/[^0-9.]/g, ''))
      if (isNaN(monto) || monto <= 0) throw new Error('Monto inválido')
      const pendientes = schedule
        .filter(s => s.status === 'pending' || s.status === 'overdue')
        .sort((a, b) => a.installment_num - b.installment_num)
      if (!pendientes.length) throw new Error('No hay cuotas pendientes')
      const cuota = pendientes[0]
      const nuevoStatus = monto >= cuota.total_due ? 'paid' : 'partial'
      const { error: schedErr } = await supabase
        .from('loan_schedule')
        .update({
          total_paid:     monto,
          principal_paid: Math.min(cuota.principal, monto),
          interest_paid:  Math.max(0, Math.min(cuota.interest, monto - cuota.principal)),
          status:         nuevoStatus,
          paid_at:        new Date().toISOString()
        })
        .eq('id', cuota.id)
      if (schedErr) throw new Error('Error al actualizar cuota: ' + schedErr.message)
      const nuevoBalanceTotal     = Math.max(0, (selected.loans?.balance_total || 0) - monto)
      const nuevoBalancePrincipal = Math.max(0, (selected.loans?.balance_principal || 0) - Math.min(cuota.principal, monto))
      const loanStatus = nuevoBalanceTotal <= 0 ? 'paid' : (selected.loans?.status || 'active')
      const { error: loanErr } = await supabase
        .from('loans')
        .update({
          balance_total:     nuevoBalanceTotal,
          balance_principal: nuevoBalancePrincipal,
          status:            loanStatus,
          updated_at:        new Date().toISOString()
        })
        .eq('id', selected.loans?.id)
      if (loanErr) throw new Error('Error al actualizar préstamo: ' + loanErr.message)
      const cuotasPendientesRestantes = schedule.filter(s =>
        s.id !== cuota.id && (s.status === 'pending' || s.status === 'overdue')
      ).length
      await supabase.from('collection_cases').update({
        amount_overdue:   nuevoBalanceTotal,
        installments_due: cuotasPendientesRestantes,
        updated_at:       new Date().toISOString()
      }).eq('id', selected.id)
      setRevertHistory(prev => [...prev, {
        scheduleId: cuota.id, installmentNum: cuota.installment_num,
        montoPagado: monto, balanceAntes: selected.loans?.balance_total || 0,
        balanceDespues: nuevoBalanceTotal, principalAntes: selected.loans?.balance_principal || 0,
        statusAntes: cuota.status, timestamp: new Date().toISOString(),
        loanId: selected.loans?.id, caseId: selected.id,
      }])
      await reloadSchedule()
      load()
      setPayAmount('')
      alert(
        `✅ Pago aplicado correctamente.\n` +
        `Cuota #${cuota.installment_num} — Monto: ${fmt(monto)}\n` +
        `Balance restante: ${fmt(nuevoBalanceTotal)}\n` +
        `${loanStatus === 'paid' ? '🎉 Préstamo completamente cancelado.' : ''}`
      )
    } catch (err) { alert('❌ ' + err.message) }
    setPaying(false)
  }

  function openRevert(cuota) {
    setRevertTarget(cuota)
    setRevertReason('')
    setShowRevert(true)
  }

  async function executeRevert() {
    if (!revertTarget || !revertReason.trim()) {
      alert('⚠️ Debes ingresar el motivo de la reversión')
      return
    }
    setReverting(true)
    try {
      const cuota = revertTarget
      const montoPagado = cuota.total_paid || 0
      const { error: schedErr } = await supabase
        .from('loan_schedule')
        .update({
          total_paid: 0, principal_paid: 0, interest_paid: 0, penalty_paid: 0,
          status: new Date(cuota.due_date) < new Date() ? 'overdue' : 'pending',
          paid_at: null,
        })
        .eq('id', cuota.id)
      if (schedErr) throw new Error('Error al revertir cuota: ' + schedErr.message)
      const balanceRestaurado   = (selected.loans?.balance_total || 0) + montoPagado
      const principalRestaurado = (selected.loans?.balance_principal || 0) + (cuota.principal_paid || 0)
      const { error: loanErr } = await supabase
        .from('loans')
        .update({
          balance_total:     parseFloat(balanceRestaurado.toFixed(2)),
          balance_principal: parseFloat(principalRestaurado.toFixed(2)),
          status:            'active',
          updated_at:        new Date().toISOString()
        })
        .eq('id', selected.loans?.id)
      if (loanErr) throw new Error('Error al restaurar balance: ' + loanErr.message)
      await supabase.from('collection_cases').update({
        amount_overdue: balanceRestaurado,
        updated_at:     new Date().toISOString()
      }).eq('id', selected.id)
      await supabase.from('collection_actions').insert({
        case_id: selected.id, company_id: companyId,
        type: 'other', result: 'other',
        notes: `REVERSIÓN de pago — Cuota #${cuota.installment_num} — Monto: ${fmt(montoPagado)} — Motivo: ${revertReason}`,
        created_by: user?.id,
      })
      setRevertHistory(prev => prev.filter(r => r.scheduleId !== cuota.id))
      setShowRevert(false)
      setRevertTarget(null)
      setRevertReason('')
      await reloadSchedule()
      load()
      alert(
        `↩️ Reversión aplicada correctamente.\n` +
        `Cuota #${cuota.installment_num} vuelve a estado pendiente.\n` +
        `Balance restaurado: ${fmt(balanceRestaurado)}\n` +
        `Motivo registrado: "${revertReason}"`
      )
    } catch (err) { alert('❌ Error en la reversión: ' + err.message) }
    setReverting(false)
  }

  async function saveAction() {
    if (!actionForm.type || !actionForm.notes) return
    setSaving(true)
    try {
      await supabase.from('collection_actions').insert({
        case_id: selected.id, company_id: companyId,
        type: actionForm.type, result: actionForm.result || null,
        notes: actionForm.notes, next_action: actionForm.next_action || null,
        next_action_date: actionForm.next_action_date || null, created_by: user?.id,
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

  const cuotasPagadas    = schedule.filter(s => s.status === 'paid').length
  const cuotasPendientes = schedule.filter(s => s.status === 'pending' || s.status === 'overdue').length
  const proximaCuota     = schedule.find(s => s.status === 'pending' || s.status === 'overdue')

  return (
    <div className="h-[calc(100vh-120px)] flex gap-4 animate-fade-in">
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
                <p className="text-sm font-bold font-numeric text-hpa-slate-9">{fmt(c.loans?.balance_total || c.amount_overdue || 0)}</p>
                {c.days_overdue > 0 && <span className="text-xs font-bold text-red-500">{c.days_overdue}d mora</span>}
              </div>
            </div>
          ))}
        </div>
        {pagination.pages > 1 && (
          <div className="mt-3">
            <Pagination page={page} pages={pagination.pages} total={pagination.total} limit={20} onChange={setPage} />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="h-full flex items-center justify-center">
            <Empty icon={PhoneCall} title="Selecciona un caso" desc="Elige un cliente de la lista para ver el detalle y aplicar cobros" />
          </div>
        ) : (
          <div className="space-y-4">
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
                  {selected.days_overdue > 0 && <span className="badge badge-red mt-1">{selected.days_overdue} días en mora</span>}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3 p-3 bg-hpa-slate-1 rounded-xl">
                <div className="text-center"><p className="text-xs text-hpa-slate-5">Total Cuotas</p><p className="font-bold text-hpa-slate-9">{schedule.length}</p></div>
                <div className="text-center"><p className="text-xs text-hpa-slate-5">Pagadas</p><p className="font-bold text-emerald-600">{cuotasPagadas}</p></div>
                <div className="text-center"><p className="text-xs text-hpa-slate-5">Pendientes</p><p className="font-bold text-amber-600">{cuotasPendientes}</p></div>
                <div className="text-center"><p className="text-xs text-hpa-slate-5">Próx. Venc.</p><p className="font-bold text-hpa-700 text-xs">{proximaCuota ? fmtDate(proximaCuota.due_date) : '—'}</p></div>
              </div>
            </div>

            <div className="card">
              <h4 className="text-sm font-semibold text-hpa-slate-9 mb-3">Aplicar Cobro</h4>
              {proximaCuota ? (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs font-bold text-amber-800">Próxima cuota #{proximaCuota.installment_num} — Vence: {fmtDate(proximaCuota.due_date)}</p>
                    <p className="text-lg font-bold font-numeric text-amber-900 mt-1">{fmt(proximaCuota.total_due)}</p>
                  </div>
                  <div className="flex gap-3">
                    <Field label="Monto a cobrar (RD$)" className="flex-1">
                      <input className="input" type="number" step="0.01"
                        placeholder={proximaCuota.total_due} value={payAmount}
                        onChange={e => setPayAmount(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && applyPayment()} />
                    </Field>
                    <div className="flex items-end">
                      <button className="btn btn-primary" onClick={applyPayment} disabled={paying || !payAmount}>
                        {paying ? <Spinner size={14} /> : '💰 Cobrar'}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-ghost btn-sm" onClick={() => setPayAmount(String(proximaCuota.total_due))}>Monto exacto</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setShowAction(true); setActionForm({}) }}><PhoneCall size={13} /> Registrar acción</button>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
                  <p className="text-sm font-bold text-emerald-800">✅ Préstamo completamente pagado</p>
                </div>
              )}
            </div>

            <div className="card p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-hpa-slate-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-hpa-slate-9">Cronograma de Pagos</h4>
                <p className="text-xs text-hpa-slate-5">Cuotas pagadas pueden revertirse con ↩️</p>
              </div>
              {loadingSchedule ? (
                <div className="py-8 text-center"><Spinner size={20} className="mx-auto" /></div>
              ) : schedule.length === 0 ? (
                <Empty icon={AlertTriangle} title="Sin cronograma" desc="No hay cuotas generadas para este préstamo" />
              ) : (
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr><th>#</th><th>Fecha Venc.</th><th>Cuota</th><th>Capital</th><th>Interés</th><th>Pagado</th><th>Balance</th><th>Estado</th><th>↩️</th></tr>
                    </thead>
                    <tbody>
                      {schedule.map(s => {
                        const isOverdue = new Date(s.due_date) < new Date() && s.status !== 'paid'
                        const isPaid    = s.status === 'paid'
                        const isPartial = s.status === 'partial'
                        const balanceNeg = parseFloat(s.balance) < 0
                        return (
                          <tr key={s.id} className={isPaid ? 'bg-emerald-50/50' : isPartial ? 'bg-blue-50/30' : isOverdue ? 'bg-red-50/20' : ''}>
                            <td className="font-semibold">{s.installment_num}</td>
                            <td className={`text-xs font-medium ${isOverdue ? 'text-red-500 font-bold' : 'text-hpa-700'}`}>{fmtDate(s.due_date)}</td>
                            <td className="font-numeric font-semibold">{fmt(s.total_due)}</td>
                            <td className="font-numeric text-xs">{fmt(s.principal)}</td>
                            <td className="font-numeric text-xs text-amber-600">{fmt(s.interest)}</td>
                            <td className={`font-numeric text-xs ${isPaid || isPartial ? 'text-emerald-600 font-semibold' : 'text-hpa-slate-4'}`}>{fmt(s.total_paid)}</td>
                            <td className={`font-numeric ${balanceNeg ? 'text-red-500 font-bold' : ''}`}>
                              {balanceNeg ? `(${fmt(Math.abs(s.balance))})` : fmt(Math.max(0, s.balance))}
                            </td>
                            <td>
                              <span className={`badge ${isPaid ? 'badge-green' : isPartial ? 'badge-blue' : isOverdue ? 'badge-red' : 'badge-amber'}`}>
                                {isPaid ? 'PAGADO' : isPartial ? 'PARCIAL' : isOverdue ? 'VENCIDO' : 'PENDIENTE'}
                              </span>
                            </td>
                            <td>
                              {(isPaid || isPartial) && (
                                <button
                                  className="btn btn-ghost btn-sm btn-icon text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                  title={`Revertir pago cuota #${s.installment_num}`}
                                  onClick={() => openRevert(s)}
                                >
                                  <RotateCcw size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL REVERSIÓN */}
      <Modal open={showRevert}
        onClose={() => { setShowRevert(false); setRevertTarget(null); setRevertReason('') }}
        title="↩️ Revertir Pago"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => { setShowRevert(false); setRevertTarget(null); setRevertReason('') }}>Cancelar</button>
            <button className="btn btn-danger" onClick={executeRevert} disabled={reverting || !revertReason.trim()}>
              {reverting ? <Spinner size={14} /> : '↩️ Confirmar Reversión'}
            </button>
          </>
        }>
        {revertTarget && (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2">
              <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-800">Esta acción revertirá el pago registrado.</p>
                <p className="text-xs text-amber-700 mt-0.5">La cuota volverá a pendiente y el balance será restaurado. Queda registrado en auditoría.</p>
              </div>
            </div>
            <div className="p-3 bg-hpa-slate-1 rounded-lg">
              <p className="text-xs font-bold text-hpa-slate-7 uppercase tracking-wide mb-2">Detalle del pago a revertir</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><p className="text-hpa-slate-5">Cuota</p><p className="font-bold text-hpa-slate-9">#{revertTarget.installment_num}</p></div>
                <div><p className="text-hpa-slate-5">Vencimiento</p><p className="font-bold text-hpa-slate-9">{fmtDate(revertTarget.due_date)}</p></div>
                <div><p className="text-hpa-slate-5">Monto pagado</p><p className="font-bold text-emerald-600">{fmt(revertTarget.total_paid)}</p></div>
                <div><p className="text-hpa-slate-5">Estado actual</p><p className="font-bold text-hpa-slate-9 capitalize">{revertTarget.status}</p></div>
              </div>
            </div>
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
              <p className="text-xs font-bold text-red-700 mb-2">Efecto de la reversión:</p>
              <div className="flex items-center gap-2 text-xs">
                <XCircle size={12} className="text-red-500" />
                <span className="text-red-700">Balance actual: <strong>{fmt(selected?.loans?.balance_total || 0)}</strong></span>
              </div>
              <div className="flex items-center gap-2 text-xs mt-1">
                <CheckCircle2 size={12} className="text-emerald-500" />
                <span className="text-emerald-700">Balance tras reversión: <strong>{fmt((selected?.loans?.balance_total || 0) + (revertTarget.total_paid || 0))}</strong></span>
              </div>
            </div>
            <Field label="Motivo de la reversión *" required>
              <textarea className="input h-20 resize-none"
                placeholder="Ej: Error en el monto durante pruebas. Monto correcto es RD$4,800.00..."
                value={revertReason} onChange={e => setRevertReason(e.target.value)} autoFocus />
              <p className="text-xs text-hpa-slate-4 mt-1">Obligatorio. Quedará registrado en auditoría.</p>
            </Field>
          </div>
        )}
      </Modal>

      {/* MODAL ACCIÓN COBRANZA */}
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
              <select className="select" value={actionForm.type || ''} onChange={e => setActionForm(f => ({ ...f, type: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {['call','visit','message','email','notice','agreement','other'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Resultado">
              <select className="select" value={actionForm.result || ''} onChange={e => setActionForm(f => ({ ...f, result: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {['contact','no_contact','promise','paid','refused','rescheduled','other'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Notas" required>
            <textarea className="input h-20 resize-none" value={actionForm.notes || ''} onChange={e => setActionForm(f => ({ ...f, notes: e.target.value }))} />
          </Field>
          <div className="form-row">
            <Field label="Próxima acción">
              <input className="input" value={actionForm.next_action || ''} onChange={e => setActionForm(f => ({ ...f, next_action: e.target.value }))} />
            </Field>
            <Field label="Fecha próx. acción">
              <input className="input" type="date" value={actionForm.next_action_date || ''} onChange={e => setActionForm(f => ({ ...f, next_action_date: e.target.value }))} />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  )
}
