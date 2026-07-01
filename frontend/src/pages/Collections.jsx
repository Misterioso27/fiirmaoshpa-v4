import { useState, useEffect, useCallback } from 'react'
import { Search, DollarSign, User, FileText, AlertCircle, RefreshCw } from 'lucide-react'
import { supabase, fmt, fmtDate } from '@/lib/supabase'
import { Field, Spinner } from '@/components/ui'
import useAuthStore from '@/store/auth'

export default function Collections() {
  const { user } = useAuthStore()
  const branchId = user?.branch?.id

  const [loadingSession, setLoadingSession] = useState(false)
  const [activeSession, setActiveSession] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [loans, setLoans] = useState([])
  const [selectedLoan, setSelectedLoan] = useState(null)
  const [amountToPay, setAmountToPay] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 1. Validar si el cajero tiene sesión abierta
  const checkSession = useCallback(async () => {
    if (!user?.id) return
    setLoadingSession(true)
    try {
      const { data } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .maybeSingle()
      setActiveSession(data)
    } catch (err) { console.error(err) }
    setLoadingSession(false)
  }, [user?.id])

  useEffect(() => { checkSession() }, [checkSession])

  // 2. Buscar préstamos/carteras activas de forma tolerante a fallos
  const handleSearch = async (e) => {
    if (e) e.preventDefault()
    
    setSearching(true)
    setSelectedLoan(null)
    try {
      // Intentamos traer los préstamos activos de la sucursal de forma directa y limpia
      let loansQuery = supabase.from('loans').select('*').neq('status', 'paid')
      if (branchId) loansQuery = loansQuery.eq('branch_id', branchId)
      
      const { data: rawLoans, error: loanErr } = await loansQuery
      if (loanErr) throw loanErr

      // Traemos los clientes de forma independiente para cruzarlos en memoria (así evitamos errores de relación/join)
      const { data: rawCustomers } = await supabase.from('customers').select('*')
      const customersMap = (rawCustomers || []).reduce((acc, curr) => {
        acc[curr.id] = curr
        return acc
      }, {})

      // Cruzamos la información asignando el cliente correspondiente a cada préstamo
      const enrichedLoans = (rawLoans || []).map(loan => ({
        ...loan,
        customerData: customersMap[loan.customer_id] || { first_name: 'Cliente', last_name: 'No Vinculado', id_number: '' }
      }))

      // Si no hay texto de búsqueda, mostramos todos los préstamos pendientes
      if (!searchQuery.trim()) {
        setLoans(enrichedLoans)
      } else {
        // Filtrado exhaustivo y dinámico por cualquier coincidencia
        const term = searchQuery.toLowerCase().trim()
        const matches = enrichedLoans.filter(loan => {
          const loanCode = (loan.loan_code || '').toLowerCase()
          const firstName = (loan.customerData?.first_name || '').toLowerCase()
          const lastName = (loan.customerData?.last_name || '').toLowerCase()
          const fullName = `${firstName} ${lastName}`
          const docId = (loan.customerData?.id_number || '').toLowerCase()

          return loanCode.includes(term) || firstName.includes(term) || lastName.includes(term) || fullName.includes(term) || docId.includes(term)
        })
        setLoans(matches)
      }
    } catch (err) {
      console.error('Error crítico en cobranza:', err.message)
      alert('Error en búsqueda: ' + err.message)
    }
    setSearching(false)
  }

  // Cargar lista inicial al montar el componente
  useEffect(() => {
    handleSearch()
  }, [branchId])

  // 3. Registrar el cobro/amortización
  const handleProcessPayment = async (e) => {
    e.preventDefault()
    const paymentAmount = parseFloat(amountToPay)
    if (isNaN(paymentAmount) || paymentAmount <= 0) return alert('Ingrese un monto válido')
    if (!activeSession) return alert('Debe abrir caja antes de recibir pagos')

    setSubmitting(true)
    try {
      // A. Insertar el movimiento de entrada en la caja activa
      const { error: movErr } = await supabase.from('cash_movements').insert([{
        cash_session_id: activeSession.id,
        type: 'income',
        amount: paymentAmount,
        description: `Cobro cuota préstamo - Cartera: ${selectedLoan.loan_code}`
      }])
      if (movErr) throw movErr

      // B. Actualizar el saldo disponible real de la sesión de caja
      const newSessionBalance = parseFloat(activeSession.current_balance) + paymentAmount
      await supabase
        .from('cash_sessions')
        .update({ current_balance: newSessionBalance })
        .eq('id', activeSession.id)

      // C. Actualizar la terminal física vinculada
      if (activeSession.register_id) {
        const { data: reg } = await supabase.from('cash_registers').select('current_balance').eq('id', activeSession.register_id).single()
        const newRegBalance = (parseFloat(reg?.current_balance) || 0) + paymentAmount
        await supabase.from('cash_registers').update({ current_balance: newRegBalance }).eq('id', activeSession.register_id)
      }

      // D. Afectar el balance pendiente del préstamo
      const currentOutstanding = parseFloat(selectedLoan.outstanding_balance || selectedLoan.amount || 0)
      const newOutstanding = Math.max(0, currentOutstanding - paymentAmount)
      const nextStatus = newOutstanding === 0 ? 'paid' : selectedLoan.status

      await supabase
        .from('loans')
        .update({ outstanding_balance: newOutstanding, status: nextStatus })
        .eq('id', selectedLoan.id)

      alert('¡Cobro procesado con éxito y caja actualizada!')
      setAmountToPay('')
      setSelectedLoan(null)
      setSearchQuery('')
      checkSession()
      handleSearch()
    } catch (err) {
      alert('Error al procesar cobro: ' + err.message)
    }
    setSubmitting(false)
  }

  if (loadingSession) return <div className="p-12 text-center"><Spinner size={24} className="mx-auto" /></div>

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Módulo de Cobranza</h2>
          <p className="text-xs text-hpa-slate-5">Gestión de recaudación y aplicación de amortizaciones en tiempo real</p>
        </div>
        <div>
          {activeSession ? (
            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full border border-emerald-300">
              ✓ Caja Abierta (Sesión Activa)
            </span>
          ) : (
            <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full border border-amber-300">
              ⚠ Requiere Apertura de Caja para Cobrar
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Panel Izquierdo: Buscador y Listado */}
        <div className="lg:col-span-5 space-y-4">
          <div className="card p-4 shadow-sm border border-hpa-slate-2">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 text-hpa-slate-4" size={16} />
                <input
                  type="text"
                  className="input pl-9"
                  placeholder="Buscar código o nombre cliente..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-secondary px-4 text-xs font-bold flex items-center gap-1" disabled={searching}>
                {searching ? <RefreshCw size={12} className="animate-spin" /> : 'Filtrar'}
              </button>
            </form>
          </div>

          <div className="card p-4 space-y-2 min-h-[250px]">
            <p className="text-xs font-bold text-hpa-slate-5 uppercase tracking-wider mb-2">Cuentas Encontradas</p>
            {loans.length === 0 ? (
              <div className="text-center py-12 text-xs text-hpa-slate-4">
                No se encontraron cuentas activas con el criterio ingresado.
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {loans.map(loan => (
                  <div
                    key={loan.id}
                    onClick={() => setSelectedLoan(loan)}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${selectedLoan?.id === loan.id ? 'bg-hpa-slate-9 text-white border-hpa-slate-9 shadow-md' : 'bg-white border-hpa-slate-2 hover:bg-hpa-slate-1'}`}
                  >
                    <p className="text-xs font-bold font-numeric">{loan.loan_code}</p>
                    <p className="text-sm font-medium">{loan.customerData?.first_name} {loan.customerData?.last_name}</p>
                    <p className={`text-xs mt-1 font-bold font-numeric ${selectedLoan?.id === loan.id ? 'text-emerald-300' : 'text-emerald-600'}`}>
                      Balance: {fmt(loan.outstanding_balance || loan.amount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Panel Derecho: Formulario de Recaudación */}
        <div className="lg:col-span-7">
          {!selectedLoan ? (
            <div className="card border border-dashed border-hpa-slate-3 h-full flex flex-col items-center justify-center text-center p-8 min-h-[360px]">
              <div className="p-4 bg-hpa-slate-1 rounded-full text-hpa-slate-4 mb-3"><User size={32} /></div>
              <h4 className="text-sm font-bold text-hpa-slate-8">Ningún préstamo seleccionado</h4>
              <p className="text-xs text-hpa-slate-4 max-w-xs mt-1">Seleccione una cuenta de la cartera activa en el panel izquierdo para procesar su cobranza.</p>
            </div>
          ) : (
            <div className="card p-6 border border-hpa-slate-2 shadow-sm space-y-6">
              <div className="border-b border-hpa-slate-2 pb-4 flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold bg-hpa-slate-2 text-hpa-slate-8 px-2 py-0.5 rounded uppercase font-numeric">{selectedLoan.loan_code}</span>
                  <h3 className="text-base font-bold text-hpa-slate-9 mt-1">{selectedLoan.customerData?.first_name} {selectedLoan.customerData?.last_name}</h3>
                  <p className="text-xs text-hpa-slate-4 flex items-center gap-1 mt-0.5"><FileText size={12} /> Doc: {selectedLoan.customerData?.id_number || 'N/A'}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-hpa-slate-4 uppercase">Balance Pendiente</p>
                  <p className="text-xl font-black text-emerald-600 font-numeric">{fmt(selectedLoan.outstanding_balance || selectedLoan.amount)}</p>
                </div>
              </div>

              <form onSubmit={handleProcessPayment} className="space-y-4">
                <Field label="Monto a Recaudar / Abonar" required>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-2.5 text-hpa-slate-4" size={16} />
                    <input
                      type="number"
                      step="0.01"
                      className="input pl-9 font-bold text-lg font-numeric text-emerald-700"
                      placeholder="0.00"
                      value={amountToPay}
                      onChange={e => setAmountToPay(e.target.value)}
                      disabled={!activeSession || submitting}
                    />
                  </div>
                </Field>

                <button
                  type="submit"
                  className="btn btn-primary w-full py-2.5 text-xs font-bold flex items-center justify-center gap-2"
                  disabled={!activeSession || submitting}
                >
                  {submitting ? <Spinner size={14} /> : 'Aplicar Amortización y Registrar Ingreso'}
                </button>
                {!activeSession && (
                  <p className="text-[11px] text-red-600 flex items-center gap-1 justify-center"><AlertCircle size={12} /> Habilite la sesión de caja para poder procesar transacciones.</p>
                )}
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
