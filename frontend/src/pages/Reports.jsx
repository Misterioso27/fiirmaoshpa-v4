import { useState, useEffect, useCallback } from 'react'
import { BarChart3, Download, RefreshCw, TrendingUp, AlertTriangle, DollarSign, Landmark } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts'
import { supabase, fmt } from '@/lib/supabase'
import { Spinner, Empty } from '@/components/ui'
import useAuthStore from '@/store/auth'

const CURRENCIES = {
  DOP: { symbol: 'RD$' },
  BRL: { symbol: 'R$'  },
  USD: { symbol: '$'   },
}

function fmtC(amount, currency = 'DOP') {
  const c = CURRENCIES[currency] || CURRENCIES.DOP
  return `${c.symbol} ${parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function SummaryCard({ label, value, sub, icon: Icon, color = 'blue', loading }) {
  const colors = {
    blue:  { bg: 'bg-blue-50',    icon: 'text-hpa-700',     border: 'border-blue-100'    },
    gold:  { bg: 'bg-amber-50',   icon: 'text-amber-700',   border: 'border-amber-100'   },
    green: { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-100' },
    red:   { bg: 'bg-red-50',     icon: 'text-red-500',     border: 'border-red-100'     },
  }
  const c = colors[color]
  return (
    <div className="kpi-card">
      <div className="flex-1">
        <p className="kpi-label">{label}</p>
        {loading
          ? <div className="h-7 w-32 bg-hpa-slate-2 rounded animate-pulse mt-1" />
          : <p className="kpi-value mt-1">{value}</p>
        }
        {sub && <p className="text-xs text-hpa-slate-5 mt-0.5">{sub}</p>}
      </div>
      <div className={`w-10 h-10 rounded-xl ${c.bg} border ${c.border} flex items-center justify-center flex-shrink-0`}>
        <Icon size={18} className={c.icon} />
