import { useState, useEffect, useCallback } from 'react'
import { Search, Plus, Edit2, Trash2 } from 'lucide-react'
import { db, supabase, fmtDate } from '@/lib/supabase'
import { StatusBadge, Modal, Field, Pagination, Empty, Spinner } from '@/components/ui'
import useAuthStore from '@/store/auth'

const STATUS_OPTS = ['prospect', 'active', 'inactive', 'suspended', 'blacklist']
const riskBadge = { low: 'badge-green', medium: 'badge-amber', high: 'badge-red', critical: 'badge-red' }
const riskLabel = { low: 'Bajo', medium: 'Medio', high: 'Alto', critical: 'Crítico' }

export default function Clients() {
  const { user, hasPermission } = useAuthStore()
  const companyId = user?.company?.id
  const branchId = user?.branch?.id

  const canDelete =
    typeof hasPermission === 'function'
      ? hasPermission('clients', 'delete') || ['super_admin', 'admin'].includes(user?.role?.code || user?.role_code)
      : true

  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({})
  const [showModal, setShowModal] = useState(false)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const data = await db.getClients({ page, limit: 20, search, status, companyId })
      setClients(data.clients || [])
      setPagination(data.pagination || {})
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [page, search, status, companyId])

  useEffect(() => {
    load()
  }, [load])

  function openNew() {
    setForm({})
    setSelected(null)
    setError('')
    setShowModal(true)
  }

  function openEdit(c) {
    setForm({ ...c })
    setSelected(c)
    setError('')
    setShowModal(true)
  }

  function fc(k, v) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      if (!form.first_name || !form.last_name || !form.phone_primary || !form.address || !form.city) {
        throw new Error('Completa los campos obligatorios: Nombre, Apellido, Teléfono, Dirección y Ciudad')
      }
      if (selected) {
        await db.updateClient(selected.id, form, companyId)
      } else {
        await db.createClient(form, companyId, branchId, user.id)
      }
      setShowModal(false)
      load()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  async function handleDeleteClient(client) {
    if (!client?.id) return
    const clientName = `${client.first_name || ''} ${client.last_name || ''}`.trim() || client.client_code || client.id
    const confirmed = window.confirm(
      `¿Eliminar definitivamente a "${clientName}" (${client.client_code || 'sin código'})? Esta acción eliminará el registro de clientes.`
    )
    if (!confirmed) return

    setDeletingId(client.id)
    setError('')
    try {
      if (typeof db.deleteClient === 'function') {
        await db.deleteClient(client.id, companyId)
      } else {
        // Limpieza segura de tablas hijas comunes si existen antes de borrar en clients
        const childDeletes = [
          supabase.from('client_beneficiaries').delete().eq('client_id', client.id),
          supabase.from('client_documents').delete().eq('client_id', client.id),
          supabase.from('client_interactions').delete().eq('client_id', client.id),
          supabase.from('client_references').delete().eq('client_id', client.id),
        ]
        await Promise.allSettled(childDeletes)

        const query = supabase.from('clients').delete().eq('id', client.id)
        const { error: delError } = companyId ? await query.eq('company_id', companyId) : await query
        if (delError) throw new Error(delError.message)
      }

      if (selected?.id === client.id) {
        setShowModal(false)
        setSelected(null)
      }
      await load()
    } catch (err) {
      const msg = err.message || 'No se pudo eliminar el cliente'
      setError(msg)
      if (!showModal) {
        alert('Error al eliminar cliente: ' + msg)
      }
    }
    setDeletingId(null)
  }

  const f = (name, label, type = 'text', required = false, opts = null) => (
    <Field label={label} required={required}>
      {opts ? (
        <select className="select" value={form[name] || ''} onChange={(e) => fc(name, e.target.value)}>
          <option value="">Seleccionar...</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="input"
          type={type}
          value={form[name] || ''}
          onChange={(e) => fc(name, e.target.value)}
        />
      )}
    </Field>
  )

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Clientes</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">{pagination.total || 0} clientes registrados</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={15} /> Nuevo Cliente
        </button>
      </div>

      <div className="card p-4 flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-hpa-slate-4" />
          <input
            className="input pl-8"
            placeholder="Buscar por nombre, cédula, código..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <select
          className="select w-36"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
        >
          <option value="">Todos los estados</option>
          {STATUS_OPTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Cédula</th>
                <th>Teléfono</th>
                <th>Estado</th>
                <th>KYC</th>
                <th>Riesgo</th>
                <th>Score</th>
                <th>Registro</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center">
                    <Spinner size={20} className="mx-auto" />
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <Empty
                      icon={Search}
                      title="No se encontraron clientes"
                      desc="Registra el primer cliente con el botón Nuevo Cliente"
                    />
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <p className="font-medium text-hpa-slate-9">
                        {c.first_name} {c.last_name}
                      </p>
                      <p className="text-xs text-hpa-slate-5">{c.client_code}</p>
                    </td>
                    <td className="font-numeric">{c.national_id || '—'}</td>
                    <td>{c.phone_primary}</td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          c.kyc_status === 'approved'
                            ? 'badge-green'
                            : c.kyc_status === 'rejected'
                            ? 'badge-red'
                            : 'badge-amber'
                        }`}
                      >
                        {c.kyc_status}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${riskBadge[c.risk_level] || 'badge-gray'}`}>
                        {riskLabel[c.risk_level] || c.risk_level}
                      </span>
                    </td>
                    <td className="font-numeric font-semibold">{c.internal_score}</td>
                    <td className="text-xs text-hpa-slate-5">{fmtDate(c.created_at)}</td>
                    <td className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-icon"
                          onClick={() => openEdit(c)}
                          title="Editar cliente"
                        >
                          <Edit2 size={13} />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm btn-icon text-red-600 hover:bg-red-50"
                            onClick={() => handleDeleteClient(c)}
                            disabled={deletingId === c.id}
                            title="Eliminar cliente"
                          >
                            {deletingId === c.id ? <Spinner size={13} /> : <Trash2 size={13} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
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

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={selected ? 'Editar Cliente' : 'Nuevo Cliente'}
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full gap-2">
            <div>
              {selected && canDelete && (
                <button
                  type="button"
                  className="btn bg-red-600 text-white hover:bg-red-700"
                  onClick={() => handleDeleteClient(selected)}
                  disabled={saving || deletingId === selected.id}
                >
                  {deletingId === selected.id ? <Spinner size={14} /> : <Trash2 size={14} />}
                  Eliminar Cliente
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <Spinner size={14} /> : selected ? 'Guardar Cambios' : 'Registrar Cliente'}
              </button>
            </div>
          </div>
        }
      >
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}
        <div className="space-y-5">
          <div>
            <p className="form-section-title">Datos Personales</p>
            <div className="form-row">
              {f('first_name', 'Nombre', 'text', true)}
              {f('last_name', 'Apellido', 'text', true)}
            </div>
            <div className="form-row mt-3">
              {f('national_id', 'Cédula / RNC')}
              {f('birth_date', 'Fecha Nac.', 'date')}
            </div>
            <div className="form-row mt-3">
              {f('gender', 'Género', 'text', false, ['male', 'female', 'other'])}
              {f('marital_status', 'Estado Civil', 'text', false, [
                'single',
                'married',
                'divorced',
                'widowed',
                'other',
              ])}
            </div>
          </div>
          <div>
            <p className="form-section-title">Contacto</p>
            <div className="form-row">
              {f('phone_primary', 'Teléfono Principal', 'tel', true)}
              {f('phone_secondary', 'Teléfono Secundario', 'tel')}
            </div>
            <div className="form-row mt-3">
              {f('email', 'Correo Electrónico', 'email')}
              {f('occupation', 'Ocupación')}
            </div>
            <div className="mt-3">
              <Field label="Dirección" required>
                <input
                  className="input"
                  value={form.address || ''}
                  onChange={(e) => fc('address', e.target.value)}
                />
              </Field>
            </div>
            <div className="form-row mt-3">
              {f('city', 'Ciudad', 'text', true)}
              {f('monthly_income', 'Ingreso Mensual', 'number')}
            </div>
          </div>
          <div>
            <p className="form-section-title">Estado</p>
            <div className="form-row">
              {f('status', 'Estado', 'text', false, STATUS_OPTS)}
              {f('nationality', 'Nacionalidad')}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
