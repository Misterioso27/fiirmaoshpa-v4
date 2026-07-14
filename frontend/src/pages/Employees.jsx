import { useState, useEffect, useCallback } from 'react'
import { Briefcase, Plus, Search, Edit2, X, Save, Phone, Mail, Calendar } from 'lucide-react'
import { supabase, fmtDate } from '@/lib/supabase'
import { StatusBadge, Modal, Field, Pagination, Empty, Spinner } from '@/components/ui'
import useAuthStore from '@/store/auth'

export default function Employees() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id || 'a0000000-0000-4000-8000-000000000001'
  const branchId  = user?.branch?.id  || 'b0000000-0000-4000-8000-000000000001'

  const [employees, setEmployees]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(1)
  const [pagination, setPagination] = useState({})
  const [search, setSearch]         = useState('')

  // Modal
  const [showModal, setShowModal]   = useState(false)
  const [editing, setEditing]       = useState(null)
  const [form, setForm]             = useState({})
  const [saving, setSaving]         = useState(false)
  const [profiles, setProfiles]     = useState([])
  const [branches, setBranches]     = useState([])

  // ── Cargar empleados ──────────────────────────────────
  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      let query = supabase
        .from('employees')
        .select(`
          id, employee_code, position, hire_date, salary,
          salary_currency, status,
          profiles ( id, full_name, email, phone, avatar_url ),
          departments ( name ),
          branches ( name, code )
        `, { count: 'exact' })
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .range((page - 1) * 20, page * 20 - 1)

      if (search) {
        query = query.or(`position.ilike.%${search}%,employee_code.ilike.%${search}%`)
      }

      const { data, error, count } = await query
      if (!error) {
        setEmployees(data || [])
        setPagination({ total: count, pages: Math.ceil((count || 0) / 20) })
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [page, search, companyId])

  useEffect(() => { load() }, [load])

  // ── Cargar perfiles y sucursales para el modal ────────
  async function loadFormData() {
    try {
      const [profRes, branchRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email').eq('company_id', companyId).eq('status', 'active'),
        supabase.from('branches').select('id, name, code').eq('company_id', companyId),
      ])
      setProfiles(profRes.data || [])
      setBranches(branchRes.data || [])
    } catch (e) { console.error(e) }
  }

  // ── Abrir modal nuevo ─────────────────────────────────
  async function openNew() {
    setEditing(null)
    setForm({
      position:        '',
      hire_date:       new Date().toISOString().split('T')[0],
      salary:          '',
      salary_currency: 'DOP',
      branch_id:       branchId,
      profile_id:      '',
      status:          'active',
    })
    setShowModal(true)
    await loadFormData()
  }

  // ── Abrir modal editar ────────────────────────────────
  async function openEdit(emp) {
    setEditing(emp)
    setForm({
      position:        emp.position || '',
      hire_date:       emp.hire_date || '',
      salary:          emp.salary || '',
      salary_currency: emp.salary_currency || 'DOP',
      branch_id:       emp.branch_id || branchId,
      profile_id:      emp.profile_id || '',
      status:          emp.status || 'active',
    })
    setShowModal(true)
    await loadFormData()
  }

  function fc(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // ── Guardar empleado ──────────────────────────────────
  async function save() {
    if (!form.position) return alert('El cargo es obligatorio')
    setSaving(true)
    try {
      if (editing?.id) {
        // Editar
        const { error } = await supabase
          .from('employees')
          .update({
            position:        form.position,
            hire_date:       form.hire_date,
            salary:          form.salary ? parseFloat(form.salary) : null,
            salary_currency: form.salary_currency,
            branch_id:       form.branch_id || null,
            status:          form.status,
            updated_at:      new Date().toISOString(),
          })
          .eq('id', editing.id)
        if (error) throw new Error(error.message)
      } else {
        // Nuevo
        if (!form.profile_id) return alert('Selecciona un perfil de usuario')

        const { count } = await supabase
          .from('employees')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', companyId)

        const { error } = await supabase.from('employees').insert({
          profile_id:      form.profile_id,
          company_id:      companyId,
          branch_id:       form.branch_id || branchId,
          employee_code:   `HPA-E-${String((count || 0) + 1).padStart(4, '0')}`,
          position:        form.position,
          hire_date:       form.hire_date,
          salary:          form.salary ? parseFloat(form.salary) : null,
          salary_currency: form.salary_currency || 'DOP',
          status:          'active',
        })
        if (error) throw new Error(error.message)
      }

      await supabase.from('audit_log').insert({
        company_id:  companyId,
        actor_id:    user.id,
        actor_type:  'user',
        actor_name:  user.full_name || user.email,
        actor_role:  user.role?.code || 'super_admin',
        action:      editing ? 'UPDATE' : 'CREATE',
        module:      'employees',
        record_type: 'employee',
      })

      setShowModal(false)
      load()
    } catch (err) { alert('❌ ' + err.message) }
    setSaving(false)
  }

  // ── Cambiar estado activo/inactivo ────────────────────
  async function toggleStatus(emp) {
    const newStatus = emp.status === 'active' ? 'inactive' : 'active'
    try {
      await supabase.from('employees')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', emp.id)
      load()
    } catch (err) { alert(err.message) }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Empleados</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">{pagination.total || 0} empleados registrados</p>
        </div>
        {(user?.role?.code === 'super_admin' || user?.role?.code === 'admin') && (
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={14} /> Nuevo Empleado
          </button>
        )}
      </div>

      {/* Búsqueda */}
      <div className="card p-4">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-hpa-slate-4" />
          <input
            className="input pl-8"
            placeholder="Buscar por cargo o código..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Código</th>
                <th>Cargo</th>
                <th>Sucursal</th>
                <th>Ingreso</th>
                <th>Salario</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <Spinner size={20} className="mx-auto" />
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <Empty
                      icon={Briefcase}
                      title="Sin empleados"
                      desc="Registra el primer empleado de la empresa"
                    />
                  </td>
                </tr>
              ) : employees.map(e => (
                <tr key={e.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-hpa-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {e.profiles?.full_name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="font-semibold text-hpa-slate-9">{e.profiles?.full_name || '—'}</p>
                        <p className="text-xs text-hpa-slate-5 flex items-center gap-1">
                          <Mail size={10} />{e.profiles?.email || '—'}
                        </p>
                        {e.profiles?.phone && (
                          <p className="text-xs text-hpa-slate-5 flex items-center gap-1">
                            <Phone size={10} />{e.profiles.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="font-mono text-xs font-semibold text-hpa-700">{e.employee_code}</td>
                  <td>
                    <p className="font-medium text-sm">{e.position}</p>
                    {e.departments?.name && (
                      <p className="text-xs text-hpa-slate-5">{e.departments.name}</p>
                    )}
                  </td>
                  <td className="text-sm text-hpa-slate-6">{e.branches?.name || '—'}</td>
                  <td className="text-xs text-hpa-slate-5">
                    <div className="flex items-center gap-1">
                      <Calendar size={11} />
                      {fmtDate(e.hire_date)}
                    </div>
                  </td>
                  <td className="font-numeric text-sm">
                    {e.salary
                      ? `${e.salary_currency} ${parseFloat(e.salary).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                      : '—'
                    }
                  </td>
                  <td>
                    <button
                      className={`badge cursor-pointer ${e.status === 'active' ? 'badge-green' : 'badge-gray'}`}
                      onClick={() => toggleStatus(e)}
                      title="Click para cambiar estado"
                    >
                      {e.status === 'active' ? 'ACTIVO' : 'INACTIVO'}
                    </button>
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm btn-icon"
                      title="Editar empleado"
                      onClick={() => openEdit(e)}
                    >
                      <Edit2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pages={pagination.pages}
          total={pagination.total}
          limit={20}
          onChange={setPage}
        />
      </div>

      {/* MODAL NUEVO / EDITAR EMPLEADO */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Editar Empleado' : 'Nuevo Empleado'}
        size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <Spinner size={14} /> : <><Save size={14} /> {editing ? 'Guardar Cambios' : 'Registrar Empleado'}</>}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Perfil — solo en creación */}
          {!editing && (
            <Field label="Usuario del sistema" required>
              <select
                className="select"
                value={form.profile_id || ''}
                onChange={e => fc('profile_id', e.target.value)}
              >
                <option value="">Seleccionar usuario...</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} — {p.email}
                  </option>
                ))}
              </select>
              <p className="text-xs text-hpa-slate-4 mt-1">
                El usuario debe tener cuenta activa en el sistema.
              </p>
            </Field>
          )}

          {/* Cargo */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cargo / Posición" required>
              <input
                className="input"
                placeholder="Ej: Analista de Crédito"
                value={form.position || ''}
                onChange={e => fc('position', e.target.value)}
              />
            </Field>
            <Field label="Sucursal">
              <select
                className="select"
                value={form.branch_id || ''}
                onChange={e => fc('branch_id', e.target.value)}
              >
                <option value="">Seleccionar sucursal...</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Fechas y salario */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Fecha de Ingreso" required>
              <input
                className="input"
                type="date"
                value={form.hire_date || ''}
                onChange={e => fc('hire_date', e.target.value)}
              />
            </Field>
            <Field label="Salario">
              <input
                className="input"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={form.salary || ''}
                onChange={e => fc('salary', e.target.value)}
              />
            </Field>
            <Field label="Moneda">
              <select
                className="select"
                value={form.salary_currency || 'DOP'}
                onChange={e => fc('salary_currency', e.target.value)}
              >
                <option value="DOP">🇩🇴 DOP</option>
                <option value="USD">🇺🇸 USD</option>
                <option value="BRL">🇧🇷 BRL</option>
              </select>
            </Field>
          </div>

          {/* Estado — solo en edición */}
          {editing && (
            <Field label="Estado">
              <select
                className="select"
                value={form.status || 'active'}
                onChange={e => fc('status', e.target.value)}
              >
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
                <option value="terminated">Terminado</option>
                <option value="suspended">Suspendido</option>
              </select>
            </Field>
          )}
        </div>
      </Modal>
    </div>
  )
}
