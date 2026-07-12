import { useState, useEffect, useCallback } from 'react'
import { DollarSign, TrendingUp, TrendingDown, RefreshCw, Plus, X } from 'lucide-react'
import { supabase, fmt, fmtDate } from '@/lib/supabase'
import { Modal, Field, Empty, Spinner } from '@/components/ui'
import useAuthStore from '@/store/auth'

const CURRENCIES = {
  DOP: { symbol: 'RD$', flag: '🇩🇴' },
  BRL: { symbol: 'R$',  flag: '🇧🇷' },
  USD: { symbol: '$',   flag: '🇺🇸' },
}

function fmtC(amount, currency = 'DOP') {
  const c = CURRENCIES[currency] || CURRENCIES.DOP
  return `${c.symbol} ${parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const CATEGORY_LABELS = {
  loan_payment:        '💰 Cobro de Préstamo',
  investment_deposit:  '📈 Depósito Inversión',
  loan_disbursement:   '💸 Desembolso Préstamo',
  investment_withdrawal:'📤 Retiro Inversión',
  expense_operational: '🔧 Gasto Operacional',
  expense_admin:       '📋 Gasto Administrativo',
  transfer:            '🔄 Transferencia',
  adjustment:          '↩️ Ajuste / Reversión',
  other:               '📎 Otro',
}

const TYPE_COLORS = {
  income:       'text-emerald-600',
  expense:      'text-red-500',
  transfer_in:  'text-emerald-600',
  transfer_out: 'text-red-500',
  adjustment:   'text-amber-600',
}

export default function Cash() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id || 'a0000000-0000-4000-8000-000000000001'

  const [registers, setRegisters]       = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [movements, setMovements]       = useState([])
  const [loading, setLoading]           = useState(true)
  const [loadingMov, setLoadingMov]     = useState(false)
  const [refreshing, setRefreshing]     = useState(false)

  // Modal apertura
  const [showOpen, setShowOpen]         = useState(false)
  const [openForm, setOpenForm]         = useState({ opening_balance: '', notes: '' })
  const [openSaving, setOpenSaving]     = useState(false)

  // Modal cierre
  const [showClose, setShowClose]       = useState(false)
  const [closeForm, setCloseForm]       = useState({ closing_balance: '', notes: '' })
  const [closeSaving, setCloseSaving]   = useState(false)

  // Modal movimiento manual
  const [showMovement, setShowMovement] = useState(false)
  const [movForm, setMovForm]           = useState({ type: 'income', category: 'other', amount: '', description: '', currency: 'DOP' })
  const [movSaving, setMovSaving]       = useState(false)

  // ── Cargar cajas y sesión activa ─────────────────────────
  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      // 1. Obtener cajas de la empresa
      const { data: regs } = await supabase
        .from('cash_registers')
        .select('id, name, code, currency, status, current_balance, assigned_to')
        .eq('company_id', companyId)
        .order('name')

      setRegisters(regs || [])

      // 2. Buscar sesión abierta
      const openReg = (regs || []).find(r => r.status === 'open')
      if (openReg) {
        const { data: session } = await supabase
          .from('cash_sessions')
          .select('*, cash_registers(name, currency, code)')
          .eq('register_id', openReg.id)
          .eq('status', 'open')
          .single()

        setActiveSession(session || null)
        if (session) await loadMovements(session.id)
      } else {
        setActiveSession(null)
        setMovements([])
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [companyId])

  useEffect(() => { load() }, [load])

  // ── Cargar movimientos de la sesión ──────────────────────
  async function loadMovements(sessionId) {
    if (!sessionId) return
    setLoadingMov(true)
    try {
      const { data } = await supabase
        .from('cash_movements')
        .select(`
          id, movement_number, type, category, amount, currency,
          balance_after, description, receipt_number, created_at,
          clients(first_name, last_name),
          created_by_profile:profiles!cash_movements_created_by_fkey(full_name)
        `)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })

      setMovements(data || [])
    } catch (e) { console.error(e) }
    setLoadingMov(false)
  }

  // ── Refrescar manualmente ─────────────────────────────────
  async function refresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  // ── ABRIR SESIÓN DE CAJA ──────────────────────────────────
  async function openSession() {
    if (!registers.length) return alert('No hay cajas registradas para esta empresa.')
    const closedReg = registers.find(r => r.status === 'closed')
    if (!closedReg) return alert('Todas las cajas ya tienen una sesión abierta.')
    setOpenForm({ register_id: closedReg.id, opening_balance: '', notes: '' })
    setShowOpen(true)
  }

  async function confirmOpen() {
    if (!openForm.register_id) return alert('Selecciona una caja')
    setOpenSaving(true)
    try {
      const balance = parseFloat(openForm.opening_balance || 0)

      // Contar sesiones anteriores
      const { count } = await supabase
        .from('cash_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('register_id', openForm.register_id)

      const session_number = `SES-${String((count || 0) + 1).padStart(4, '0')}`

      const { data: session, error } = await supabase
        .from('cash_sessions')
        .insert({
          register_id:     openForm.register_id,
          session_number,
          opened_by:       user.id,
          opening_balance: balance,
          opening_notes:   openForm.notes || null,
          status:          'open',
          total_income:    0,
          total_expense:   0,
          total_movements: 0,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)

      // Actualizar estado de la caja
      await supabase.from('cash_registers')
        .update({ status: 'open', current_balance: balance })
        .eq('id', openForm.register_id)

      // Auditoría
      await supabase.from('audit_log').insert({
        company_id:  companyId,
        actor_id:    user.id,
        actor_type:  'user',
        actor_name:  user.full_name || user.email,
        action:      'OPEN_CASH_SESSION',
        module:      'cash',
        record_id:   session.id,
        record_type: 'cash_session',
        new_value:   { opening_balance: balance, session_number },
      })

      setShowOpen(false)
      await load()
    } catch (err) { alert('❌ ' + err.message) }
    setOpenSaving(false)
  }

  // ── CERRAR SESIÓN DE CAJA ─────────────────────────────────
  async function confirmClose() {
    if (!activeSession) return
    setCloseSaving(true)
    try {
      const closing_balance  = parseFloat(closeForm.closing_balance || 0)
      const income           = activeSession.total_income  || 0
      const expense          = activeSession.total_expense || 0
      const expected_balance = (activeSession.opening_balance || 0) + income - expense
      const difference       = parseFloat((closing_balance - expected_balance).toFixed(2))

      const { error } = await supabase
        .from('cash_sessions')
        .update({
          closed_by:       user.id,
          closing_balance,
          expected_balance: parseFloat(expected_balance.toFixed(2)),
          difference,
          closing_notes:   closeForm.notes || null,
          status:          'closed',
          closed_at:       new Date().toISOString(),
        })
        .eq('id', activeSession.id)

      if (error) throw new Error(error.message)

      await supabase.from('cash_registers')
        .update({ status: 'closed', current_balance: closing_balance })
        .eq('id', activeSession.register_id)

      // Auditoría
      await supabase.from('audit_log').insert({
        company_id:  companyId,
        actor_id:    user.id,
        actor_type:  'user',
        actor_name:  user.full_name || user.email,
        action:      'CLOSE_CASH_SESSION',
        module:      'cash',
        record_id:   activeSession.id,
        record_type: 'cash_session',
        new_value:   { closing_balance, expected_balance, difference },
      })

      setShowClose(false)
      await load()
    } catch (err) { alert('❌ ' + err.message) }
    setCloseSaving(false)
  }

  // ── REGISTRAR MOVIMIENTO MANUAL ───────────────────────────
  async function saveMovement() {
    if (!activeSession) return alert('No hay sesión de caja abierta')
    if (!movForm.amount || !movForm.description) return alert('Monto y descripción son obligatorios')
    setMovSaving(true)
    try {
      const amount = parseFloat(String(movForm.amount).replace(/,/g, ''))
      if (isNaN(amount) || amount <= 0) throw new Error('Monto inválido')

      const { count } = await supabase
        .from('cash_movements')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', activeSession.id)

      const movement_number = `MV-${String((count || 0) + 1).padStart(4, '0')}`

      // Calcular balance actual
      const current = (activeSession.opening_balance || 0) +
                      (activeSession.total_income    || 0) -
                      (activeSession.total_expense   || 0)

      const isIncome = ['income', 'transfer_in'].includes(movForm.type)
      const balance_after = isIncome ? current + amount : Math.max(0, current - amount)

      const { error } = await supabase.from('cash_movements').insert({
        session_id:     activeSession.id,
        company_id:     companyId,
        movement_number,
        type:           movForm.type,
        category:       movForm.category,
        amount,
        currency:       movForm.currency || 'DOP',
        fx_rate:        1,
        amount_base:    amount,
        balance_after:  parseFloat(balance_after.toFixed(2)),
        description:    movForm.description,
        receipt_number: movForm.receipt_number || null,
        created_by:     user.id,
      })

      if (error) throw new Error(error.message)

      // Auditoría
      await supabase.from('audit_log').insert({
        company_id:  companyId,
        actor_id:    user.id,
        actor_type:  'user',
        actor_name:  user.full_name || user.email,
        action:      `CASH_${movForm.type.toUpperCase()}`,
        module:      'cash',
        new_value:   { amount, category: movForm.category, description: movForm.description },
      })

      setShowMovement(false)
      setMovForm({ type: 'income', category: 'other', amount: '', description: '', currency: 'DOP' })
      await loadMovements(activeSession.id)
      await load()
    } catch (err) { alert('❌ ' + err.message) }
    setMovSaving(false)
  }

  // ── Cálculos del resumen ──────────────────────────────────
  const totalIncome  = movements.filter(m => ['income','transfer_in'].includes(m.type)).reduce((s, m) => s + parseFloat(m.amount || 0), 0)
  const totalExpense = movements.filter(m => ['expense','transfer_out'].includes(m.type)).reduce((s, m) => s + parseFloat(m.amount || 0), 0)
  const currentBalance = activeSession
    ? (activeSession.opening_balance || 0) + totalIncome - totalExpense
    : 0
  const currency = activeSession?.cash_registers?.currency || 'DOP'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size={24} />
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Control de Caja y Flujo</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">Gestión diaria de disponibilidad de efectivo</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </button>
          {!activeSession ? (
            <button className="btn btn-primary" onClick={openSession}>
              <Plus size={14} /> Abrir Caja
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => { setCloseForm({ closing_balance: currentBalance.toFixed(2), notes: '' }); setShowClose(true) }}>
              <X size={14} /> Realizar Cierre Diario
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Panel sesión activa */}
        <div className={`card col-span-1 ${activeSession ? 'border-emerald-200 bg-emerald-50/30' : 'border-hpa-slate-2'}`}>
          {activeSession ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Sesión Abierta</p>
                  <p className="text-xs text-hpa-slate-5 mt-0.5">{activeSession.cash_registers?.name}</p>
                </div>
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <p className="text-xs text-hpa-slate-5 mb-1">Disponible</p>
              <p className="text-3xl font-bold text-emerald-600 font-numeric mb-4">
                {fmtC(currentBalance, currency)}
              </p>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-hpa-slate-5">Apertura</span>
                  <span className="font-numeric font-semibold">{fmtC(activeSession.opening_balance || 0, currency)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-emerald-600">+ Ingresos</span>
                  <span className="font-numeric font-semibold text-emerald-600">{fmtC(totalIncome, currency)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-red-500">− Egresos</span>
                  <span className="font-numeric font-semibold text-red-500">{fmtC(totalExpense, currency)}</span>
                </div>
                <div className="border-t border-hpa-slate-2 pt-2 flex justify-between text-xs">
                  <span className="font-bold text-hpa-slate-7">Movimientos</span>
                  <span className="font-bold">{movements.length}</span>
                </div>
              </div>
              <button className="btn btn-primary w-full justify-center" onClick={() => { setMovForm({ type: 'income', category: 'other', amount: '', description: '', currency }); setShowMovement(true) }}>
                <Plus size={14} /> Registrar Movimiento
              </button>
            </>
          ) : (
            <>
              <p className="text-xs font-bold text-hpa-slate-6 uppercase tracking-wide mb-2">Sin Sesión Activa</p>
              <p className="text-sm text-hpa-slate-5 mb-4">No hay caja abierta. Abre una sesión para registrar movimientos.</p>
              <div className="space-y-2">
                {registers.map(r => (
                  <div key={r.id} className="p-2 bg-hpa-slate-1 rounded-lg flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-hpa-slate-9">{r.name}</p>
                      <p className="text-xs text-hpa-slate-5">{r.code} · {r.currency}</p>
                    </div>
                    <span className={`badge ${r.status === 'open' ? 'badge-green' : 'badge-gray'}`}>
                      {r.status === 'open' ? 'ABIERTA' : 'CERRADA'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Panel de movimientos */}
        <div className="card col-span-2 p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-hpa-slate-2 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-hpa-slate-9">Historial de Caja</h3>
              <p className="text-xs text-hpa-slate-5 mt-0.5">
                {activeSession ? `Sesión ${activeSession.session_number} · ${movements.length} movimientos` : 'Sin sesión activa'}
              </p>
            </div>
            {activeSession && (
              <button className="btn btn-ghost btn-sm" onClick={() => loadMovements(activeSession.id)} disabled={loadingMov}>
                <RefreshCw size={12} className={loadingMov ? 'animate-spin' : ''} />
              </button>
            )}
          </div>

          {!activeSession ? (
            <div className="p-8">
              <Empty icon={DollarSign} title="Sin sesión activa" desc="Abre una caja para ver los movimientos" />
            </div>
          ) : loadingMov ? (
            <div className="py-12 flex justify-center"><Spinner size={20} /></div>
          ) : movements.length === 0 ? (
            <div className="p-8">
              <Empty icon={DollarSign} title="Sin movimientos" desc="Registra el primer movimiento de esta sesión" />
            </div>
          ) : (
            <div className="table-wrapper max-h-[calc(100vh-300px)] overflow-y-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Tipo</th>
                    <th>Descripción</th>
                    <th>Cliente</th>
                    <th>Monto</th>
                    <th>Balance</th>
                    <th>Hora</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map(m => {
                    const isIncome = ['income', 'transfer_in'].includes(m.type)
                    return (
                      <tr key={m.id}>
                        <td className="font-mono text-xs text-hpa-slate-5">{m.movement_number}</td>
                        <td>
                          <div>
                            <p className="text-xs font-semibold">{CATEGORY_LABELS[m.category] || m.category}</p>
                            <span className={`text-xs font-bold ${TYPE_COLORS[m.type] || 'text-hpa-slate-5'}`}>
                              {isIncome ? '↑ INGRESO' : m.type === 'adjustment' ? '↩️ AJUSTE' : '↓ EGRESO'}
                            </span>
                          </div>
                        </td>
                        <td className="text-xs max-w-xs truncate">{m.description}</td>
                        <td className="text-xs text-hpa-slate-5">
                          {m.clients ? `${m.clients.first_name} ${m.clients.last_name}` : '—'}
                        </td>
                        <td>
                          <span className={`font-numeric font-bold text-sm ${isIncome ? 'text-emerald-600' : m.type === 'adjustment' ? 'text-amber-600' : 'text-red-500'}`}>
                            {isIncome ? '+' : '-'}{fmtC(m.amount, m.currency || currency)}
                          </span>
                        </td>
                        <td className="font-numeric text-xs text-hpa-slate-5">
                          {fmtC(m.balance_after, m.currency || currency)}
                        </td>
                        <td className="text-xs text-hpa-slate-5">
                          {new Date(m.created_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
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

      {/* ── MODAL ABRIR CAJA ─────────────────────────────────── */}
      <Modal open={showOpen} onClose={() => setShowOpen(false)} title="Abrir Sesión de Caja"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={confirmOpen} disabled={openSaving}>
              {openSaving ? <Spinner size={14} /> : '✓ Abrir Caja'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <Field label="Caja a abrir">
            <select className="select" value={openForm.register_id || ''} onChange={e => setOpenForm(f => ({ ...f, register_id: e.target.value }))}>
              {registers.filter(r => r.status === 'closed').map(r => (
                <option key={r.id} value={r.id}>{r.name} · {r.code} · {r.currency}</option>
              ))}
            </select>
          </Field>
          <Field label="Balance de apertura">
            <input className="input" type="number" step="0.01" placeholder="0.00"
              value={openForm.opening_balance}
              onChange={e => setOpenForm(f => ({ ...f, opening_balance: e.target.value }))} />
          </Field>
          <Field label="Notas de apertura">
            <textarea className="input h-16 resize-none" placeholder="Observaciones opcionales..."
              value={openForm.notes}
              onChange={e => setOpenForm(f => ({ ...f, notes: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      {/* ── MODAL CERRAR CAJA ─────────────────────────────────── */}
      <Modal open={showClose} onClose={() => setShowClose(false)} title="Realizar Cierre Diario"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowClose(false)}>Cancelar</button>
            <button className="btn btn-danger" onClick={confirmClose} disabled={closeSaving}>
              {closeSaving ? <Spinner size={14} /> : '✓ Confirmar Cierre'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="p-3 bg-hpa-slate-1 rounded-lg space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-hpa-slate-5">Balance apertura</span>
              <span className="font-numeric font-semibold">{fmtC(activeSession?.opening_balance || 0, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-600">Total ingresos</span>
              <span className="font-numeric font-semibold text-emerald-600">+{fmtC(totalIncome, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-red-500">Total egresos</span>
              <span className="font-numeric font-semibold text-red-500">-{fmtC(totalExpense, currency)}</span>
            </div>
            <div className="border-t border-hpa-slate-2 pt-2 flex justify-between font-bold">
              <span>Balance esperado</span>
              <span className="font-numeric">{fmtC(currentBalance, currency)}</span>
            </div>
          </div>
          <Field label="Balance físico en caja (conteo real)">
            <input className="input" type="number" step="0.01"
              value={closeForm.closing_balance}
              onChange={e => setCloseForm(f => ({ ...f, closing_balance: e.target.value }))} />
          </Field>
          {closeForm.closing_balance && (
            <div className={`p-3 rounded-lg text-xs font-semibold ${
              parseFloat(closeForm.closing_balance) === currentBalance
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              {parseFloat(closeForm.closing_balance) === currentBalance
                ? '✅ Cuadre perfecto'
                : `⚠️ Diferencia: ${fmtC(Math.abs(parseFloat(closeForm.closing_balance) - currentBalance), currency)}`
              }
            </div>
          )}
          <Field label="Notas de cierre">
            <textarea className="input h-16 resize-none" placeholder="Observaciones del cierre..."
              value={closeForm.notes}
              onChange={e => setCloseForm(f => ({ ...f, notes: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      {/* ── MODAL MOVIMIENTO MANUAL ───────────────────────────── */}
      <Modal open={showMovement} onClose={() => setShowMovement(false)} title="Registrar Movimiento Manual"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowMovement(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveMovement} disabled={movSaving}>
              {movSaving ? <Spinner size={14} /> : '✓ Registrar'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select className="select" value={movForm.type} onChange={e => setMovForm(f => ({ ...f, type: e.target.value }))}>
                <option value="income">↑ Ingreso</option>
                <option value="expense">↓ Egreso</option>
                <option value="adjustment">↩️ Ajuste</option>
              </select>
            </Field>
            <Field label="Categoría">
              <select className="select" value={movForm.category} onChange={e => setMovForm(f => ({ ...f, category: e.target.value }))}>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto" required>
              <input className="input" type="number" step="0.01" placeholder="0.00"
                value={movForm.amount}
                onChange={e => setMovForm(f => ({ ...f, amount: e.target.value }))} />
            </Field>
            <Field label="Moneda">
              <select className="select" value={movForm.currency} onChange={e => setMovForm(f => ({ ...f, currency: e.target.value }))}>
                {Object.entries(CURRENCIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.flag} {k}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Descripción" required>
            <input className="input" placeholder="Descripción del movimiento..."
              value={movForm.description}
              onChange={e => setMovForm(f => ({ ...f, description: e.target.value }))} />
          </Field>
          <Field label="Número de recibo (opcional)">
            <input className="input" placeholder="Ej: REC-001..."
              value={movForm.receipt_number || ''}
              onChange={e => setMovForm(f => ({ ...f, receipt_number: e.target.value }))} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
