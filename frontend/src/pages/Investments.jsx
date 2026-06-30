import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, Landmark, Plus, RefreshCw } from 'lucide-react'
import { supabase, fmt, fmtDate } from '@/lib/supabase'
import { Modal, Field, Spinner, Empty } from '@/components/ui'
import useAuthStore from '@/store/auth'

function Investments() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id

  const [loading, setLoading] = useState(false)
  const [investmentsList, setInvestmentsList] = useState([])
  const [selectedInvestment, setSelectedInvestment] = useState(null)
  const [yields, setYields] = useState([])
  const [loadingDetails, setLoadingDetails] = useState(false)

  const [showMovementModal, setShowMovementModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [movementForm, setMovementForm] = useState({
    type: 'deposit',
    amount: '',
    reference: '',
    notes: ''
  })

  const loadInvestments = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('investments')
        .select('id, investor_name, investor_code, principal_amount, current_balance, annual_rate, status, currency')
        .eq('company_id', companyId)
        .order('investor_name', { ascending: true })

      if (error) throw error
      setInvestmentsList(data || [])
      if (data?.length > 0 && !selectedInvestment) {
        loadInvestmentDetails(data[0])
      }
    } catch (err) {
      console.error('Error cargando inversiones:', err.message)
    }
    setLoading(false)
  }, [companyId, selectedInvestment])

  const loadInvestmentDetails = async (investment) => {
    setSelectedInvestment(investment)
    setLoadingDetails(true)
    try {
      const { data, error } = await supabase
        .from('investment_yields')
        .select('*')
        .eq('investment_id', investment.id)
        .order('period_end', { ascending: false })

      if (error) throw error
      setYields(data || [])
    } catch (err) {
      console.error('Error cargando rendimientos:', err.message)
    }
    setLoadingDetails(false)
  }

  useEffect(() => {
    if (companyId) loadInvestments()
  }, [companyId, loadInvestments])

  const handleApplyMovement = async (e) => {
    e.preventDefault()
    const monto = parseFloat(movementForm.amount)
    if (isNaN(monto) || monto <= 0) {
      alert('Ingrese un monto válido mayor a cero.')
      return
    }

    setSubmitting(true)
    try {
      const { error: moveErr } = await supabase
        .from('investment_movements')
        .insert([{
          investment_id: selectedInvestment.id,
          type: movementForm.type,
          amount: monto,
          reference: movementForm.reference || null,
          notes: movementForm.notes || null,
          created_by: user.id
        }])

      if (moveErr) throw moveErr

      const esDeposito = movementForm.type === 'deposit'
      const factor = esDeposito ? 1 : -1
      const nuevoPrincipal = esDeposito ? parseFloat(selectedInvestment.principal_amount) + monto : parseFloat(selectedInvestment.principal_amount)
      const nuevoBalance = parseFloat(selectedInvestment.current_balance) + (monto * factor)

      const { error: invErr } = await supabase
        .from('investments')
        .update({ principal_amount: nuevoPrincipal, current_balance: nuevoBalance })
        .eq('id', selectedInvestment.id)

      if (invErr) throw invErr

      alert('¡Movimiento procesado con éxito!')
      setShowMovementModal(false)
      setMovementForm({ type: 'deposit', amount: '', reference: '', notes: '' })
      
      const updatedInv = { ...selectedInvestment, principal_amount: nuevoPrincipal, current_balance: nuevoBalance }
      setSelectedInvestment(updatedInv)
      loadInvestments()
      loadInvestmentDetails(updatedInv)
    } catch (err) {
      alert('Error procesando movimiento: ' + err.message)
    }
    setSubmitting(false)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-hpa-slate-2 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Inversionistas y Fondeo</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">Control de capital social y liquidación de rendimientos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 space-y-4">
          <div className="card p-0 overflow-hidden">
            <div className="p-3 bg-hpa-slate-1 border-b border-hpa-slate-2 flex justify-between items-center">
              <p className="text-xs font-bold text-hpa-slate-6 uppercase">Cuentas de Fondeo</p>
              <button onClick={loadInvestments} className="btn btn-ghost p-1">
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
            
            <div className="divide-y divide-hpa-slate-2 max-h-[500px] overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center"><Spinner size={20} className="mx-auto" /></div>
              ) : investmentsList.map(inv => (
                <div key={inv.id} onClick={() => loadInvestmentDetails(inv)} className={`p-3 text-xs cursor-pointer transition-colors flex items-center justify-between ${selectedInvestment?.id === inv.id ? 'bg-hpa-slate-2 border-l-4 border-hpa-700' : 'hover:bg-hpa-slate-1'}`}>
                  <div>
                    <p className="font-mono font-bold text-hpa-700">{inv.investor_code}</p>
                    <p className="font-bold text-hpa-slate-8 mt-0.5">{inv.investor_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-hpa-slate-9 font-numeric">{fmt(inv.current_balance, inv.currency)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          {selectedInvestment ? (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-4">
                <div className="card p-4 bg-white border border-hpa-slate-2 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] text-hpa-slate-4 font-bold uppercase">Capital Semilla</p>
                    <p className="text-lg font-black text-hpa-slate-9 font-numeric mt-1">{fmt(selectedInvestment.principal_amount, selectedInvestment.currency)}</p>
                  </div>
                  <div className="p-2 bg-hpa-slate-1 rounded-lg"><Landmark size={18} /></div>
                </div>

                <div className="card p-4 bg-emerald-950 text-white border-0 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] text-emerald-300 font-bold uppercase">Balance Líquido</p>
                    <p className="text-lg font-black text-emerald-400 font-numeric mt-1">{fmt(selectedInvestment.current_balance, selectedInvestment.currency)}</p>
                  </div>
                  <button onClick={() => setShowMovementModal(true)} className="p-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold px-3 flex items-center gap-1">
                    <Plus size={12} /> Transaccionar
                  </button>
                </div>
              </div>

              <div className="card p-0">
                <div className="p-4 border-b border-hpa-slate-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-hpa-slate-7">Historial de Rendimientos Generados</h3>
                </div>
                <div className="table-wrapper">
                  <table className="table text-xs">
                    <thead>
                      <tr>
                        <th>Período</th>
                        <th>Tasa</th>
                        <th className="text-right">Rendimiento Ganado</th>
                        <th className="text-right">Balance de Cierre</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingDetails ? (
                        <tr><td colSpan={4} className="py-8 text-center"><Spinner size={14} className="mx-auto" /></td></tr>
                      ) : yields.length === 0 ? (
                        <tr><td colSpan={4} className="py-8 text-center"><Empty icon={TrendingUp} title="Sin rendimientos" desc="No hay cortes de ganancias aplicados aún." /></td></tr>
                      ) : yields.map(yd => (
                        <tr key={yd.id}>
                          <td>{fmtDate(yd.period_start)} al {fmtDate(yd.period_end)}</td>
                          <td>{yd.rate_applied}%</td>
                          <td className="text-right text-emerald-600 font-bold font-numeric">+{fmt(yd.yield_amount, selectedInvestment.currency)}</td>
                          <td className="text-right font-numeric">{fmt(yd.closing_balance, selectedInvestment.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="card py-16 text-center text-xs text-hpa-slate-4">Seleccione una cuenta de fondeo.</div>
          )}
        </div>
      </div>

      <Modal open={showMovementModal} onClose={() => setShowMovementModal(false)} title="Registrar Movimiento de Capital" footer={
        <>
          <button className="btn btn-ghost" onClick={() => setShowMovementModal(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleApplyMovement} disabled={submitting}>
            {submitting ? <Spinner size={14} /> : 'Aplicar Movimiento'}
          </button>
        </>
      }>
        <div className="space-y-4">
          <Field label="Tipo de Movimiento" required>
            <select className="select" value={movementForm.type} onChange={e => setMovementForm(p => ({ ...p, type: e.target.value }))}>
              <option value="deposit">Aporte / Inyección de Capital (+)</option>
              <option value="withdrawal">Retiro / Reducción de Capital (-)</option>
            </select>
          </Field>
          <Field label="Monto" required>
            <input type="number" step="0.01" className="input" placeholder="0.00" value={movementForm.amount} onChange={e => setMovementForm(p => ({ ...p, amount: e.target.value }))} />
          </Field>
          <Field label="Referencia u Orden">
            <input type="text" className="input" placeholder="Ej. Depósito bancario #..." value={movementForm.reference} onChange={e => setMovementForm(p => ({ ...p, reference: e.target.value }))} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

export default Investments
