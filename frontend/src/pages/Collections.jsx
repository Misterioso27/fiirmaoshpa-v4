import { useState, useEffect, useCallback } from 'react'
import { Search, DollarSign, Receipt, AlertCircle, CheckCircle2 } from 'lucide-react'
import { db, supabase, fmt, fmtDate } from '@/lib/supabase'
import { StatusBadge, Modal, Field, Spinner, Empty } from '@/components/ui'
import useAuthStore from '@/store/auth'

function Collections() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id

  // Estados de carga y datos
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeLoans, setActiveLoans] = useState([])
  const [selectedLoan, setSelectedLoan] = useState(null)
  const [schedule, setSchedule] = useState([])
  const [loadingSchedule, setLoadingSchedule] = useState(false)

  // Estado de Caja Activa
  const [activeSession, setActiveSession] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)

  // Estados del Modal de Pago
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedInstallment, setSelectedInstallment] = useState(null)
  const [submittingPayment, setSubmittingPayment] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_method: 'cash',
    reference: '',
    notes: ''
  })

  // 1. Verificar si el usuario tiene una sesión de caja abierta
  const checkCashSession = useCallback(async () => {
    if (!user?.id) return
    setCheckingSession(true)
    try {
      const { data, error } = await supabase
        .from('cash_sessions')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .maybeSingle()

      if (error) throw error
      setActiveSession(data)
    } catch (err) {
      console.error('Error verificando caja:', err.message)
    }
    setCheckingSession(false)
  }, [user?.id])

  useEffect(() => { checkCashSession() }, [checkCashSession])

  // 2. Buscar Préstamos Activos o en Mora
  const searchLoans = async (e) => {
    if (e) e.preventDefault()
    if (!companyId) return
    setLoading(true)
    try {
      let query = supabase
        .from('loans')
        .select(`
          id, loan_code, principal, balance_total, balance_principal, 
          balance_interest, balance_penalties, days_overdue, status, currency,
          clients (id, first_name, last_name, client_code, phone_primary)
        `)
        .eq('company_id', companyId)
        .in('status', ['active', 'overdue', 'defaulted'])

      if (searchTerm.trim()) {
        query = query.ilike('loan_code', `%${searchTerm}%`)
      }

      const { data, error } = await query.limit(20)
      if (error) throw error
      setActiveLoans(data || [])
    } catch (err) {
      alert('Error al buscar préstamos: ' + err.message)
    }
    setLoading(false)
  }

  useEffect(() => { if (companyId) searchLoans() }, [companyId])

  // 3. Cargar el Calendario de Cuotas
  const loadLoanDetails = async (loan) => {
    setSelectedLoan(loan)
    setLoadingSchedule(true)
    try {
      const { data, error } = await supabase
        .from('loan_schedule')
        .select('*')
        .eq('loan_id', loan.id)
        .order('installment_num', { ascending: true })

      if (error) throw error
      setSchedule(data || [])
    } catch (err) {
      alert('Error al cargar cuotas: ' + err.message)
    }
    setLoadingSchedule(false)
  }

  const openPaymentModal = (installment) => {
    setSelectedInstallment(installment)
    setPaymentForm({
      amount: installment.balance || installment.total_due,
      payment_method: 'cash',
      reference: '',
      notes: ''
    })
    setShowPaymentModal(true)
  }

  // 4. Procesar e Inserción de Pago con Distribución Contable Correcta
  const handleApplyPayment = async () => {
    if (!activeSession) {
      alert('Error: Debe abrir una sesión de caja antes de recibir pagos.')
      return
    }

    const montoAPagar = parseFloat(paymentForm.amount)
    if (!montoAPagar || montoAPagar <= 0) {
      alert('Por favor, ingrese un monto válido mayor a cero.')
      return
    }

    setSubmittingPayment(true)
    try {
      let restante = montoAPagar
      
      const moraPendiente = parseFloat(selectedInstallment.penalty_amount || 0) - parseFloat(selectedInstallment.penalty_paid || 0)
      const penaltyApplied = Math.min(restante, Math.max(0, moraPendiente))
      restante -= penaltyApplied

      const interesPendiente = parseFloat(selectedInstallment.interest || 0) - parseFloat(selectedInstallment.interest_paid || 0)
      const interestApplied = Math.min(restante, Math.max(0, interesPendiente))
      restante -= interestApplied

      const capitalPendiente = parseFloat(selectedInstallment.principal || 0) - parseFloat(selectedInstallment.principal_paid || 0)
      const principalApplied = Math.min(restante, Math.max(0, capitalPendiente))
      restante -= principalApplied

      const numRecibo = `REC-${Date.now().toString().slice(-6)}`

      const { error: payErr } = await supabase
        .from('loan_payments')
        .insert([{
          loan_id: selectedLoan.id,
          schedule_id: selectedInstallment.id,
          payment_number: numRecibo,
          amount: montoAPagar,
          principal_applied: principalApplied,
          interest_applied: interestApplied,
          penalty_applied: penaltyApplied,
          currency: selectedLoan.currency,
          fx_rate: 1.0,
          payment_method: paymentForm.payment_method,
          reference: paymentForm.reference || null,
          cash_session_id: activeSession.id,
          notes: paymentForm.notes || null,
          created_by: user.id
        }])

      if (payErr) throw payErr

      const nuevoPrincipalPaid = parseFloat(selectedInstallment.principal_paid || 0) + principalApplied
      const nuevoInterestPaid  = parseFloat(selectedInstallment.interest_paid || 0) + interestApplied
      const nuevoPenaltyPaid   = parseFloat(selectedInstallment.penalty_paid || 0) + penaltyApplied
      const nuevoTotalPaid     = parseFloat(selectedInstallment.total_paid || 0) + montoAPagar
      const nuevoBalance       = Math.max(0, parseFloat(selectedInstallment.total_due) - nuevoTotalPaid)
      
      const nuevoStatus = nuevoBalance <= 0 ? 'paid' : 'partial'

      const { error: schedErr } = await supabase
        .from('loan_schedule')
        .update({
          principal_paid: nuevoPrincipalPaid,
          interest_paid: nuevoInterestPaid,
          penalty_paid: nuevoPenaltyPaid,
          total_paid: nuevoTotalPaid,
          balance: nuevoBalance,
          status: nuevoStatus,
          paid_at: nuevoStatus === 'paid' ? new Date().toISOString() : selectedInstallment.paid_at
        })
        .eq('id', selectedInstallment.id)

      if (schedErr) throw schedErr

      const nuevoLoanBalPrincipal = Math.max(0, parseFloat(selectedLoan.balance_principal) - principalApplied)
      const nuevoLoanBalInterest  = Math.max(0, parseFloat(selectedLoan.balance_interest) - interestApplied)
      const nuevoLoanBalPenalties = Math.max(0, parseFloat(selectedLoan.balance_penalties) - penaltyApplied)
      const nuevoLoanBalTotal     = Math.max(0, parseFloat(selectedLoan.balance_total) - montoAPagar)
      
      const nuevoLoanStatus = nuevoLoanBalTotal <= 0 ? 'paid' : selectedLoan.status

      const { error: loanErr } = await supabase
        .from('loans')
        .update({
          balance_principal: nuevoLoanBalPrincipal,
          balance_interest: nuevoLoanBalInterest,
          balance_penalties: nuevoLoanBalPenalties,
          balance_total: nuevoLoanBalTotal,
          status: nuevoLoanStatus
        })
        .eq('id', selectedLoan.id)

      if (loanErr) throw loanErr

      setShowPaymentModal(false)
      const updatedLoan = {
        ...selectedLoan,
        balance_principal: nuevoLoanBalPrincipal,
        balance_interest: nuevoLoanBalInterest,
        balance_penalties: nuevoLoanBalPenalties,
        balance_total: nuevoLoanBalTotal,
        status: nuevoLoanStatus
      }
      setSelectedLoan(updatedLoan)
      loadLoanDetails(updatedLoan)
      searchLoans()
      
      alert(`¡Cobro aplicado con éxito! Recibo: ${numRecibo}`)
    } catch (err) {
      alert('Error crítico al procesar cobro: ' + err.message)
    }
    setSubmittingPayment(false)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-hpa-slate-2 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Módulo de Cobranza</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">Gestión de recaudación y aplicación de amortizaciones en tiempo real</p>
        </div>
        
        {checkingSession ? (
          <Spinner size={16} />
        ) : activeSession ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-bold">
            <CheckCircle2 size={14} /> Caja Abierta (Sesión Activa)
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-bold">
            <AlertCircle size={14} /> Requiere Apertura de Caja para Cobrar
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 space-y-4">
          <div className="card p-4">
            <p className="text-xs font-bold text-hpa-slate-7 mb-2 uppercase tracking-wider">Buscar Cartera Activa</p>
            <form onSubmit={searchLoans} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 text-hpa-slate-4" size={16} />
                <input
                  type="text"
                  placeholder="Ej: HPA-LN-001..."
                  className="input pl-9"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary btn-sm h-full" disabled={loading}>
                {loading ? <Spinner size={14} /> : 'Filtrar'}
              </button>
            </form>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="p-3 bg-hpa-slate-1 border-b border-hpa-slate-2">
              <p className="text-xs font-bold text-hpa-slate-6">Cuentas con Balance Pendiente</p>
            </div>
            
            <div className="divide-y divide-hpa-slate-2 max-h-[500px] overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center"><Spinner size={20} className="mx-auto" /></div>
              ) : activeLoans.length === 0 ? (
                <div className="p-6 text-center text-xs text-hpa-slate-4">No se encontraron cuentas activas.</div>
              ) : activeLoans.map(loan => (
                <div 
                  key={loan.id}
                  onClick={() => loadLoanDetails(loan)}
                  className={`p-3 text-xs cursor-pointer transition-colors flex items-center justify-between ${selectedLoan?.id === loan.id ? 'bg-hpa-slate-2 border-l-4 border-hpa-700' : 'hover:bg-hpa-slate-1'}`}
                >
                  <div>
                    <p className="font-mono font-bold text-hpa-700">{loan.loan_code}</p>
                    <p className="font-medium mt-0.5 text-hpa-slate-8">{loan.clients?.first_name} {loan.clients?.last_name}</p>
                    <p className="text-[10px] text-hpa-slate-4 mt-0.5">Mora: {loan.days_overdue || 0} días</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-hpa-slate-9 font-numeric">{fmt(loan.balance_total, loan.currency)}</p>
                    <span className="inline-block mt-1 scale-90"><StatusBadge status={loan.status} /></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          {selectedLoan ? (
            <div className="space-y-4 animate-fade-in">
              <div className="card p-4 bg-hpa-slate-9 text-white border-0 grid grid-cols-3 gap-2 text-center">
                <div className="border-r border-white/10">
                  <p className="text-[10px] text-white/60 uppercase">Capital Pendiente</p>
                  <p className="text-sm font-bold font-numeric mt-0.5">{fmt(selectedLoan.balance_principal, selectedLoan.currency)}</p>
                </div>
                <div className="border-r border-white/10">
                  <p className="text-[10px] text-white/60 uppercase">Interés Acumulado</p>
                  <p className="text-sm font-bold font-numeric mt-0.5">{fmt(selectedLoan.balance_interest, selectedLoan.currency)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/60 uppercase text-amber-300">Mora / Penalidad</p>
                  <p className="text-sm font-bold font-numeric mt-0.5 text-amber-300">{fmt(selectedLoan.balance_penalties, selectedLoan.currency)}</p>
                </div>
              </div>

              <div className="card p-0">
                <div className="p-4 border-b border-hpa-slate-2 flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-hpa-slate-7">Calendario de Amortización</h3>
                    <p className="text-[11px] text-hpa-slate-4 mt-0.5">Historial estructurado y vencimientos de cuotas</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-semibold text-hpa-slate-7">Balance Total Exigible</p>
                    <p className="text-sm font-bold text-hpa-700 font-numeric">{fmt(selectedLoan.balance_total, selectedLoan.currency)}</p>
                  </div>
                </div>

                <div className="table-wrapper max-h-[450px] overflow-y-auto">
                  <table className="table text-xs">
                    <thead>
                      <tr>
                        <th>Cuota</th>
                        <th>Vencimiento</th>
                        <th>Monto Cuota</th>
                        <th>Pagado</th>
                        <th>Pendiente</th>
                        <th>Estado</th>
                        <th className="text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingSchedule ? (
                        <tr><td colSpan={7} className="py-12 text-center"><Spinner size={16} className="mx-auto" /></td></tr>
                      ) : schedule.map(inst => (
                        <tr key={inst.id} className={inst.status === 'paid' ? 'bg-emerald-50/40 text-hpa-slate-4' : inst.days_overdue > 0 ? 'bg-red-50/40' : ''}>
                          <td className="font-bold">#{inst.installment_num}</td>
                          <td>{fmtDate(inst.due_date)}</td>
                          <td className="font-numeric">{fmt(inst.total_due, selectedLoan.currency)}</td>
                          <td className="text-emerald-600 font-numeric">{fmt(inst.total_paid || 0, selectedLoan.currency)}</td>
                          <td className="font-bold font-numeric">{fmt(inst.balance ?? inst.total_due, selectedLoan.currency)}</td>
                          <td>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${inst.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : inst.status === 'partial' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                              {inst.status === 'paid' ? 'PAGADO' : inst.status === 'partial' ? 'ABONADO' : 'PENDIENTE'}
                            </span>
                          </td>
                          <td className="text-center">
                            {inst.status !== 'paid' ? (
                              <button 
                                onClick={() => openPaymentModal(inst)}
                                className="btn btn-primary px-2 py-1 text-[10px] font-bold rounded flex items-center gap-1 mx-auto"
                              >
                                <DollarSign size={10} /> Cobrar
                              </button>
                            ) : (
                              <span className="text-[10px] text-emerald-600 font-bold">Completo ✓</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="card py-16">
              <Empty 
                icon={Receipt} 
                title="Ningún préstamo seleccionado" 
                desc="Seleccione una cuenta de la cartera activa en el panel de la izquierda para desplegar y procesar su cobranza." 
              />
            </div>
          )}
        </div>
      </div>

      <Modal
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title={`Aplicar Cobro — Cuota #${selectedInstallment?.installment_num}`}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowPaymentModal(false)}>Cancelar</button>
            <button 
              className="btn btn-primary" 
              onClick={handleApplyPayment}
              disabled={submittingPayment || !activeSession}
            >
              {submittingPayment ? <Spinner size={14} /> : 'Procesar e Imprimir Recibo'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-hpa-slate-1 p-3 rounded-xl border border-hpa-slate-2 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-hpa-slate-5">Monto original pactado:</span>
              <span className="font-bold font-numeric">{fmt(selectedInstallment?.total_due, selectedLoan?.currency)}</span>
            </div>
            <div className="flex justify-between text-emerald-600">
              <span>Total ya abonado a esta cuota:</span>
              <span className="font-bold font-numeric">-{fmt(selectedInstallment?.total_paid || 0, selectedLoan?.currency)}</span>
            </div>
            <div className="flex justify-between border-t border-hpa-slate-3 pt-1 font-bold text-sm text-hpa-700">
              <span>Balance Neto Exigible:</span>
              <span className="font-numeric">{fmt(selectedInstallment?.balance ?? selectedInstallment?.total_due, selectedLoan?.currency)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto Recibido (RD$)" required>
              <input 
                type="number" 
                className="input font-bold" 
                placeholder="0.00"
                value={paymentForm.amount}
                onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))}
              />
            </Field>

            <Field label="Método de Pago" required>
              <select 
                className="select" 
                value={paymentForm.payment_method}
                onChange={e => setPaymentForm(p => ({ ...p, payment_method: e.target.value }))}
              >
                <option value="cash">Efectivo</option>
                <option value="bank_transfer">Transferencia Bancaria</option>
                <option value="deposit">Depósito por Ventanilla</option>
              </select>
            </Field>
          </div>

          <Field label="Referencia de Transacción (Opcional)">
            <input 
              type="text" 
              className="input" 
              placeholder="Ej: Número de aprobación o transferencia..."
              value={paymentForm.reference}
              onChange={e => setPaymentForm(p => ({ ...p, reference: e.target.value }))}
            />
          </Field>

          <Field label="Notas del Recibo">
            <textarea 
              className="input h-16 resize-none" 
              placeholder="Detalles adicionales del pago..."
              value={paymentForm.notes}
              onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

export default Collections
