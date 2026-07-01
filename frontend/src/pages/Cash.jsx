import { useState, useEffect, useCallback } from 'react'
import { DollarSign, Lock, Unlock, RefreshCw } from 'lucide-react'
import { supabase, fmt, fmtDate } from '@/lib/supabase'
import { Field, Spinner } from '@/components/ui'
import useAuthStore from '@/store/auth'

export default function Cash() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id
  const branchId  = user?.branch?.id

  const [loading, setLoading] = useState(false)
  const [registers, setRegisters] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [movements, setMovements] = useState([])
  const [loadingMovements, setLoadingMovements] = useState(false)
  const [openingBalance, setOpeningBalance] = useState('')
  const [selectedRegister, setSelectedRegister] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadRegisters = useCallback(async () => {
    try {
      let query = supabase.from('cash_registers').select('*')
      if (branchId) query = query.eq('branch_id', branchId)
      const { data } = await query
      setRegisters(data || [])
      if (data?.length > 0) setSelectedRegister(data[0].id)
    } catch (err) { console.error(err) }
  }, [branchId])

  const loadMovements = async (sessionId) => {
    setLoadingMovements(true)
    try {
      const { data } = await supabase.from('cash_movements').select('*').eq('cash_session_id', sessionId).order('created_at', { ascending: false })
      setMovements(data || [])
    } catch (err) { console.error(err) }
    setLoadingMovements(false)
  }

  const checkActiveSession = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const { data } = await supabase.from('cash_sessions').select('*').eq('user_id', user.id).eq('status', 'open').maybeSingle()
      setActiveSession(data)
      if (data) loadMovements(data.id)
    } catch (err) { console.error(err) }
    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    loadRegisters()
    if (user?.id) checkActiveSession()
  }, [user?.id, loadRegisters, checkActiveSession])

  const handleOpenSession = async (e) => {
    e.preventDefault()
    const monto = parseFloat(openingBalance)
    if (isNaN(monto) || monto < 0 || !selectedRegister) return alert('Datos inválidos')
    setSubmitting(true)
    try {
      const { data: history } = await supabase.from('cash_sessions').select('id').eq('register_id', selectedRegister)
      const nextNum = (history?.length || 0) + 1

      const { error } = await supabase.from('cash_sessions').insert([{
        company_id: companyId || null, branch_id: branchId || null, register_id: selectedRegister,
        user_id: user.id, session_number: nextNum.toString(), opening_balance: monto, current_balance: monto, status: 'open'
      }])
      if (error) throw error
      await supabase.from('cash_registers').update({ status: 'open', current_balance: monto }).eq('id', selectedRegister)
      alert('¡Caja abierta con éxito!')
      setOpeningBalance('')
      checkActiveSession()
    } catch (err) { alert('Error: ' + err.message) }
    setSubmitting(false)
  }

  const handleCloseSession = async () => {
    if (!window.confirm('¿Cerrar caja?')) return
    setSubmitting(true)
    try {
      await supabase.from('cash_sessions').update({ status: 'closed', closed_at: new Date().toISOString(), closing_balance: activeSession.current_balance }).eq('id', activeSession.id)
      alert('Caja cerrada.')
      setActiveSession(null)
      setMovements([])
      loadRegisters()
    } catch (err) { alert('Error: ' + err.message) }
    setSubmitting(false)
  }

  if (loading) return <div className="p-12 text-center"><Spinner size={24} className="mx-auto" /></div>

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-hpa-slate-9">Control de Caja y Flujo</h2>
        <p className="text-xs text-hpa-slate-5">Gestión diaria de disponibilidad de efectivo</p>
      </div>

      {!activeSession ? (
        <div className="max-w-md mx-auto card p-6 mt-6 border border-hpa-slate-2">
          <div className="text-center space-y-2 mb-6">
            <div className="p-3 bg-amber-50 text-amber-700 rounded-full inline-block"><Lock size={24} /></div>
            <h3 className="text-base font-bold">Caja Fuera de Servicio</h3>
          </div>
          <form onSubmit={handleOpenSession} className="space-y-4">
            <Field label="Seleccionar Terminal / Caja Física" required>
              <select className="select" value={selectedRegister} onChange={e => setSelectedRegister(e.target.value)}>
                {registers.length === 0 ? <option value="">No hay cajas</option> : registers.map(reg => (
                  <option key={reg.id} value={reg.id}>{reg.name} — {fmt(reg.current_balance)}</option>
                ))}
              </select>
            </Field>
            <Field label="Monto de Apertura" required>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 text-hpa-slate-4" size={16} />
                <input type="number" step="0.01" className="input pl-9 font-bold" placeholder="0.00" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} />
              </div>
            </Field>
            <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
              {submitting ? <Spinner size={14} /> : 'Inicializar Sesión de Caja'}
            </button>
          </form>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4">
            <div className="card p-5 bg-hpa-slate-9 text-white border-0 space-y-4">
              <h3 className="text-base font-bold">Sesión Abierta</h3>
              <div>
                <p className="text-[11px] text-white/60">Disponible</p>
                <p className="text-2xl font-black text-emerald-400">{fmt(activeSession.current_balance)}</p>
              </div>
              <button onClick={handleCloseSession} className="btn bg-red-600 hover:bg-red-700 text-white w-full text-xs font-bold py-2" disabled={submitting}>
                {submitting ? <Spinner size={12} /> : 'Realizar Cierre Diario'}
              </button>
            </div>
          </div>
          <div className="lg:col-span-8">
            <div className="card p-0">
              <div className="p-4 border-b border-hpa-slate-2 flex justify-between items-center">
                <p className="text-xs font-bold text-hpa-slate-7 uppercase">Historial de Caja</p>
                <button onClick={() => loadMovements(activeSession.id)} className="btn btn-ghost p-2">
                  <RefreshCw size={14} className={loadingMovements ? 'animate-spin' : ''} />
                </button>
              </div>
              <div className="p-4 text-xs text-hpa-slate-5">
                {movements.length === 0 ? 'Sin movimientos en esta sesión.' : (
                  <ul className="space-y-2">
                    {movements.map(m => (
                      <li key={m.id} className="flex justify-between border-b pb-1">
                        <span>{fmtDate(m.created_at)} - {m.description}</span>
                        <span className={m.type === 'income' ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                          {m.type === 'income' ? '+' : '-'}{fmt(m.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
