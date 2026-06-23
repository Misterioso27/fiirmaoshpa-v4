import { useState, useEffect, useCallback } from 'react'
import { Briefcase, Plus, Search } from 'lucide-react'
import { db, fmtDate } from '@/lib/supabase'
import { StatusBadge, Modal, Field, Pagination, Empty, Spinner } from '@/components/ui'

export default function Employees() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading]     = useState(true)
  const [page, setPage]           = useState(1)
  const [pagination, setPagination] = useState({})
  const [search, setSearch]       = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 20 })
      if (search) params.set('search', search)
      const data = await api.get(`/employees?${params}`)
      setEmployees(data.employees || [])
      setPagination(data.pagination || {})
    } catch {}
    setLoading(false)
  }, [page, search])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Empleados</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">{pagination.total || 0} empleados</p>
        </div>
      </div>

      <div className="card p-4 flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-hpa-slate-4" />
          <input className="input pl-8" placeholder="Buscar empleado..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Empleado</th><th>Código</th><th>Cargo</th><th>Departamento</th><th>Sucursal</th><th>Ingreso</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-12 text-center"><Spinner size={20} className="mx-auto" /></td></tr>
              ) : employees.length === 0 ? (
                <tr><td colSpan={7}><Empty icon={Briefcase} title="Sin empleados" desc="No hay empleados registrados" /></td></tr>
              ) : employees.map(e => (
                <tr key={e.id}>
                  <td>
                    <p className="font-medium">{e.profiles?.full_name}</p>
                    <p className="text-xs text-hpa-slate-5">{e.profiles?.email}</p>
                  </td>
                  <td className="font-mono text-xs text-hpa-700 font-semibold">{e.employee_code}</td>
                  <td>{e.position}</td>
                  <td className="text-sm text-hpa-slate-6">{e.departments?.name || '—'}</td>
                  <td className="text-sm text-hpa-slate-6">{e.branches?.name || '—'}</td>
                  <td className="text-xs text-hpa-slate-5">{fmtDate(e.hire_date)}</td>
                  <td><StatusBadge status={e.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={pagination.pages} total={pagination.total} limit={20} onChange={setPage} />
      </div>
    </div>
  )
}
