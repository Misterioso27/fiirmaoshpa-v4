import { useState, useEffect, useCallback } from 'react'
import { PhoneCall, Search, AlertTriangle } from 'lucide-react'
import { db, fmt, fmtDate } from '@/lib/supabase'
import { StatusBadge, Modal, Field, Pagination, Empty, Spinner } from '@/components/ui'

const STAGE_COLORS = {
  preventive: 'badge-blue', early: 'badge-amber',
  advanced: 'badge-red', recovery: 'badge-red', legal: 'badge-red'
}
const STAGE_LABELS = {
  preventive: 'Preventiva', early: 'Temprana',
  advanced: 'Avanzada', recovery: 'Recuperación', legal: 'Legal'
}

export default function Collections() {
  const [cases, setCases]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [page, setPage]     = useState(1)
  const [pagination, setPagination] = useState({})
  const [stage, setStage]   = useState('')
  const [showAction, setShowAction] = useState(null)
  const [actionForm, setActionForm] = useState({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 20 })
      if (stage) params.set('stage', stage)
      const data = await api.get(`/collections?${params}`)
      setCases(data.cases || [])
      setPagination(data.pagination || {})
    } catch {}
    setLoading(false)
  }, [page, stage])

  useEffect(() => { load() }, [load])

  async function saveAction() {
    setSaving(true)
    try {
      await api.post(`/collections/${showAction.id}/actions`, actionForm)
      setShowAction(null)
      load()
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Cobranza</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">{pagination.total || 0} casos activos</p>
        </div>
      </div>

      {/* Stage summary */}
      <div className="grid grid-cols-5 gap-3">
        {Object.entries(STAGE_LABELS).map(([key, label]) => (
          <button key={key}
            className={`card p-3 text-center cursor-pointer transition-all border-2 ${stage === key ? 'border-hpa-700' : 'border-transparent'} hover:border-hpa-700/30`}
            onClick={() => setStage(stage === key ? '' : key)}>
            <p className="text-xs text-hpa-slate-5 font-medium">{label}</p>
            <p className="text-xl font-bold text-hpa-slate-9 mt-1 font-numeric">—</p>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-hpa-slate-2 flex gap-3">
          <select className="select w-44" value={stage} onChange={e => { setStage(e.target.value); setPage(1) }}>
            <option value="">Todas las etapas</option>
            {Object.entries(STAGE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Préstamo</th><th>Cliente</th><th>Etapa</th><th>Días Mora</th>
                <th>Monto Vencido</th><th>Cuotas</th><th>Asignado a</th>
                <th>Próx. Acción</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="py-12 text-center"><Spinner size={20} className="mx-auto" /></td></tr>
              ) : cases.length === 0 ? (
                <tr><td colSpan={10}>
                  <Empty icon={PhoneCall} title="Sin casos de cobranza" desc="No hay casos activos con estos filtros" />
                </td></tr>
              ) : cases.map(c => (
                <tr key={c.id}>
                  <td className="font-mono text-xs font-semibold text-hpa-700">{c.loans?.loan_code}</td>
                  <td>
                    <p className="font-medium">{c.clients?.first_name} {c.clients?.last_name}</p>
                    <p className="text-xs text-hpa-slate-5">{c.clients?.phone_primary}</p>
                  </td>
                  <td><span className={`badge ${STAGE_COLORS[c.stage]||'badge-gray'}`}>{STAGE_LABELS[c.stage]||c.stage}</span></td>
                  <td>
                    <span className={`font-bold font-numeric ${c.days_overdue > 90 ? 'text-red-600' : c.days_overdue > 30 ? 'text-amber-600' : 'text-hpa-slate-7'}`}>
                      {c.days_overdue}d
                    </span>
                  </td>
                  <td className="font-numeric font-semibold text-red-600">{fmt(c.amount_overdue)}</td>
                  <td className="font-numeric">{c.installments_due}</td>
                  <td className="text-xs">{c.profiles?.full_name || '—'}</td>
                  <td className="text-xs text-hpa-slate-5">{fmtDate(c.next_action_at)}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setShowAction(c); setActionForm({}) }}>
                      <PhoneCall size={12} /> Acción
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={pagination.pages} total={pagination.total} limit={20} onChange={setPage} />
      </div>

      {/* Action modal */}
      <Modal open={!!showAction} onClose={() => setShowAction(null)} title="Registrar Acción de Cobranza"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowAction(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveAction} disabled={saving}>
              {saving ? <Spinner size={14} /> : 'Guardar Acción'}
            </button>
          </>
        }>
        {showAction && (
          <div className="space-y-4">
            <div className="p-3 bg-hpa-slate-1 rounded-lg text-sm">
              <p className="font-semibold">{showAction.clients?.first_name} {showAction.clients?.last_name}</p>
              <p className="text-hpa-slate-5 text-xs">{showAction.days_overdue} días en mora · {fmt(showAction.amount_overdue)} vencido</p>
            </div>
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
              <textarea className="input h-24 resize-none" value={actionForm.notes||''}
                onChange={e=>setActionForm(f=>({...f,notes:e.target.value}))} />
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
        )}
      </Modal>
    </div>
  )
}
