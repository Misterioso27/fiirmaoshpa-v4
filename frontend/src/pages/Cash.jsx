import { useState, useEffect, useCallback } from 'react'
import { Landmark, Plus, Lock, Unlock } from 'lucide-react'
import { db, fmt, fmtDateTime } from '@/lib/supabase'
import { Modal, Field, Empty, Spinner } from '@/components/ui'

export default function Cash() {
  const [registers, setRegisters] = useState([])
  const [loading, setLoading]     = useState(true)
  const [showOpen, setShowOpen]   = useState(null)
  const [showClose, setShowClose] = useState(null)
  const [showMove, setShowMove]   = useState(null)
  const [form, setForm]           = useState({})
  const [saving, setSaving]       = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await api.get('/cash-registers')
      setRegisters(data.registers || [])
    } catch {}
    setLoading(false)
  }

  function fc(k,v) { setForm(f=>({...f,[k]:v})) }

  async function openSession(reg) {
    setSaving(true)
    try {
      await api.post('/cash-sessions', { register_id: reg.id, opening_balance: form.opening_balance || 0, opening_notes: form.opening_notes })
      setShowOpen(null)
      load()
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  async function closeSession(reg) {
    setSaving(true)
    try {
      await api.put(`/cash-sessions/${reg.active_session_id}/close`, { closing_balance: form.closing_balance, closing_notes: form.closing_notes })
      setShowClose(null)
      load()
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  async function addMovement() {
    setSaving(true)
    try {
      await api.post(`/cash-sessions/${showMove.active_session_id}/movements`, form)
      setShowMove(null)
      load()
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-hpa-slate-9">Caja y Tesorería</h2>
        <p className="text-xs text-hpa-slate-5 mt-0.5">{registers.length} cajas registradas</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={24} /></div>
      ) : registers.length === 0 ? (
        <Empty icon={Landmark} title="Sin cajas registradas" desc="Configura las cajas desde Configuración" />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {registers.map(reg => (
            <div key={reg.id} className="card">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-hpa-slate-9">{reg.name}</h3>
                  <p className="text-xs text-hpa-slate-5">{reg.code} · {reg.currency}</p>
                </div>
                <span className={`badge ${reg.status === 'open' ? 'badge-green' : 'badge-gray'}`}>
                  {reg.status === 'open' ? 'Abierta' : 'Cerrada'}
                </span>
              </div>
              <div className="p-4 bg-hpa-slate-1 rounded-xl mb-4">
                <p className="text-xs text-hpa-slate-5 mb-0.5">Saldo Actual</p>
                <p className="text-2xl font-bold font-numeric text-hpa-slate-9">{fmt(reg.current_balance, reg.currency)}</p>
              </div>
              <div className="flex gap-2">
                {reg.status === 'closed' ? (
                  <button className="btn btn-primary btn-sm flex-1" onClick={() => { setShowOpen(reg); setForm({}) }}>
                    <Unlock size={13} /> Abrir Caja
                  </button>
                ) : (
                  <>
                    <button className="btn btn-ghost btn-sm flex-1" onClick={() => { setShowMove(reg); setForm({}) }}>
                      <Plus size={13} /> Movimiento
                    </button>
                    <button className="btn btn-danger btn-sm flex-1" onClick={() => { setShowClose(reg); setForm({}) }}>
                      <Lock size={13} /> Cerrar Caja
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Open session */}
      <Modal open={!!showOpen} onClose={() => setShowOpen(null)} title={`Abrir Caja — ${showOpen?.name}`}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowOpen(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={() => openSession(showOpen)} disabled={saving}>
              {saving ? <Spinner size={14} /> : 'Abrir Sesión'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <Field label="Balance de apertura">
            <input className="input" type="number" value={form.opening_balance||''} onChange={e=>fc('opening_balance',e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Notas de apertura">
            <textarea className="input h-20 resize-none" value={form.opening_notes||''} onChange={e=>fc('opening_notes',e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* Close session */}
      <Modal open={!!showClose} onClose={() => setShowClose(null)} title={`Cerrar Caja — ${showClose?.name}`}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowClose(null)}>Cancelar</button>
            <button className="btn btn-danger" onClick={() => closeSession(showClose)} disabled={saving}>
              {saving ? <Spinner size={14} /> : 'Cerrar y Arquear'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <Field label="Balance de cierre (contado físico)">
            <input className="input" type="number" value={form.closing_balance||''} onChange={e=>fc('closing_balance',e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Notas de cierre">
            <textarea className="input h-20 resize-none" value={form.closing_notes||''} onChange={e=>fc('closing_notes',e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* Movement */}
      <Modal open={!!showMove} onClose={() => setShowMove(null)} title="Registrar Movimiento"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowMove(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={addMovement} disabled={saving}>
              {saving ? <Spinner size={14} /> : 'Registrar'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="form-row">
            <Field label="Tipo">
              <select className="select" value={form.type||''} onChange={e=>fc('type',e.target.value)}>
                <option value="">Seleccionar...</option>
                {['income','expense','transfer_in','transfer_out','adjustment'].map(t=><option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Categoría">
              <select className="select" value={form.category||''} onChange={e=>fc('category',e.target.value)}>
                <option value="">Seleccionar...</option>
                {['loan_payment','investment_deposit','loan_disbursement','investment_withdrawal','expense_operational','expense_admin','transfer','other'].map(c=><option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <div className="form-row">
            <Field label="Monto" required>
              <input className="input" type="number" value={form.amount||''} onChange={e=>fc('amount',e.target.value)} />
            </Field>
            <Field label="Moneda">
              <select className="select" value={form.currency||'DOP'} onChange={e=>fc('currency',e.target.value)}>
                {['DOP','USD','BRL'].map(c=><option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Descripción" required>
            <input className="input" value={form.description||''} onChange={e=>fc('description',e.target.value)} />
          </Field>
          <Field label="No. Recibo / Referencia">
            <input className="input" value={form.receipt_number||''} onChange={e=>fc('receipt_number',e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
