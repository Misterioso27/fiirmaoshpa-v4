import { useState, useEffect } from 'react'
import { Calculator, TrendingUp, CreditCard, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'

const CURRENCIES = {
  DOP: { symbol: 'RD$', label: 'Peso Dominicano', flag: '🇩🇴' },
  BRL: { symbol: 'R$',  label: 'Real Brasileño',  flag: '🇧🇷' },
  USD: { symbol: '$',   label: 'Dolar Americano',  flag: '🇺🇸' },
}

function fmtC(amount, currency = 'DOP') {
  const c = CURRENCIES[currency] || CURRENCIES.DOP
  return `${c.symbol} ${parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function calcLoan({ monto, tasaMensual, meses, cuotas, frecuencia }) {
  const p = parseFloat(monto || 0)
  const rm = parseFloat(tasaMensual || 0) / 100
  const m = parseFloat(meses || 3)
  let totalCuotas = parseInt(cuotas) || 0
  let etiqueta = 'Cuota', diasPeriodo = 30
  if (!totalCuotas) {
    if (frecuencia === 'weekly')        { totalCuotas = m === 2.5 ? 10 : 12; diasPeriodo = 7;  etiqueta = 'Semana'   }
    else if (frecuencia === 'biweekly') { totalCuotas = m === 2.5 ? 5  : 6;  diasPeriodo = 15; etiqueta = 'Quincena' }
    else                                { totalCuotas = Math.round(m);        diasPeriodo = 30; etiqueta = 'Mes'      }
  } else {
    if (frecuencia === 'weekly') diasPeriodo = 7
    else if (frecuencia === 'biweekly') diasPeriodo = 15
  }
  if (!p || !rm || !totalCuotas) return null
  const totalInteres = Math.round(p * rm * 3 * 100) / 100
  const totalPagar = Math.round((p + totalInteres) * 100) / 100
  const montoCuota = Math.round((totalPagar / totalCuotas) * 100) / 100
  const base = new Date()
  const schedule = []
  let saldo = totalPagar
  for (let i = 1; i <= totalCuotas; i++) {
    const fechaVenc = new Date(base)
    if (frecuencia === 'monthly') fechaVenc.setMonth(fechaVenc.getMonth() + i)
    else fechaVenc.setDate(fechaVenc.getDate() + diasPeriodo * i)
    saldo = i === totalCuotas ? 0 : Math.max(0, Math.round((saldo - montoCuota) * 100) / 100)
    schedule.push({
      num: i,
      fecha: fechaVenc.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }),
      monto: montoCuota,
      principal: Math.round((p / totalCuotas) * 100) / 100,
      interes: Math.round((totalInteres / totalCuotas) * 100) / 100,
      balance: saldo,
    })
  }
  return { p, totalInteres, totalPagar, montoCuota, totalCuotas, etiqueta, schedule }
}

function calcInvestment({ monto, tasa, meses }) {
  const p = parseFloat(monto || 0)
  const r = parseFloat(tasa || 0) / 100
  const m = parseInt(meses || 0)
  if (!p || !r || !m) return null
  const schedule = []
  let balance = p
  for (let i = 1; i <= m; i++) {
    const y = Math.round(balance * r * 100) / 100
    balance = Math.round((balance + y) * 100) / 100
    schedule.push({ month: i, yield: y, balance })
  }
  return { initial: p, final: balance, yieldTotal: Math.round((balance - p) * 100) / 100, returnPct: parseFloat(((balance - p) / p * 100).toFixed(2)), schedule }
}

function Tab({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-6 py-3 font-semibold text-sm transition-all border-b-2 ${active ? 'border-[#1A3F7E] text-[#1A3F7E]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
      <Icon size={16} />{label}
    </button>
  )
}

export default function Simulator() {
  const [activeTab, setActiveTab] = useState('loan')
  const [loanForm, setLoanForm] = useState({ currency: 'DOP', monto: '', tasaMensual: 10, frecuencia: 'biweekly', meses: 2.5, cuotas: '' })
  const [loanResult, setLoanResult] = useState(null)
  const [showLoanSched, setShowLoanSched] = useState(false)
  const [invForm, setInvForm] = useState({ currency: 'BRL', monto: '', tasa: 3, meses: 12 })
  const [invResult, setInvResult] = useState(null)
  const [showInvSched, setShowInvSched] = useState(false)

  useEffect(() => { setLoanResult(loanForm.monto && loanForm.tasaMensual ? calcLoan(loanForm) : null) }, [loanForm])
  useEffect(() => { setInvResult(invForm.monto && invForm.tasa && invForm.meses ? calcInvestment(invForm) : null) }, [invForm])

  function lf(k, v) { setLoanForm(f => ({ ...f, [k]: v })) }
  function ivf(k, v) { setInvForm(f => ({ ...f, [k]: v })) }
  const tl = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1A3F7E] flex items-center justify-center">
              <span className="text-white font-black text-sm">HPA</span>
            </div>
            <div>
              <p className="font-black text-[#1A3F7E] text-sm leading-none">FIIRMAOSHPA</p>
              <p className="text-xs text-slate-400 leading-none mt-0.5">Simulador Financiero</p>
            </div>
          </div>
          <a href="/login" className="flex items-center gap-2 bg-[#1A3F7E] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#15336B] transition-colors">
            Acceder al Sistema <ArrowRight size={14} />
          </a>
        </div>
      </header>

      <div className="bg-gradient-to-r from-[#1A3F7E] to-[#0F2654] text-white py-12 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xs font-bold tracking-widest text-white/60 uppercase mb-3">Financiera e Inversiones Irmaos HPA SRL</p>
          <h1 className="text-3xl md:text-4xl font-black mb-3">Simulador Financiero</h1>
          <p className="text-white/70 text-sm max-w-xl mx-auto">Calcula en tiempo real las condiciones de tu prestamo o el rendimiento de tu inversion. Sin compromiso. Sin registro.</p>
          <div className="flex items-center justify-center gap-4 mt-6">
            {Object.entries(CURRENCIES).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full text-xs font-semibold">
                <span>{v.flag}</span><span>{k}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6">
        <div className="bg-white rounded-2xl shadow-lg mt-8 overflow-hidden">
          <div className="flex border-b border-slate-100">
            <Tab active={activeTab === 'loan'} onClick={() => setActiveTab('loan')} icon={CreditCard} label="Simulador de Prestamo" />
            <Tab active={activeTab === 'investment'} onClick={() => setActiveTab('investment')} icon={TrendingUp} label="Simulador de Inversion" />
          </div>
          <div className="p-6 md:p-8">
            {activeTab === 'loan' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 mb-1">Cuanto necesitas?</h2>
                  <p className="text-sm text-slate-500">Configura las condiciones y ve el cronograma en tiempo real</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Moneda</label>
                    <select className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" value={loanForm.currency} onChange={e => lf('currency', e.target.value)}>
                      {Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{v.flag} {k}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Monto</label>
                    <input type="number" placeholder="35000" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" value={loanForm.monto} onChange={e => lf('monto', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tasa Mensual (%)</label>
                    <input type="number" step="0.5" placeholder="10" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" value={loanForm.tasaMensual} onChange={e => lf('tasaMensual', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Frecuencia</label>
                    <select className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" value={loanForm.frecuencia} onChange={e => { lf('frecuencia', e.target.value); lf('cuotas', '') }}>
                      <option value="weekly">Semanal</option>
                      <option value="biweekly">Quincenal</option>
                      <option value="monthly">Mensual</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Plazo (meses)</label>
                    <select className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" value={loanForm.meses} onChange={e => { lf('meses', parseFloat(e.target.value)); lf('cuotas', '') }}>
                      <option value={2.5}>2.5 Meses</option>
                      <option value={3}>3 Meses</option>
                      <option value={6}>6 Meses</option>
                      <option value={12}>12 Meses</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Cuotas{loanResult ? ` (sug: ${loanResult.totalCuotas})` : ''}</label>
                    <input type="number" min="1" placeholder="Auto" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" value={loanForm.cuotas} onChange={e => lf('cuotas', e.target.value)} />
                  </div>
                </div>
                {loanResult ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { l: 'Cuota', v: fmtC(loanResult.montoCuota, loanForm.currency), c: 'text-[#1A3F7E]' },
                        { l: 'Interes Total', v: fmtC(loanResult.totalInteres, loanForm.currency), c: 'text-amber-600' },
                        { l: 'Total a Pagar', v: fmtC(loanResult.totalPagar, loanForm.currency), c: 'text-slate-900' },
                        { l: 'Capital', v: fmtC(loanResult.p, loanForm.currency), c: 'text-emerald-600' },
                      ].map(s => (
                        <div key={s.l} className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                          <p className="text-xs text-slate-500 mb-1">{s.l}</p>
                          <p className={`font-bold text-sm ${s.c}`}>{s.v}</p>
                        </div>
                      ))}
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-[#1A3F7E] flex items-center gap-2">
                      <Calculator size={14} />
                      <span><strong>{tl[loanForm.frecuencia]}</strong> · {loanResult.totalCuotas} cuotas de <strong>{fmtC(loanResult.montoCuota, loanForm.currency)}</strong> · Tasa {loanForm.tasaMensual}% x 3 meses</span>
                    </div>
                    <button className="flex items-center gap-2 text-sm font-semibold text-[#1A3F7E] hover:underline" onClick={() => setShowLoanSched(!showLoanSched)}>
                      {showLoanSched ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      {showLoanSched ? 'Ocultar' : 'Ver'} cronograma
                    </button>
                    {showLoanSched && (
                      <div className="rounded-xl border border-slate-200 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50">
                            <tr>{['#', 'Fecha', 'Cuota', 'Capital', 'Interes', 'Balance'].map(h => <th key={h} className={`px-3 py-2 font-semibold text-slate-600 ${h === '#' || h === 'Fecha' ? 'text-left' : 'text-right'}`}>{h}</th>)}</tr>
                          </thead>
                          <tbody>
                            {loanResult.schedule.map((s, i) => (
                              <tr key={s.num} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                <td className="px-3 py-1.5 font-semibold">{s.num}</td>
                                <td className="px-3 py-1.5 text-[#1A3F7E]">{s.fecha}</td>
                                <td className="px-3 py-1.5 text-right font-semibold">{fmtC(s.monto, loanForm.currency)}</td>
                                <td className="px-3 py-1.5 text-right text-slate-500">{fmtC(s.principal, loanForm.currency)}</td>
                                <td className="px-3 py-1.5 text-right text-amber-600">{fmtC(s.interes, loanForm.currency)}</td>
                                <td className="px-3 py-1.5 text-right text-slate-500">{fmtC(s.balance, loanForm.currency)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-10 text-slate-400">
                    <Calculator size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Ingresa el monto y la tasa para ver el calculo</p>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'investment' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 mb-1">Cuanto quieres invertir?</h2>
                  <p className="text-sm text-slate-500">Calcula el rendimiento compuesto mes a mes</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Moneda</label>
                    <select className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" value={invForm.currency} onChange={e => ivf('currency', e.target.value)}>
                      {Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{v.flag} {k}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Capital</label>
                    <input type="number" step="1000" placeholder="100000" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" value={invForm.monto} onChange={e => ivf('monto', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tasa Mensual (%)</label>
                    <input type="number" step="0.1" placeholder="3" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" value={invForm.tasa} onChange={e => ivf('tasa', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Plazo (meses)</label>
                    <input type="number" min="1" placeholder="12" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" value={invForm.meses} onChange={e => ivf('meses', e.target.value)} />
                  </div>
                </div>
                {invResult ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { l: 'Capital Inicial', v: fmtC(invResult.initial, invForm.currency), c: 'text-slate-900' },
                        { l: 'Rendimiento', v: fmtC(invResult.yieldTotal, invForm.currency), c: 'text-amber-600' },
                        { l: 'Total Final', v: fmtC(invResult.final, invForm.currency), c: 'text-emerald-600' },
                        { l: 'Retorno', v: `${invResult.returnPct}%`, c: 'text-[#1A3F7E]' },
                      ].map(s => (
                        <div key={s.l} className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                          <p className="text-xs text-slate-500 mb-1">{s.l}</p>
                          <p className={`font-bold text-sm ${s.c}`}>{s.v}</p>
                        </div>
                      ))}
                    </div>
                    <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                      <TrendingUp size={14} />
                      <span>Tier: <strong>{parseFloat(invForm.monto) >= 200000 ? 'CORPORATE' : parseFloat(invForm.monto) >= 50000 ? 'PREMIUM' : 'STANDARD'}</strong> · Interes compuesto mensual</span>
                    </div>
                    <button className="flex items-center gap-2 text-sm font-semibold text-[#1A3F7E] hover:underline" onClick={() => setShowInvSched(!showInvSched)}>
                      {showInvSched ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      {showInvSched ? 'Ocultar' : 'Ver'} rendimiento mes a mes
                    </button>
                    {showInvSched && (
                      <div className="rounded-xl border border-slate-200 overflow-hidden max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 sticky top-0">
                            <tr>
                              <th className="text-left px-4 py-2 font-semibold text-slate-600">Mes</th>
                              <th className="text-right px-4 py-2 font-semibold text-slate-600">Rendimiento</th>
                              <th className="text-right px-4 py-2 font-semibold text-slate-600">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invResult.schedule.map((s, i) => (
                              <tr key={s.month} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                <td className="px-4 py-1.5 text-slate-700">Mes {s.month}</td>
                                <td className="px-4 py-1.5 text-right text-amber-600 font-semibold">+{fmtC(s.yield, invForm.currency)}</td>
                                <td className="px-4 py-1.5 text-right text-emerald-600 font-semibold">{fmtC(s.balance, invForm.currency)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-10 text-slate-400">
                    <TrendingUp size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Ingresa el capital y la tasa para ver el rendimiento</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="text-center py-10 text-xs text-slate-400 space-y-2">
          <p className="font-semibold text-slate-600">Financiera e Inversiones Irmaos HPA SRL</p>
          <p>Republica Dominicana · app.fiirmaoshpa.com</p>
          <a href="/login" className="inline-flex items-center gap-1 text-[#1A3F7E] font-semibold hover:underline mt-2">
            Acceder al sistema <ArrowRight size={12} />
          </a>
        </div>
      </div>
    </div>
  )
}