import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, TrendingDown, RefreshCw, Activity } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const PAIRS = [
  {
    from: 'USD',
    to: 'DOP',
    label: 'USD → RD$',
    subtitle: 'Dólar / Peso Dom.',
    flag: '🇺🇸🇩🇴',
    seed: [59.65, 59.74, 59.71, 59.85, 59.92, 59.98, 60.04],
  },
  {
    from: 'BRL',
    to: 'DOP',
    label: 'R$ → RD$',
    subtitle: 'Real / Peso Dom.',
    flag: '🇧🇷🇩🇴',
    seed: [10.01, 10.03, 10.02, 10.05, 10.07, 10.08, 10.09],
  },
  {
    from: 'USD',
    to: 'BRL',
    label: 'USD → R$',
    subtitle: 'Dólar / Real Brasil',
    flag: '🇺🇸🇧🇷',
    seed: [5.91, 5.92, 5.925, 5.93, 5.94, 5.945, 5.95],
  },
]

function Sparkline({ points = [] }) {
  if (!points.length) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const positive = points[points.length - 1] >= points[0]
  const w = 74
  const h = 24

  const coords = points
    .map((val, idx) => {
      const x = (idx / (points.length - 1 || 1)) * w
      const y = h - ((val - min) / range) * (h - 6) - 3
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible shrink-0">
      <polyline
        fill="none"
        stroke={positive ? '#34D399' : '#F87171'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords}
      />
    </svg>
  )
}

export default function CurrencyTicker() {
  const [rates, setRates] = useState({})
  const [histories, setHistories] = useState(() => {
    const map = {}
    PAIRS.forEach((p) => {
      map[`${p.from}_${p.to}`] = [...p.seed]
    })
    return map
  })
  const [selectedKey, setSelectedKey] = useState('USD_DOP')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [source, setSource] = useState('live')

  const applyRates = useCallback((nextRates, nextSource) => {
    setRates(nextRates)
    setSource(nextSource)
    setLastUpdate(new Date())
    setHistories((prev) => {
      const updated = { ...prev }
      Object.entries(nextRates).forEach(([key, val]) => {
        if (typeof val === 'number' && !Number.isNaN(val)) {
          const base = updated[key] || [val]
          updated[key] = [...base.slice(1), Number(val.toFixed(4))]
        }
      })
      return updated
    })
  }, [])

  const fetchRates = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
      if (res.ok) {
        const data = await res.json()
        if (data?.rates?.DOP && data?.rates?.BRL) {
          applyRates(
            {
              USD_DOP: Number(data.rates.DOP),
              USD_BRL: Number(data.rates.BRL),
              BRL_DOP: Number((data.rates.DOP / data.rates.BRL).toFixed(4)),
            },
            'live'
          )
          setLoading(false)
          setRefreshing(false)
          return
        }
      }
    } catch {
      // Continúa al respaldo en Supabase
    }

    try {
      const { data } = await supabase.from('exchange_rates').select('*')
      if (data && data.length > 0) {
        const map = {}
        data.forEach((r) => {
          const parsed = parseFloat(r.rate)
          if (!Number.isNaN(parsed)) {
            map[`${r.from_currency}_${r.to_currency}`] = parsed
          }
        })
        if (Object.keys(map).length > 0) {
          applyRates(map, 'manual')
        }
      }
    } catch {
      // Sin cambios si no hay conexión
    }

    setLoading(false)
    setRefreshing(false)
  }, [applyRates])

  useEffect(() => {
    fetchRates()
    const interval = setInterval(fetchRates, 300000)
    return () => clearInterval(interval)
  }, [fetchRates])

  if (loading) {
    return (
      <div
        className="flex items-center gap-2 px-3.5 py-2 rounded-xl"
        style={{ background: '#0e1622', border: '1px solid rgba(212, 175, 55, 0.22)' }}
      >
        <RefreshCw size={13} className="animate-spin text-amber-400" />
        <span className="text-xs text-slate-300">Cargando cotizaciones FX...</span>
      </div>
    )
  }

  return (
    <div
      className="w-full rounded-xl p-3"
      style={{
        background: 'linear-gradient(135deg, #0b111a 0%, #111b29 60%, #0b111a 100%)',
        border: '1px solid rgba(212, 175, 55, 0.28)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
      }}
    >
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={
              source === 'live'
                ? { background: 'rgba(16, 185, 129, 0.14)', color: '#34D399' }
                : { background: 'rgba(245, 158, 11, 0.16)', color: '#FBBF24' }
            }
          >
            <Activity size={11} />
            {source === 'live' ? 'En vivo' : 'Manual'}
          </span>
          {lastUpdate && (
            <span className="text-[11px] text-slate-400">
              Act. {lastUpdate.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={fetchRates}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-amber-300 hover:bg-white/5 transition cursor-pointer"
          title="Actualizar tasas"
        >
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {PAIRS.map((pair) => {
          const key = `${pair.from}_${pair.to}`
          const rate = rates[key]
          if (typeof rate !== 'number') return null

          const series = histories[key] || pair.seed
          const delta = series.length > 1 ? series[series.length - 1] - series[0] : 0
          const positive = delta >= 0
          const isSelected = selectedKey === key

          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedKey(key)}
              className="w-full text-left rounded-lg px-3 py-2 flex items-center justify-between gap-2 transition cursor-pointer"
              style={{
                background: isSelected ? 'rgba(212, 175, 55, 0.1)' : 'rgba(255, 255, 255, 0.025)',
                border: isSelected
                  ? '1px solid rgba(212, 175, 55, 0.55)'
                  : '1px solid rgba(255, 255, 255, 0.07)',
              }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm leading-none">{pair.flag}</span>
                  <span className="text-xs font-bold text-white truncate">{pair.label}</span>
                </div>
                <p className="text-[10px] text-slate-400 truncate mt-0.5">{pair.subtitle}</p>
              </div>

              <div className="hidden xl:block">
                <Sparkline points={series} />
              </div>

              <div className="text-right shrink-0">
                <div className="text-xs sm:text-sm font-bold text-amber-300 tabular-nums">
                  {rate.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div
                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums"
                  style={{ color: positive ? '#34D399' : '#F87171' }}
                >
                  {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {positive ? '+' : ''}
                  {delta.toFixed(2)}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
