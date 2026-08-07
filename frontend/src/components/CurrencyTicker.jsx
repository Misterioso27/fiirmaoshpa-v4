import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const PAIRS = [
  { from: 'USD', to: 'DOP', label: 'USD → RD$', flag: '🇺🇸🇩🇴' },
  { from: 'BRL', to: 'DOP', label: 'R$ → RD$', flag: '🇧🇷🇩🇴' },
  { from: 'USD', to: 'BRL', label: 'USD → R$', flag: '🇺🇸🇧🇷' },
]

export default function CurrencyTicker() {
  const [rates, setRates] = useState({})
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [source, setSource] = useState('api')

  async function fetchRates() {
    setLoading(true)
    try {
      // Intentar API en tiempo real
      const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
      if (res.ok) {
        const data = await res.json()
        setRates({
          'USD_DOP': data.rates.DOP,
          'USD_BRL': data.rates.BRL,
          'BRL_DOP': data.rates.DOP / data.rates.BRL,
        })
        setSource('live')
        setLastUpdate(new Date())
        return
      }
    } catch {}

    // Fallback a tasas manuales en Supabase
    try {
      const { data } = await supabase.from('exchange_rates').select('*')
      if (data) {
        const map = {}
        data.forEach(r => { map[`${r.from_currency}_${r.to_currency}`] = parseFloat(r.rate) })
        setRates(map)
        setSource('manual')
        setLastUpdate(new Date())
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    fetchRates()
    const interval = setInterval(fetchRates, 300000) // cada 5 min
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (Object.keys(rates).length > 0) setLoading(false)
  }, [rates])

  if (loading) return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-hpa-slate-1 rounded-lg">
      <RefreshCw size={12} className="animate-spin text-hpa-slate-4" />
      <span className="text-xs text-hpa-slate-5">Cargando tasas...</span>
    </div>
  )

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {PAIRS.map(pair => {
        const key = `${pair.from}_${pair.to}`
        const rate = rates[key]
        if (!rate) return null
        return (
          <div key={key}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-hpa-slate-2 rounded-lg shadow-card hover:shadow-card-md transition-shadow">
            <span className="text-xs">{pair.flag}</span>
            <span className="text-xs text-hpa-slate-6">{pair.label}</span>
            <span className="text-xs font-bold font-numeric text-hpa-slate-9">
              {rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )
      })}
      <div className="flex items-center gap-1 px-2 py-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${source === 'live' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        <span className="text-2xs text-hpa-slate-4">
          {source === 'live' ? 'En vivo' : 'Manual'}
        </span>
        <button onClick={fetchRates} className="text-hpa-slate-4 hover:text-hpa-slate-6 ml-1">
          <RefreshCw size={10} />
        </button>
      </div>
    </div>
  )
}
