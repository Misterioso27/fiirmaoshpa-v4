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

  const [tab, setTab]           = useState('prestamos') // 'prestamos' | 'clientes'
  const [allLoans, setAllLoans] = useState([])
  const [loans, setLoans]       = useState([])
  const [allClients, setAllClients] = useState([])
  const [clientsList, setClientsList] = useState([])
  const [loadingClients, setLoadingClients] = useState(true)

  // Ficha de cliente (hoja integral para constancia)
  const [selectedClient, setSelectedClient] = useState(null)
  const [fichaLoans, setFichaLoans] = useState([])
  const [fichaInvestments, setFichaInvestments] = useState([])
  const [fichaLoading, setFichaLoading] = useState(false)
  const fichaStorageKey = `hpa_ficha_cols_${user?.id || 'default'}`
  const [fichaCols, setFichaCols] = useState(() => {
    try { return JSON.parse(localStorage.getItem(fichaStorageKey)) || DEFAULT_COLS }
    catch { return DEFAULT_COLS }
  })
  const [showFichaColPicker, setShowFichaColPicker] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [status, setStatus]     = useState('')
  const [sortCol, setSortCol]   = useState('disbursed_at')
  const [sortDir, setSortDir]   = useState('desc')
  const [showColPicker, setShowColPicker] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [deleting, setDeleting] = useState(false)
  const [editingLoan, setEditingLoan] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [savingEdit, setSavingEdit] = useState(false)
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

  async function loadClients() {
    setLoadingClients(true)
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, client_code, first_name, last_name, phone_primary, status, created_at')
        .eq('company_id', COMPANY_ID)
        .order('created_at', { ascending: false })
        .limit(1000)
      if (error) { console.error('Clientes error:', error) }
      else { setAllClients(data || []) }
    } catch (e) { console.error('Clientes exception:', e) }
    setLoadingClients(false)
  }

  useEffect(() => { load(); loadClients() }, [])

  async function openFicha(client) {
    setSelectedClient(client)
    setFichaLoading(true)
    try {
      const [loansRes, invRes] = await Promise.all([
        supabase.from('loans')
          .select(`
            id, loan_code, type, currency, principal, approved_amount,
            rate_monthly, term_months, payment_amount, total_interest,
            total_amount, balance_total, balance_principal,
            disbursed_at, first_payment_date, next_payment_date,
            days_overdue, status, ai_analysis
          `)
          .eq('company_id', COMPANY_ID).eq('client_id', client.id)
          .order('disbursed_at', { ascending: false }),
        supabase.from('investments')
          .select('*, financial_products(name, code)')
          .eq('company_id', COMPANY_ID).eq('client_id', client.id)
          .order('created_at', { ascending: false }),
      ])
      setFichaLoans(loansRes.data || [])
      setFichaInvestments(invRes.data || [])
    } catch (e) {
      console.error('Ficha error:', e)
      setFichaLoans([]); setFichaInvestments([])
    }
    setFichaLoading(false)
  }

  function closeFicha() {
    setSelectedClient(null); setFichaLoans([]); setFichaInvestments([])
  }

  function toggleFichaCol(key) {
    const col = ALL_COLUMNS.find(c => c.key === key)
    if (col?.always) return
    const next = fichaCols.includes(key)
      ? fichaCols.filter(c => c !== key)
      : [...fichaCols, key]
    setFichaCols(next)
    localStorage.setItem(fichaStorageKey, JSON.stringify(next))
  }

  function exportFichaCSV() {
    const visibleCols = ALL_COLUMNS.filter(c => fichaCols.includes(c.key))
    const headers = visibleCols.map(c => c.label)
    const rows = fichaLoans.map(l => {
      const freq = l.ai_analysis?.frequency || 'monthly'
      return visibleCols.map(c => {
        switch (c.key) {
          case 'loan_code':         return l.loan_code || ''
          case 'client_name':       return `${selectedClient.first_name} ${selectedClient.last_name}`
          case 'client_phone':      return selectedClient.phone_primary || ''
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
    link.download = `constancia-${selectedClient.client_code}-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

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

  useEffect(() => {
    let filtered = [...allClients]
    if (search.trim()) {
      const s = search.toLowerCase().trim()
      filtered = filtered.filter(c =>
        `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase().includes(s) ||
        c.client_code?.toLowerCase().includes(s) ||
        c.phone_primary?.toLowerCase().includes(s)
      )
    }
    setClientsList(filtered)
  }, [allClients, search])

  function toggleCol(key) {
    const col = ALL_COLUMNS.find(c => c.key === key)
    if (col?.always) return
    const next = activeCols.includes(key)
      ? activeCols.filter(c => c !== key)
      : [...activeCols, key]
    setActiveCols(next)
    localStorage.setItem(storageKey, JSON.stringify(next))
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAllVisible() {
    setSelectedIds(prev => {
      const allSelected = pageLoans.every(l => prev.has(l.id))
      const next = new Set(prev)
      pageLoans.forEach(l => allSelected ? next.delete(l.id) : next.add(l.id))
      return next
    })
  }

  async function deleteSelected() {
    if (!selectedIds.size) return
    if (!window.confirm(`¿Eliminar ${selectedIds.size} préstamo(s) seleccionado(s)? Esta acción no se puede deshacer.`)) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('loans').delete().in('id', Array.from(selectedIds))
      if (error) { alert('Error al eliminar: ' + error.message) }
      else { setSelectedIds(new Set()); load() }
    } catch (e) { alert('Error al eliminar: ' + e.message) }
    setDeleting(false)
  }

  function openEdit(loan) {
    setEditingLoan(loan)
    setEditForm({
      principal: loan.principal, rate_monthly: loan.rate_monthly,
      status: loan.status, disbursed_at: loan.disbursed_at,
      balance_total: loan.balance_total,
    })
  }

  async function saveEdit() {
    if (!editingLoan) return
    setSavingEdit(true)
    try {
      const { error } = await supabase.from('loans').update({
        principal: parseFloat(editForm.principal) || 0,
        rate_monthly: parseFloat(editForm.rate_monthly) || 0,
        status: editForm.status,
        disbursed_at: editForm.disbursed_at,
        balance_total: parseFloat(editForm.balance_total) || 0,
      }).eq('id', editingLoan.id)
      if (error) { alert('Error al guardar: ' + error.message) }
      else { setEditingLoan(null); load() }
    } catch (e) { alert('Error al guardar: ' + e.message) }
    setSavingEdit(false)
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
            {tab === 'prestamos'
              ? (loading ? 'Cargando...' : `${totalFiltered} préstamos`)
              : (loadingClients ? 'Cargando...' : `${clientsList.length} clientes`)}
            {search && ` · "${search}"`}
            {tab === 'prestamos' && status && ` · ${STATUS_LABELS[status] || status}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => { load(); loadClients() }} disabled={loading || loadingClients}>
            <RefreshCw size={13} className={(loading || loadingClients) ? 'animate-spin' : ''} /> Actualizar
          </button>
          {tab === 'prestamos' && (
            <button className={`btn btn-ghost btn-sm ${showColPicker ? 'bg-hpa-slate-2' : ''}`}
              onClick={() => setShowColPicker(!showColPicker)}>
              <Settings2 size={13} /> Columnas
            </button>
          )}
          {tab === 'prestamos' && (
            <button className="btn btn-ghost btn-sm" onClick={exportCSV} disabled={exporting}>
              <Download size={13} /> {exporting ? 'Exportando...' : 'Exportar CSV'}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-hpa-slate-2">
        <button
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'prestamos' ? 'border-hpa-700 text-hpa-700' : 'border-transparent text-hpa-slate-5 hover:text-hpa-slate-7'
          }`}
          onClick={() => setTab('prestamos')}>
          Préstamos
        </button>
        <button
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'clientes' ? 'border-hpa-700 text-hpa-700' : 'border-transparent text-hpa-slate-5 hover:text-hpa-slate-7'
          }`}
          onClick={() => setTab('clientes')}>
          Clientes ({allClients.length})
        </button>
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

      {tab === 'clientes' && (
        <div className="card p-0 overflow-hidden">
          <div className="table-wrapper overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="table text-xs whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th>Código</th><th>Cliente</th><th>Teléfono</th><th>Estado</th><th>Registrado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {loadingClients ? (
                  <tr><td colSpan={6} className="py-12 text-center"><Spinner size={20} className="mx-auto" /></td></tr>
                ) : clientsList.length === 0 ? (
                  <tr><td colSpan={6}>
                    <Empty icon={LayoutList}
                      title={search ? `Sin resultados para "${search}"` : 'Sin clientes'}
                      desc={search ? 'Intenta con otro nombre o código' : 'Aún no hay clientes registrados'} />
                  </td></tr>
                ) : clientsList.map(c => (
                  <tr key={c.id} className="hover:bg-hpa-slate-1 cursor-pointer" onClick={() => openFicha(c)}>
                    <td className="font-mono text-xs font-semibold text-hpa-700">{c.client_code}</td>
                    <td className="font-semibold text-sm">{c.first_name} {c.last_name}</td>
                    <td className="text-xs">{c.phone_primary || '—'}</td>
                    <td><span className={`badge ${c.status === 'active' ? 'badge-blue' : 'badge-gray'}`}>{c.status}</span></td>
                    <td className="text-xs text-hpa-slate-5">{fmtDate(c.created_at)}</td>
                    <td className="text-xs text-hpa-700 font-semibold">Ver ficha →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'prestamos' && selectedIds.size > 0 && (
        <div className="card p-3 flex items-center justify-between bg-hpa-700/5 border-hpa-700/30">
          <p className="text-xs font-semibold text-hpa-700">{selectedIds.size} préstamo(s) seleccionado(s)</p>
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}>Deseleccionar</button>
            <button className="btn btn-sm bg-red-600 text-white hover:bg-red-700" onClick={deleteSelected} disabled={deleting}>
              <X size={13} /> {deleting ? 'Eliminando...' : 'Eliminar seleccionados'}
            </button>
          </div>
        </div>
      )}

      {tab === 'prestamos' && (
      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="table text-xs whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="w-8">
                  <input type="checkbox"
                    checked={pageLoans.length > 0 && pageLoans.every(l => selectedIds.has(l.id))}
                    onChange={toggleSelectAllVisible} />
                </th>
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
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={visibleCols.length + 2} className="py-12 text-center">
                  <Spinner size={20} className="mx-auto" />
                </td></tr>
              ) : pageLoans.length === 0 ? (
                <tr><td colSpan={visibleCols.length + 2}>
                  <Empty icon={LayoutList}
                    title={search ? `Sin resultados para "${search}"` : 'Sin préstamos'}
                    desc={search ? 'Intenta con otro nombre o código' : 'No se encontraron registros'} />
                </td></tr>
              ) : pageLoans.map(loan => (
                <tr key={loan.id} className={`hover:bg-hpa-slate-1 ${selectedIds.has(loan.id) ? 'bg-hpa-700/5' : ''}`}>
                  <td><input type="checkbox" checked={selectedIds.has(loan.id)} onChange={() => toggleSelect(loan.id)} /></td>
                  {visibleCols.map(col => (
                    <td key={col.key}>{renderCell(loan, col.key)}</td>
                  ))}
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(loan)} title="Editar préstamo">
                      ✏️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={totalPages} total={totalFiltered} limit={PAGE_SIZE} onChange={setPage} />
      </div>
      )}

      {editingLoan && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center" onClick={() => setEditingLoan(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-lg font-bold text-hpa-slate-9">Editar préstamo</p>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingLoan(null)}><X size={14} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-hpa-slate-6">Monto prestado</label>
                <input type="number" className="input w-full mt-1" value={editForm.principal}
                  onChange={e => setEditForm({ ...editForm, principal: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-hpa-slate-6">Tasa mensual (%)</label>
                <input type="number" className="input w-full mt-1" value={editForm.rate_monthly}
                  onChange={e => setEditForm({ ...editForm, rate_monthly: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-hpa-slate-6">Saldo restante</label>
                <input type="number" className="input w-full mt-1" value={editForm.balance_total}
                  onChange={e => setEditForm({ ...editForm, balance_total: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-hpa-slate-6">Fecha desembolso</label>
                <input type="date" className="input w-full mt-1" value={editForm.disbursed_at || ''}
                  onChange={e => setEditForm({ ...editForm, disbursed_at: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-hpa-slate-6">Estado</label>
                <select className="select w-full mt-1" value={editForm.status}
                  onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                  <option value="active">Activo</option>
                  <option value="overdue">Vencido</option>
                  <option value="paid">Saldado</option>
                  <option value="defaulted">Default</option>
                  <option value="written_off">Castigado</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button className="btn btn-ghost flex-1" onClick={() => setEditingLoan(null)}>Cancelar</button>
              <button className="btn btn-primary flex-1" onClick={saveEdit} disabled={savingEdit}>
                {savingEdit ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedClient && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-start justify-center overflow-y-auto py-8" onClick={closeFicha}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-hpa-slate-2 flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-hpa-slate-9">{selectedClient.first_name} {selectedClient.last_name}</p>
                <p className="text-xs text-hpa-slate-5">{selectedClient.client_code} · {selectedClient.phone_primary || 'sin teléfono'} · Ficha integral para constancia</p>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary btn-sm" onClick={() => openFicha(selectedClient)} disabled={fichaLoading}>
                  <RefreshCw size={12} className={fichaLoading ? 'animate-spin' : ''} /> {fichaLoading ? 'Cargando...' : 'Actualizar ficha'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={closeFicha}><X size={14} /></button>
              </div>
            </div>

            <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
              {fichaLoading ? (
                <div className="py-12 text-center"><Spinner size={24} className="mx-auto" /></div>
              ) : (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-bold text-hpa-slate-8">Préstamos ({fichaLoans.length})</p>
                      <div className="flex gap-2">
                        <button className="btn btn-ghost btn-sm" onClick={() => setShowFichaColPicker(!showFichaColPicker)}>
                          <Settings2 size={12} /> Columnas
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={exportFichaCSV} disabled={!fichaLoans.length}>
                          <Download size={12} /> Exportar constancia
                        </button>
                      </div>
                    </div>

                    {showFichaColPicker && (
                      <div className="p-3 mb-2 bg-hpa-slate-1 rounded-lg flex flex-wrap gap-2">
                        {ALL_COLUMNS.map(col => (
                          <button key={col.key} type="button" disabled={col.always}
                            onClick={() => toggleFichaCol(col.key)}
                            className={`px-2.5 py-1 rounded-md border text-2xs font-semibold ${
                              fichaCols.includes(col.key)
                                ? 'border-hpa-700 bg-hpa-700/10 text-hpa-700'
                                : 'border-hpa-slate-2 text-hpa-slate-5'
                            } ${col.always ? 'opacity-50' : 'cursor-pointer'}`}>
                            {col.label}{col.always && ' 🔒'}
                          </button>
                        ))}
                      </div>
                    )}

                    {fichaLoans.length === 0 ? (
                      <p className="text-xs text-hpa-slate-4 py-4">Este cliente aún no tiene préstamos registrados.</p>
                    ) : (
                      <div className="table-wrapper overflow-x-auto border border-hpa-slate-2 rounded-lg">
                        <table className="table text-xs whitespace-nowrap">
                          <thead>
                            <tr>
                              {ALL_COLUMNS.filter(c => fichaCols.includes(c.key)).map(col => (
                                <th key={col.key}>{col.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {fichaLoans.map(loan => (
                              <tr key={loan.id}>
                                {ALL_COLUMNS.filter(c => fichaCols.includes(c.key)).map(col => (
                                  <td key={col.key}>{renderCell({ ...loan, clients: selectedClient }, col.key)}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-bold text-hpa-slate-8 mb-2">Inversiones ({fichaInvestments.length})</p>
                    {fichaInvestments.length === 0 ? (
                      <p className="text-xs text-hpa-slate-4 py-4">Este cliente aún no tiene inversiones registradas.</p>
                    ) : (
                      <div className="table-wrapper overflow-x-auto border border-hpa-slate-2 rounded-lg">
                        <table className="table text-xs whitespace-nowrap">
                          <thead>
                            <tr><th>Producto</th><th>Monto</th><th>Estado</th><th>Fecha</th></tr>
                          </thead>
                          <tbody>
                            {fichaInvestments.map(inv => (
                              <tr key={inv.id}>
                                <td>{inv.financial_products?.name || '—'}</td>
                                <td className="font-numeric font-semibold">{fmtMoney(inv.amount, inv.currency)}</td>
                                <td><span className="badge badge-blue">{inv.status}</span></td>
                                <td className="text-hpa-slate-5">{fmtDate(inv.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
