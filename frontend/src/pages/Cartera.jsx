import { useState, useEffect } from 'react'
import { LayoutList, Download, Settings2, Search, RefreshCw, ChevronUp, ChevronDown, X } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { fmtDate } from '@/lib/supabase'
import { Spinner, Empty, Pagination } from '@/components/ui'
import useAuthStore from '@/store/auth'

// ─── DIAGNÓSTICO: cliente hardcodeado (temporal) ────────────
const supabase = createClient(
  'https://ylodmopafxauvwurfweh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsb2Rtb3BhZnhhdXZ3dXJmd2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTM3NDMsImV4cCI6MjA5NjQ4OTc0M30.QlfDUGbn_O7EjRbbyuEPQVWiNxwLN0EZelV0uxPO7JA'
)

const COMPANY_ID = 'a0000000-0000-4000-8000-000000000001'

const ALL_COLUMNS = [
  { key: 'loan_code',        label: 'Código',           always: true  },
  { key: 'client_name',      label: 'Cliente',          always: true  },
  { key: 'client_phone',     label: 'Teléfono',         always: false },
  { key: 'disbursed_at',     label: 'Fecha Desembolso', always: false },
  { key: 'currency',         label: 'Moneda',           always: false },
  { key: 'principal',        label: 'Monto Prestado',   always: false },
  { key: 'approved_amount',  label: 'Monto Aprobado',   always: false },
  { key: 'rate_monthly',     label: 'Tasa Mensual',     always: false },
  { key: 'term_months',      label: 'Plazo',            always: false },
  { key: 'frequency',        label: 'Frecuencia',       always: false },
  { key: 'payment_amount',   label: 'Cuota',            always: false },
  { key: 'total_interest',   label: 'Interés Total',    always: false },
  { key: 'total_amount',     label: 'Cap. + Interés',   always: false },
  { key: 'balance_total',    label: 'Saldo Restante',   always: false },
  { key: 'next_payment_date',label: 'Próximo Pago',     always: false },
  { key: 'days_overdue',     label: 'Días Mora',        always: false },
  { key: 'status',           label: 'Estado',           always: true  },
]

const DEFAULT_COLS = ['loan_code','client_name','disbursed_at','principal','rate_monthly','term_months','frequency','payment_amount','total_amount','balance_total','days_overdue','status']
const STATUS_LABELS = { active: 'ACTIVO', overdue: 'VENCIDO', paid: 'SALDADO', defaulted: 'DEFAULT', written_off: 'CASTIGADO' }
const STATUS_COLORS = { active: 'badge-blue', overdue: 'badge-red', paid: 'badge-green', defaulted: 'badge-red', written_off: 'badge-gray' }
const FREQ_LABELS   = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }

