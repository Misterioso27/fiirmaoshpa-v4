import { useState, useEffect, useCallback } from 'react'
import { DollarSign, Lock, Unlock, ClipboardList, RefreshCw } from 'lucide-react'
import { supabase, fmt, fmtDate } from '@/lib/supabase'
import { Field, Spinner, Empty } from '@/components/ui'
import useAuthStore from '@/store/auth'

function Cash() {
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
      const { data, error } = await query
      if (error) throw error
      setRegisters(data || [])
      if (data?.length > 0) setSelectedRegister(data[0].id)
    } catch (err) {
      console.error('Error cargando cajas:', err.message)
    }
  }, [branchId])

  const checkActiveSession = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .maybeSingle()

      if (error) throw error
      setActiveSession(data)
      if (data) loadMovements(data.id)
    } catch (err) {
      console.error('Error verificando sesión de caja:', err.message)
    }
    setLoading(false)
  }, [user?.id])

  const loadMovements = async (sessionId) => {
    setLoadingMovements(true)
    try {
      const { data, error } = await supabase
        .from('cash_movements')
        .select('*')
        .eq('cash_session_id', sessionId)
        .order('created_at', { ascending: false })
      if (error) throw error
      setMovements(data || [])
    } catch (err) {
      console.error('Error cargando movimientos:', err.message)
    }
    setLoadingMovements(false)
  }

  useEffect(() => {
    loadRegisters()
    if (user?.id) checkActiveSession()
  }, [user?.id, loadRegisters, checkActiveSession])

  const handleOpenSession = async (e) => {
    e.preventDefault()
    const monto = parseFloat(openingBalance)
    if (isNaN(monto) || monto < 0) {
      alert('Por favor ingrese un monto de apertura válido.')
      return
    }

    setSubmitting(true)
    try {
      const { data, error } = await supabase
        .from('cash_sessions')
        .insert([{
          company_id: companyId || null,
          user_id: user.id,
          opening_balance: monto,
          current_balance: monto,
          status: 'open',
          opened_at: new Date().toISOString()
        }])
        .select()
        .single()

      if (error) throw error

      if (selectedRegister) {
        await supabase
          .from('cash_registers')
          .update({ status: 'open', current_balance: monto })
          .eq('id', selectedRegister)
      }

      alert('¡Caja abierta con éxito! Ya puede ir a Cobranzas a aplicar pagos.')
      setOpeningBalance('')
      checkActiveSession()
    } catch (err) {
      alert('Error al abrir caja: ' + err.message)
    }
    setSubmitting(false)
  }

  const handleCloseSession = async () => {
    if (!window.confirm(`¿Cerrar caja con un balance de ${fmt(activeSession.current_balance)}?`)) return
    setSubmitting(true)
    try {
      const { error: sessionErr } = await supabase
        .from('cash_sessions')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          closing_balance: activeSession.current_balance
        })
        .eq('id', activeSession.id)

      if (sessionErr) throw sessionErr

      alert('Caja cerrada correctamente.')
      setActiveSession(null)
      setMovements([])
      loadRegisters()
    } catch (err) {
      alert('Error al cerrar caja: ' + err.message)
    }
    setSubmitting(false)
  }

  if (loading) return <div className="p-12 text-center"><Spinner size={24} className="mx-auto" /></div>

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-hpa-slate-9">Control de Caja y Flujo</h2>
        <p className="text-xs text-hpa-slate-5 mt-0.5">Gestión diaria de disponibilidad de efectivo, aperturas y arqueos de caja</p>
      </div>

      {!activeSession ? (
        <div className="max-w-md mx-auto card p-6 mt-6 border border-hpa-slate-2 shadow-sm">
          <div className="text-center space-y-2 mb-6">
            <div className="p-3 bg-amber-50 text-amber-700 rounded-full inline-block border border-amber-200">
              <Lock size={24} />
            </div>
            <h3 className="text-base font-bold text-hpa-slate-9">Caja Fuera de Servicio</h3>
            <p className="text-xs text-hpa-slate-4">Su usuario no posee una sesión de trabajo activa en esta sucursal.</p>
          </div>

          <form onSubmit={handleOpenSession} className="space-y-4">
            <Field label="Seleccionar Terminal / Caja Física" required>
              <select className="select" value={selectedRegister} onChange={e => setSelectedRegister(e.target.value)}>
                {registers.length === 0 ? (
                  <option value="">Caja General Autodetectada</option>
                ) : registers.map(reg => (
                  <option key={reg.id} value={reg.id}>
                    {reg.name} ({reg.code}) — Bal: {fmt(reg.current_balance, reg.currency)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Monto de Apertura" required>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 text-hpa-slate-4" size={16} />
                <input type="number" step="0.01" className="input pl-9 font-bold" placeholder="0.00" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} />
              </div>
            </Field>

            <button type="submit" className="btn btn-primary w-full flex items-center justify-center gap-2" disabled={submitting}>
              {submitting ? <Spinner size={14} /> : <><Unlock size={14} /> Inicializar Sesión de Caja</>}
            </button>
          </form>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 space-y-4">
            <div className="card p-5 bg-hpa-slate-9 text-white border-0 space-y-4">
              <div>
                <p className="text-xs font-semibold text-white/60 uppercase">Estatus de Sesión</p>
                <h3 className="text-base font-bold mt-0.5">Sesión Abierta por el Usuario</h3>
              </div>
              <hr className="border-white/10" />
              <div>
                <p className="text-[11px] text-white/60 uppercase">Fondo de Apertura</p>
                <p className="text-sm font-medium font-numeric">{fmt(activeSession.opening_balance)}</p>
              </div>
              <div>
                <p className="text-[11px] text-emerald-400 font-bold uppercase">Efectivo Disponible</p>
                <p className="text-2xl font-black font-numeric text-emerald-400">{fmt(activeSession.current_balance)}</p>
              </div>
              <button onClick={handleCloseSession} className="btn bg-red-600 hover:bg-red-700 text-white border-0 w-full text-xs font-bold py-2 flex items-center justify-center gap-1.5" disabled={submitting}>
                {submitting ? <Spinner size={12} /> : <><Lock size={12} /> Realizar Cierre Diario</>}
              </button>
            </div>
          </div>

          <div className="lg:col-span-8">
            <div className="card p-0">
              <div className="p-4 border-b border-hpa-slate-2 flex justify-between items-center">
                <p className="text-xs font-bold text-hpa-slate-7 uppercase">Historial de Caja</p>
                <button onClick={() => loadMovements(activeSession.id)} className="btn btn-ghost p-2" disabled={loadingMovements}>
                  <RefreshCw size={14} className={loadingMovements ? 'animate-spin' : ''} />
                </button>
              </div>

              <div className="table-wrapper max-h-[450px] overflow-y-auto">
                <table className="table text-xs">
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Tipo</th>
                      <th>Concepto</th>
                      <th className="text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.length === 0 ? (
                      <tr><td colSpan={4} className="py-12"><Empty icon={ClipboardList} title="Sin movimientos" desc="No hay transacciones todavía." /></td></tr>
                    ) : movements.map(mov => (
                      <tr key={mov.id}>
                        <td className="text-hpa-slate-4">{fmtDate(mov.created_at)}</td>
                        <td>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${mov.type === 'income' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                            {mov.type === 'income' ? 'ENTRADA' : 'SALIDA'}
                          </span>
                        </td>
                        <td className="font-medium text-hpa-slate-8">{mov.description}</td>
                        <td className={`text-right font-bold font-numeric ${mov.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {mov.type === 'income' ? '+' : '-'}{fmt(mov.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Cash
