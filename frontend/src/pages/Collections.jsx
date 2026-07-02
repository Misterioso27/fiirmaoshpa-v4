import { useState, useEffect, useCallback } from 'react'
import { Search, DollarSign, User, RefreshCw } from 'lucide-react'
import { db, fmt, fmtDate } from '@/lib/supabase'
import { Field, Spinner } from '@/components/ui'
import useAuthStore from '@/store/auth'

export default function Collections() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id || 'a0000000-0000-4000-8000-000000000001'
  const branchId = user?.branch?.id

  const [loadingSession, setLoadingSession] = useState(false)
  const [activeSession, setActiveSession] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [loans, setLoans] = useState([])
  const [selectedLoan, setSelectedLoan] = useState(null)
  const [amountToPay, setAmountToPay] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 1. Validar sesión de caja abierta
  const checkSession = useCallback(async () => {
    if (!user?.id) return
    setLoadingSession(true)
    try {
      const { data } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('status', 'open')
        .limit(1)
      
      if (data && data.length > 0) {
        setActiveSession(data[0])
      } else {
        setActiveSession(null)
      }
    } catch (err) { 
      console.error('Error en checkSession:', err) 
    }
    setLoadingSession(false)
  }, [user?.id])

  useEffect(() => { checkSession() }, [checkSession])

  // 2. Buscador blindado: Trae préstamos activos y cruza con clientes
  const handleSearch = async (e) => {
    if (e) e.preventDefault()
    
    setSearching(true)
    setSelectedLoan(null)
    try {
      // 1. Descargamos todos los préstamos que no estén pagados
      const { data: rawLoans, error: loanErr } = await supabase
        .from('loans')
        .select('*')
        .neq('status', 'paid')

      if (loanErr) throw loanErr

      // 2. Descargamos la lista de clientes para cruzar los nombres
      const { data: rawClients, error: clientErr } = await supabase
        .from('clients')
        .select('*')

      if (clientErr) throw clientErr

      const clientsMap = (rawClients || []).reduce((acc, curr) => {
        acc[curr.id] = curr
        return acc
      }, {})

      // 3. Unimos la información vinculando por ID
      const enrichedLoans = (rawLoans || []).map(loan => {
        // Mapeo flexible por si la columna se llama client_id o customer_id
        const targetClientId = loan.client_id || loan.customer_id
        const clientData = clientsMap[targetClientId]

        return {
          ...loan,
          customerData: clientData || { 
            first_name: loan.client_name || 'Cliente', 
            last_name: loan.client_lastname || 'Sin Apellido'
          }
        }
      })

      // 4. Aplicamos el filtro de búsqueda de manera local y segura
      if (!searchQuery.trim()) {
        setLoans(enrichedLoans)
      } else {
        const term = searchQuery.toLowerCase().trim()
        const matches = enrichedLoans.filter(loan => {
          const loanCode = (loan.loan_code || '').toLowerCase()
          const firstName = (loan.customerData?.first_name || '').toLowerCase()
          const lastName = (loan.customerData?.last_name || '').toLowerCase()
          const fullName = `${firstName} ${lastName}`

          // Evalúa si coincide con el código de préstamo o el nombre del cliente
          return loanCode.includes(term) || firstName.includes(term) || lastName.includes(term) || fullName.includes(term)
        })
        setLoans(matches)
      }
    } catch (err) {
      console.error('Error en el motor de búsqueda:', err.message)
    }
    setSearching(false)
  }

  // Carga inicial de datos
  useEffect(() => {
    handleSearch()
  }, [branchId])

  // Manejar el cambio de texto e inicializar si se limpia
  const handleInputChange = (e) => {
    const value = e.target.value
    setSearchQuery(value)
    if (value.trim() === '') {
      handleSearch()
    }
  }

  // 3. Procesar cobro / abono de cuota
  const handleProcessPayment = async (e) => {
    e.preventDefault()
    const paymentAmount = parseFloat(amountToPay)
    if (isNaN(paymentAmount) || paymentAmount <= 0) return alert('Ingrese un monto válido')

    setSubmitting(true)
    try {
      const currentOutstanding = parseFloat(selectedLoan.outstanding_balance || selectedLoan.amount || 0)
      const newOutstanding = Math.max(0, currentOutstanding - paymentAmount)
      const nextStatus = newOutstanding === 0 ? 'paid' : selectedLoan.status

      const { error: updateErr } = await supabase
        .from('loans')
        .update({ outstanding_balance: newOutstanding, status: nextStatus })
        .eq('id', selectedLoan.id)

      if (updateErr) throw updateErr

      if (activeSession) {
        await supabase.from('cash_movements').insert([{
          cash_session_id: activeSession.id,
          type: 'income',
          amount: paymentAmount,
          description: `Abono cuota - Cartera: ${selectedLoan.loan_code}`
        }])

        const newSessionBalance = parseFloat(activeSession.current_balance) + paymentAmount
        await supabase.from('cash_sessions').update({ current_balance: newSessionBalance }).eq('id', activeSession.id)
      }

      alert('¡Abono aplicado correctamente!')
      setAmountToPay('')
      setSelectedLoan(null)
      setSearchQuery('')
      checkSession()
      handleSearch()
    } catch (err) {
      alert('Error al registrar cobro: ' + err.message)
    }
    setSubmitting(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Módulo de Cobranza</h2>
          <p className="text-xs text-gray-500">Recaudación y aplicación de amortizaciones en tiempo real</p>
        </div>
        <div>
          {activeSession ? (
            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full border border-emerald-300">
              ✓ Caja Abierta (Sesión Activa)
            </span>
          ) : (
            <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full border border-amber-300">
              ⚠ Cobro de Contingencia (Sin Caja Abierta)
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                <input
                  type="text"
                  className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Buscar código o nombre cliente..."
                  value={searchQuery}
                  onChange={handleInputChange}
                />
              </div>
              <button 
                type="submit" 
                className="px-4 text-xs font-bold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 min-w-[76px] flex items-center justify-center"
                disabled={searching}
              >
                {searching ? <RefreshCw size={12} className="animate-spin" /> : 'Filtrar'}
              </button>
            </form>
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm min-h-[250px]">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Cuentas Encontradas</p>
            {loans.length === 0 ? (
              <div className="text-center py-12 text-xs text-gray-400">
                No se encontraron cuentas activas con el criterio ingresado.
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {loans.map(loan => (
                  <div
                    key={loan.id}
                    onClick={() => setSelectedLoan(loan)}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${selectedLoan?.id === loan.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                  >
                    <p className="text-xs font-bold font-mono">{loan.loan_code}</p>
                    <p className="text-sm font-medium">{loan.customerData?.first_name} {loan.customerData?.last_name}</p>
                    <p className={`text-xs mt-1 font-bold font-mono ${selectedLoan?.id === loan.id ? 'text-indigo-200' : 'text-emerald-600'}`}>
                      Balance: {fmt(loan.outstanding_balance || loan.amount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-7">
          {!selectedLoan ? (
            <div className="bg-white border border-dashed border-gray-200 rounded-xl h-full flex flex-col items-center justify-center text-center p-8 min-h-[360px]">
              <div className="p-4 bg-gray-50 rounded-full text-gray-400 mb-3"><User size={32} /></div>
              <h4 className="text-sm font-bold text-gray-700">Ningún préstamo seleccionado</h4>
              <p className="text-xs text-gray-400 max-w-xs mt-1">Seleccione una cuenta en el panel izquierdo para procesar su cobro.</p>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
              <div className="border-b border-gray-100 pb-4 flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold bg-gray-100 text-gray-800 px-2 py-0.5 rounded uppercase font-mono">{selectedLoan.loan_code}</span>
                  <h3 className="text-base font-bold text-gray-900 mt-1">{selectedLoan.customerData?.first_name} {selectedLoan.customerData?.last_name}</h3>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-gray-400 uppercase">Balance Pendiente</p>
                  <p className="text-xl font-black text-emerald-600 font-mono">{fmt(selectedLoan.outstanding_balance || selectedLoan.amount)}</p>
                </div>
              </div>

              <form onSubmit={handleProcessPayment} className="space-y-4">
                <Field label="Monto a Recaudar / Abonar" required>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-2.5 text-gray-400" size={16} />
                    <input
                      type="number"
                      step="0.01"
                      className="w-full pl-9 pr-4 py-2 text-base font-bold bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-emerald-700"
                      placeholder="0.00"
                      value={amountToPay}
                      onChange={e => setAmountToPay(e.target.value)}
                      disabled={submitting}
                    />
                  </div>
                </Field>

                <button
                  type="submit"
                  className="w-full py-2.5 text-xs font-bold flex items-center justify-center gap-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                  disabled={submitting}
                >
                  {submitting ? <Spinner size={14} /> : 'Aplicar Amortización'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