function fmtMoney(v, curr = 'DOP') {
  const sym = { DOP: 'RD$', BRL: 'R$', USD: '$', EUR: '€', GBP: '£' }[curr] || 'RD$'
  return `${sym} ${parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function Cartera() {
  const { user } = useAuthStore()
  const storageKey = `hpa_cartera_cols_${user?.id || 'default'}`

  const [allLoans, setAllLoans] = useState([])
  const [loans, setLoans]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [status, setStatus]     = useState('')
  const [sortCol, setSortCol]   = useState('disbursed_at')
  const [sortDir, setSortDir]   = useState('desc')
  const [showColPicker, setShowColPicker] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [activeCols, setActiveCols] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey)) || DEFAULT_COLS }
    catch { return DEFAULT_COLS }
  })

  const PAGE_SIZE = 25

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('loans')
        .select(`
          id, loan_code, type, currency, principal, approved_amount,
          rate_monthly, term_months, payment_amount, total_interest,
          total_amount, balance_total, balance_principal,
          disbursed_at, first_payment_date, next_payment_date,
          days_overdue, status, ai_analysis,
          clients ( first_name, last_name, phone_primary, client_code )
        `)
        .eq('company_id', COMPANY_ID)
        .order('disbursed_at', { ascending: false })
        .limit(1000)

      if (error) {
        console.error('Cartera error:', error)
      } else {
        setAllLoans(data || [])
      }
    } catch (e) {
      console.error('Cartera exception:', e)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    let filtered = [...allLoans]
    if (status) filtered = filtered.filter(l => l.status === status)
    if (search.trim()) {
      const s = search.toLowerCase().trim()
      filtered = filtered.filter(l =>
        l.loan_code?.toLowerCase().includes(s) ||
        `${l.clients?.first_name || ''} ${l.clients?.last_name || ''}`.toLowerCase().includes(s) ||
        l.clients?.client_code?.toLowerCase().includes(s) ||
        l.clients?.phone_primary?.toLowerCase().includes(s)
      )
    }
    setLoans(filtered)
    setPage(1)
  }, [allLoans, search, status])

  function toggleCol(key) {
    const col = ALL_COLUMNS.find(c => c.key === key)
    if (col?.always) return
    const next = activeCols.includes(key)
      ? activeCols.filter(c => c !== key)
      : [...activeCols, key]
    setActiveCols(next)
    localStorage.setItem(storageKey, JSON.stringify(next))
  }

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
    load()
  }

  async function exportCSV() {
    setExporting(true)
    try {
      const visibleCols = ALL_COLUMNS.filter(c => activeCols.includes(c.key))
      const headers = visibleCols.map(c => c.label)
      const rows = loans.map(l => {
        const freq = l.ai_analysis?.frequency || 'monthly'
        const clientName = `${l.clients?.first_name || ''} ${l.clients?.last_name || ''}`.trim()
        return visibleCols.map(c => {
          switch (c.key) {
            case 'loan_code':         return l.loan_code || ''
            case 'client_name':       return clientName
            case 'client_phone':      return l.clients?.phone_primary || ''
            case 'disbursed_at':      return l.disbursed_at || ''
            case 'currency':          return l.currency || 'DOP'
            case 'principal':         return l.principal || 0
            case 'approved_amount':   return l.approved_amount || l.principal || 0
            case 'rate_monthly':      return `${l.rate_monthly}%`
            case 'term_months':       return l.term_months || ''
            case 'frequency':         return FREQ_LABELS[freq] || freq
            case 'payment_amount':    return l.payment_amount || 0
            case 'total_interest':    return l.total_interest || 0
            case 'total_amount':      return l.total_amount || 0
            case 'balance_total':     return l.balance_total || 0
            case 'next_payment_date': return l.next_payment_date || ''
            case 'days_overdue':      return l.days_overdue || 0
            case 'status':            return STATUS_LABELS[l.status] || l.status
            default: return ''
          }
        })
      })
      const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `cartera-hpa-${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) { alert('Error al exportar: ' + err.message) }
    setExporting(false)
  }

  const visibleCols = ALL_COLUMNS.filter(c => activeCols.includes(c.key))
  const totalFiltered = loans.length
  const totalPages    = Math.ceil(totalFiltered / PAGE_SIZE)
  const pageLoans     = loans.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function renderCell(loan, colKey) {
    const freq = loan.ai_analysis?.frequency || 'monthly'
    const curr = loan.currency || 'DOP'
    switch (colKey) {
      case 'loan_code':        return <span className="font-mono text-xs font-semibold text-hpa-700">{loan.loan_code}</span>
      case 'client_name':      return (
        <div>
          <p className="font-semibold text-sm">{loan.clients?.first_name} {loan.clients?.last_name}</p>
          <p className="text-2xs text-hpa-slate-5">{loan.clients?.client_code}</p>
        </div>
      )
      case 'client_phone':     return <span className="text-xs">{loan.clients?.phone_primary || '—'}</span>
      case 'disbursed_at':     return <span className="text-xs text-hpa-slate-5">{fmtDate(loan.disbursed_at)}</span>
      case 'currency':         return <span className="badge badge-blue">{loan.currency}</span>
      case 'principal':        return <span className="font-numeric font-semibold text-sm">{fmtMoney(loan.principal, curr)}</span>
      case 'approved_amount':  return <span className="font-numeric text-sm">{fmtMoney(loan.approved_amount || loan.principal, curr)}</span>
      case 'rate_monthly':     return <span className="font-semibold text-hpa-700">{loan.rate_monthly}%</span>
      case 'term_months':      return <span className="text-xs text-hpa-slate-6">{loan.term_months}m</span>
      case 'frequency':        return <span className="text-xs">{FREQ_LABELS[freq] || freq}</span>
      case 'payment_amount':   return <span className="font-numeric text-sm">{fmtMoney(loan.payment_amount, curr)}</span>
      case 'total_interest':   return <span className="font-numeric text-amber-600">{fmtMoney(loan.total_interest, curr)}</span>
      case 'total_amount':     return <span className="font-numeric font-semibold">{fmtMoney(loan.total_amount, curr)}</span>
      case 'balance_total':    return (
        <span className={`font-numeric font-semibold ${parseFloat(loan.balance_total) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
          {fmtMoney(loan.balance_total, curr)}
        </span>
      )
      case 'next_payment_date': return <span className="text-xs text-hpa-slate-5">{loan.next_payment_date ? fmtDate(loan.next_payment_date) : '—'}</span>
      case 'days_overdue':     return (
        <span className={`font-semibold text-xs ${loan.days_overdue > 0 ? 'text-red-600' : 'text-hpa-slate-5'}`}>
          {loan.days_overdue > 0 ? `${loan.days_overdue}d` : '—'}
        </span>
      )
      case 'status':           return <span className={`badge ${STATUS_COLORS[loan.status] || 'badge-gray'}`}>{STATUS_LABELS[loan.status] || loan.status}</span>
      default: return '—'
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Vista de Cartera</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">
            {loading ? 'Cargando...' : `${totalFiltered} préstamos`}
            {search && ` · "${search}"`}
            {status && ` · ${STATUS_LABELS[status] || status}`}
            {' · Columnas personalizables'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
          <button className={`btn btn-ghost btn-sm ${showColPicker ? 'bg-hpa-slate-2' : ''}`}
            onClick={() => setShowColPicker(!showColPicker)}>
            <Settings2 size={13} /> Columnas
          </button>
          <button className="btn btn-ghost btn-sm" onClick={exportCSV} disabled={exporting}>
            <Download size={13} /> {exporting ? 'Exportando...' : 'Exportar CSV'}
          </button>
        </div>
      </div>

      {showColPicker && (
        <div className="card p-4">
          <p className="text-xs font-semibold text-hpa-slate-7 mb-3">
            Selecciona las columnas — se guardan automáticamente para tu usuario
          </p>
          <div className="flex flex-wrap gap-2">
            {ALL_COLUMNS.map(col => (
              <button key={col.key} type="button" disabled={col.always}
                onClick={() => toggleCol(col.key)}
                className={`px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${
                  activeCols.includes(col.key)
                    ? 'border-hpa-700 bg-hpa-700/10 text-hpa-700'
                    : 'border-hpa-slate-2 text-hpa-slate-5 hover:border-hpa-slate-3'
                } ${col.always ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                {col.label}{col.always && ' 🔒'}
              </button>
            ))}
          </div>
          <p className="text-2xs text-hpa-slate-4 mt-3">🔒 = columna fija</p>
        </div>
      )}

      <div className="card p-4 flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-hpa-slate-4" />
          <input className="input pl-8 pr-8 text-sm"
            placeholder="Buscar por nombre, código o teléfono..."
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2 text-hpa-slate-4 hover:text-hpa-slate-7"
              onClick={() => setSearch('')}>
              <X size={13} />
            </button>
          )}
        </div>
        <select className="select w-44" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="overdue">Vencidos</option>
          <option value="paid">Saldados</option>
          <option value="defaulted">Default</option>
        </select>
        {(search || status) && (
          <button className="btn btn-ghost btn-sm text-hpa-slate-5"
            onClick={() => { setSearch(''); setStatus('') }}>
            <X size={13} /> Limpiar
          </button>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="table text-xs whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr>
                {visibleCols.map(col => (
                  <th key={col.key}
                    className="cursor-pointer select-none hover:bg-hpa-slate-2 transition-colors"
                    onClick={() => handleSort(col.key)}>
                    <div className="flex items-center gap-1">
                      {col.label}
                      {sortCol === col.key && (
                        sortDir === 'asc'
                          ? <ChevronUp size={11} className="text-hpa-700" />
                          : <ChevronDown size={11} className="text-hpa-700" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={visibleCols.length} className="py-12 text-center">
                  <Spinner size={20} className="mx-auto" />
                </td></tr>
              ) : pageLoans.length === 0 ? (
                <tr><td colSpan={visibleCols.length}>
                  <Empty icon={LayoutList}
                    title={search ? `Sin resultados para "${search}"` : 'Sin préstamos'}
                    desc={search ? 'Intenta con otro nombre o código' : 'No se encontraron registros'} />
                </td></tr>
              ) : pageLoans.map(loan => (
                <tr key={loan.id} className="hover:bg-hpa-slate-1">
                  {visibleCols.map(col => (
                    <td key={col.key}>{renderCell(loan, col.key)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={totalPages} total={totalFiltered} limit={PAGE_SIZE} onChange={setPage} />
      </div>
    </div>
  )
}
