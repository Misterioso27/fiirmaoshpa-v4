import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, Plus, X } from 'lucide-react'
import { supabase, fmt, fmtDate, fmtPercent } from '@/lib/supabase'
import { StatusBadge, Modal, Field, Pagination, Empty, Spinner } from '@/components/ui'
import useAuthStore from '@/store/auth'

const CURRENCIES = {
  DOP: { symbol: 'RD$', flag: '🇩🇴' },
  BRL: { symbol: 'R$',  flag: '🇧🇷' },
  USD: { symbol: '$',   flag: '🇺🇸' },
  EUR: { symbol: '€',   flag: '🇪🇺' },
  GBP: { symbol: '£',   flag: '🇬🇧' },
}

function fmtC(amount, currency = 'DOP') {
  const c = CURRENCIES[currency] || CURRENCIES.DOP
  return `${c.symbol} ${parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Simulador con interés compuesto real
function calcSimulator({ amount, rate, months }) {
  const p  = parseFloat(amount  || 0)
  const r  = parseFloat(rate    || 0) / 100
  const m  = parseInt(months    || 0)
  if (!p || !r || !m) return { final: 0, yieldTotal: 0, schedule: [] }
  const schedule = []
  let balance = p
  for (let i = 1; i <= m; i++) {
    const yieldMonth = Math.round(balance * r * 100) / 100
    balance = Math.round((balance + yieldMonth) * 100) / 100
    schedule.push({ month: i, yield: yieldMonth, balance })
  }
  return { final: balance, yieldTotal: Math.round((balance - p) * 100) / 100, schedule }
}

export default function Investments() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id || 'a0000000-0000-4000-8000-000000000001'
  const branchId  = user?.branch?.id  || 'b0000000-0000-4000-8000-000000000001'

  const [investments, setInvestments]   = useState([])
  const [loading, setLoading]           = useState(true)
  const [page, setPage]                 = useState(1)
  const [pagination, setPagination]     = useState({})
  const [status, setStatus]             = useState('')

  // Simulador
  const [simAmount, setSimAmount]       = useState(100000)
  const [simRate, setSimRate]           = useState(3)
  const [simMonths, setSimMonths]       = useState(12)
  const [simCurrency, setSimCurrency]   = useState('BRL')
  const [showSimSchedule, setShowSimSchedule] = useState(false)

  // Modal nuevo depósito
  const [showModal, setShowModal]       = useState(false)
  const [clients, setClients]           = useState([])
  const [form, setForm]                 = useState({
    client_id:    '',
    currency:     'BRL',
    amount:       '',
    rate_monthly: 3,
    months:       12,
    maturity_date:'',
    notes:        '',
  })
  const [saving, setSaving]             = useState(false)
  const [formCalc, setFormCalc]         = useState({ final: 0, yieldTotal: 0, schedule: [] })

  // Recalcular preview del formulario
  useEffect(() => {
    setFormCalc(calcSimulator({
      amount: form.amount,
      rate:   form.rate_monthly,
      months: form.months,
    }))
  }, [form.amount, form.rate_monthly, form.months])

  // Simulador público
  const simResult = calcSimulator({ amount: simAmount, rate: simRate, months: simMonths })

  // ── Cargar inversiones ────────────────────────────────────
  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const limit  = 20
      const offset = (page - 1) * limit
      let query = supabase
        .from('investments')
        .select(`
          id, investment_code, currency, amount,
          current_balance, accrued_yield, total_yield_paid,
          rate_monthly, tier, status, opened_at, maturity_date,
          clients(first_name, last_name, client_code, email),
          financial_products(name, code)
        `, { count: 'exact' })
        .eq('company_id', companyId)
        .range(offset, offset + limit - 1)
        .order('opened_at', { ascending: false })

      if (status) query = query.eq('status', status)

      const { data, error, count } = await query
      if (!error) {
        setInvestments(data || [])
        setPagination({ total: count, page, limit, pages: Math.ceil((count || 0) / limit) })
      }
    } catch (err) { console.error(err) }
    setLoading(false)
  }, [page, status, companyId])

  useEffect(() => { load() }, [load])

  // ── Abrir modal nuevo depósito ────────────────────────────
  async function openNew() {
    setForm({ client_id: '', currency: 'BRL', amount: '', rate_monthly: 3, months: 12, maturity_date: '', notes: '' })
    setShowModal(true)
    try {
      const { data } = await supabase
        .from('clients')
        .select('id, first_name, last_name, client_code')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .eq('kyc_status', 'approved')
        .order('first_name')
        .limit(100)
      setClients(data || [])
    } catch (e) { console.error(e) }
  }

  function fc(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // ── Guardar nuevo depósito ────────────────────────────────
  async function saveInvestment() {
    if (!form.client_id)  return alert('Selecciona un cliente')
    if (!form.amount)     return alert('El monto es obligatorio')
    if (!form.rate_monthly) return alert('La tasa mensual es obligatoria')
    setSaving(true)
    try {
      const amount = parseFloat(String(form.amount).replace(/,/g, ''))
      if (isNaN(amount) || amount <= 0) throw new Error('Monto inválido')

      // Determinar tier por monto en BRL
      let tier = 'standard'
      const amountBRL = form.currency === 'BRL' ? amount
                      : form.currency === 'USD' ? amount * 5.5
                      : form.currency === 'DOP' ? amount * 0.095
                      : amount

      if (amountBRL >= 50000) tier = 'premium'
      if (amountBRL >= 200000) tier = 'corporate'

      // Generar código
      const { count } = await supabase
        .from('investments')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)

      const investment_code = `HPA-I-${String((count || 0) + 1).padStart(4, '0')}`

      // Calcular fecha de vencimiento si no fue ingresada
      let maturity_date = form.maturity_date || null
      if (!maturity_date && form.months) {
        const d = new Date()
        d.setMonth(d.getMonth() + parseInt(form.months))
        maturity_date = d.toISOString().split('T')[0]
      }

      // 1. Crear inversión
      const { data: inv, error: invErr } = await supabase
        .from('investments')
        .insert({
          company_id:       companyId,
          branch_id:        branchId,
          investment_code,
          client_id:        form.client_id,
          product_id:       null,
          currency:         form.currency,
          amount,
          amount_base:      parseFloat(amountBRL.toFixed(2)),
          fx_rate_at_open:  1,
          rate_monthly:     parseFloat(form.rate_monthly),
          tier,
          capitalization:   'compound',
          status:           'active',
          opened_at:        new Date().toISOString(),
          maturity_date,
          current_balance:  amount,
          accrued_yield:    0,
          total_yield_paid: 0,
          created_by:       user.id,
        })
        .select()
        .single()

      if (invErr) throw new Error(invErr.message)

      // 2. Registrar movimiento de apertura
      await supabase.from('investment_movements').insert({
        investment_id: inv.id,
        type:          'opening',
        amount,
        currency:      form.currency,
        fx_rate:       1,
        amount_base:   parseFloat(amountBRL.toFixed(2)),
        balance_after: amount,
        description:   `Apertura de inversión ${investment_code}`,
        created_by:    user.id,
      })

      // 3. Snapshot de condiciones
      await supabase.from('contract_snapshots').insert({
        entity_type: 'investment',
        entity_id:   inv.id,
        product_id:  null,
        snapshot: {
          rate_monthly:   parseFloat(form.rate_monthly),
          currency:       form.currency,
          amount,
          tier,
          months:         parseInt(form.months),
          maturity_date,
          notes:          form.notes || null,
        },
        fx_rate_snapshot: {
          currency:    form.currency,
          rate:        1,
          base:        'BRL',
          recorded_at: new Date().toISOString(),
        },
      })

      // 4. Auditoría
      await supabase.from('audit_log').insert({
        company_id:  companyId,
        actor_id:    user.id,
        actor_type:  'user',
        actor_name:  user.full_name || user.email,
        action:      'CREATE_INVESTMENT',
        module:      'investments',
        record_id:   inv.id,
        record_type: 'investment',
        new_value:   { investment_code, amount, currency: form.currency, rate_monthly: form.rate_monthly, tier },
      })

      setShowModal(false)
      load()
      alert(
        `✅ Depósito registrado exitosamente.\n` +
        `Código: ${investment_code}\n` +
        `Monto: ${fmtC(amount, form.currency)}\n` +
        `Tasa: ${form.rate_monthly}% mensual · Tier: ${tier.toUpperCase()}\n` +
        `Vencimiento: ${maturity_date || '—'}`
      )
    } catch (err) { alert('❌ ' + err.message) }
    setSaving(false)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Inversiones</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">{pagination.total || 0} depósitos registrados</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={14} /> Nuevo Depósito
        </button>
      </div>

      {/* Simulador */}
      <div className="card bg-gradient-to-r from-hpa-900 to-hpa-700 text-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-hpa-gold">Simulador de Rendimiento</h3>
          <button
            className="text-xs text-white/60 hover:text-white underline"
            onClick={() => setShowSimSchedule(!showSimSchedule)}
          >
            {showSimSchedule ? 'Ocultar tabla' : 'Ver tabla mensual'}
          </button>
        </div>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <Field label={<span className="text-white/60 text-xs">Moneda</span>}>
            <select className="input bg-white/10 border-white/20 text-white text-sm"
              value={simCurrency} onChange={e => setSimCurrency(e.target.value)}>
              {Object.entries(CURRENCIES).map(([k, v]) => (
                <option key={k} value={k}>{v.flag} {k}</option>
              ))}
            </select>
          </Field>
          <Field label={<span className="text-white/60 text-xs">Capital</span>}>
            <input className="input bg-white/10 border-white/20 text-white" type="number"
              value={simAmount} onChange={e => setSimAmount(+e.target.value)} />
          </Field>
          <Field label={<span className="text-white/60 text-xs">Tasa mensual (%)</span>}>
            <input className="input bg-white/10 border-white/20 text-white" type="number" step="0.1"
              value={simRate} onChange={e => setSimRate(+e.target.value)} />
          </Field>
          <Field label={<span className="text-white/60 text-xs">Plazo (meses)</span>}>
            <input className="input bg-white/10 border-white/20 text-white" type="number"
              value={simMonths} onChange={e => setSimMonths(+e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/20">
          <div>
            <p className="text-xs text-white/50 mb-0.5">Capital</p>
            <p className="text-lg font-bold font-numeric">{fmtC(simAmount, simCurrency)}</p>
          </div>
          <div>
            <p className="text-xs text-white/50 mb-0.5">Rendimiento Total</p>
            <p className="text-lg font-bold font-numeric text-hpa-gold">{fmtC(simResult.yieldTotal, simCurrency)}</p>
          </div>
          <div>
            <p className="text-xs text-white/50 mb-0.5">Total Final</p>
            <p className="text-lg font-bold font-numeric text-emerald-400">{fmtC(simResult.final, simCurrency)}</p>
          </div>
        </div>

        {/* Tabla mensual del simulador */}
        {showSimSchedule && simResult.schedule.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/20 max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-white/50">
                  <th className="text-left py-1">Mes</th>
                  <th className="text-right py-1">Rendimiento</th>
                  <th className="text-right py-1">Balance</th>
                </tr>
              </thead>
              <tbody>
                {simResult.schedule.map(s => (
                  <tr key={s.month} className="border-t border-white/10">
                    <td className="py-1 text-white/70">Mes {s.month}</td>
                    <td className="py-1 text-right text-hpa-gold font-numeric">+{fmtC(s.yield, simCurrency)}</td>
                    <td className="py-1 text-right text-emerald-400 font-numeric">{fmtC(s.balance, simCurrency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <select className="select w-40" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Todos los estados</option>
          {['active','paused','closed','liquidated'].map(s =>
            <option key={s} value={s}>{s}</option>
          )}
        </select>
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th><th>Cliente</th><th>Moneda</th><th>Monto</th>
                <th>Tasa</th><th>Saldo</th><th>Rendimiento</th>
                <th>Tier</th><th>Estado</th><th>Apertura</th><th>Vencimiento</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="py-12 text-center"><Spinner size={20} className="mx-auto" /></td></tr>
              ) : investments.length === 0 ? (
                <tr><td colSpan={11}>
                  <Empty icon={TrendingUp} title="Sin inversiones" desc="Registra el primer depósito" />
                </td></tr>
              ) : investments.map(inv => (
                <tr key={inv.id}>
                  <td className="font-mono text-xs font-semibold text-hpa-700">{inv.investment_code}</td>
                  <td>
                    <p className="font-medium text-sm">{inv.clients?.first_name} {inv.clients?.last_name}</p>
                    <p className="text-xs text-hpa-slate-5">{inv.clients?.client_code}</p>
                  </td>
                  <td>
                    <span className="badge badge-blue">{inv.currency}</span>
                  </td>
                  <td className="font-numeric font-semibold">{fmtC(inv.amount, inv.currency)}</td>
                  <td className="font-numeric text-hpa-700 font-semibold">{fmtPercent ? fmtPercent(inv.rate_monthly) : `${inv.rate_monthly}%`}</td>
                  <td className="font-numeric font-semibold">{fmtC(inv.current_balance, inv.currency)}</td>
                  <td className="font-numeric text-emerald-600 font-semibold">{fmtC(inv.accrued_yield, inv.currency)}</td>
                  <td>
                    <span className={`badge ${
                      inv.tier === 'premium'   ? 'badge-gold' :
                      inv.tier === 'corporate' ? 'badge-blue' : 'badge-gray'
                    }`}>
                      {inv.tier || 'standard'}
                    </span>
                  </td>
                  <td><StatusBadge status={inv.status} /></td>
                  <td className="text-xs text-hpa-slate-5">{fmtDate(inv.opened_at)}</td>
                  <td className="text-xs text-hpa-slate-5">
                    {inv.maturity_date ? fmtDate(inv.maturity_date) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={pagination.pages} total={pagination.total} limit={20} onChange={setPage} />
      </div>

      {/* ── MODAL NUEVO DEPÓSITO ──────────────────────────────── */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title="Nuevo Depósito de Inversión" size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveInvestment} disabled={saving}>
              {saving ? <Spinner size={14} /> : '✓ Registrar Depósito'}
            </button>
          </>
        }>
        <div className="space-y-4">
          {/* Cliente */}
          <Field label="Inversionista (Cliente con KYC aprobado)" required>
            <select className="select" value={form.client_id} onChange={e => fc('client_id', e.target.value)}>
              <option value="">Seleccionar cliente...</option>
              {clients.length === 0
                ? <option disabled>No hay clientes con KYC aprobado</option>
                : clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.first_name} {c.last_name} — {c.client_code}
                    </option>
                  ))
              }
            </select>
          </Field>

          {/* Moneda y monto */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Moneda del depósito" required>
              <select className="select" value={form.currency} onChange={e => fc('currency', e.target.value)}>
                {Object.entries(CURRENCIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.flag} {k} — {k === 'BRL' ? 'Real Brasileño' : k === 'DOP' ? 'Peso Dominicano' : k === 'USD' ? 'Dólar' : k === 'EUR' ? 'Euro' : 'Libra'}</option>
                ))}
              </select>
            </Field>
            <Field label={`Monto del depósito (${form.currency})`} required>
              <input className="input" type="number" step="0.01" placeholder="0.00"
                value={form.amount} onChange={e => fc('amount', e.target.value)} />
            </Field>
          </div>

          {/* Tasa y plazo */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tasa mensual (%)" required>
              <input className="input" type="number" step="0.1" placeholder="3.0"
                value={form.rate_monthly} onChange={e => fc('rate_monthly', e.target.value)} />
            </Field>
            <Field label="Plazo (meses)">
              <input className="input" type="number" min="1" placeholder="12"
                value={form.months} onChange={e => fc('months', e.target.value)} />
            </Field>
          </div>

          <Field label="Fecha de vencimiento (opcional)">
            <input className="input" type="date"
              value={form.maturity_date} onChange={e => fc('maturity_date', e.target.value)} />
          </Field>

          <Field label="Notas">
            <textarea className="input h-16 resize-none" placeholder="Condiciones especiales, observaciones..."
              value={form.notes} onChange={e => fc('notes', e.target.value)} />
          </Field>

          {/* Preview del rendimiento */}
          {form.amount && form.rate_monthly && form.months && (
            <div className="p-4 bg-hpa-slate-1 rounded-xl border border-hpa-slate-2">
              <p className="text-xs font-bold text-hpa-slate-7 mb-3 uppercase tracking-wide">
                Preview del rendimiento
              </p>
              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                <div>
                  <p className="text-hpa-slate-5">Capital</p>
                  <p className="font-bold text-hpa-slate-9 font-numeric">{fmtC(form.amount, form.currency)}</p>
                </div>
                <div>
                  <p className="text-hpa-slate-5">Rendimiento ({form.months}m)</p>
                  <p className="font-bold text-amber-600 font-numeric">{fmtC(formCalc.yieldTotal, form.currency)}</p>
                </div>
                <div>
                  <p className="text-hpa-slate-5">Total final</p>
                  <p className="font-bold text-emerald-600 font-numeric">{fmtC(formCalc.final, form.currency)}</p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-hpa-slate-2 text-xs text-center text-hpa-slate-5">
                Tier estimado: <strong className="text-hpa-700 uppercase">
                  {parseFloat(form.amount) >= 200000 ? 'CORPORATE' :
                   parseFloat(form.amount) >= 50000  ? 'PREMIUM' : 'STANDARD'}
                </strong>
                {form.currency !== 'BRL' && <span className="ml-2">(calculado en equivalente BRL)</span>}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
