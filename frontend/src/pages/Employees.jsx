import { useState, useEffect, useCallback } from 'react'
import { Briefcase, Plus, Search, Edit2, Save, Phone, Mail, Calendar, Upload, FileText, Eye, Trash2, X, ChevronLeft } from 'lucide-react'
import { supabase, fmtDate } from '@/lib/supabase'
import { StatusBadge, Modal, Field, Pagination, Empty, Spinner } from '@/components/ui'
import useAuthStore from '@/store/auth'

const DOC_TYPES = [
  { value: 'cedula',    label: '🪪 Cédula de Identidad'  },
  { value: 'pasaporte', label: '📘 Pasaporte'             },
  { value: 'contrato',  label: '📄 Contrato Laboral'      },
  { value: 'cv',        label: '📋 Currículum Vitae'      },
  { value: 'otros',     label: '📎 Otros Documentos'      },
]

export default function Employees() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id || 'a0000000-0000-4000-8000-000000000001'
  const branchId  = user?.branch?.id  || 'b0000000-0000-4000-8000-000000000001'

  const [employees, setEmployees]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(1)
  const [pagination, setPagination] = useState({})
  const [search, setSearch]         = useState('')

  // Vista detalle
  const [detail, setDetail]         = useState(null)
  const [detailDocs, setDetailDocs] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [docType, setDocType]       = useState('cedula')

  // Modal editar
  const [showModal, setShowModal]   = useState(false)
  const [editing, setEditing]       = useState(null)
  const [form, setForm]             = useState({})
  const [saving, setSaving]         = useState(false)
  const [profiles, setProfiles]     = useState([])
  const [branches, setBranches]     = useState([])

  // ── Cargar lista ──────────────────────────────────────
  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      let query = supabase
        .from('employees')
        .select(`
          id, employee_code, position, hire_date, salary,
          salary_currency, status, profile_id,
          profiles ( id, full_name, email, phone, avatar_url ),
          departments ( name ),
          branches ( name, code )
        `, { count: 'exact' })
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .range((page - 1) * 20, page * 20 - 1)

      if (search) query = query.or(`position.ilike.%${search}%,employee_code.ilike.%${search}%`)

      const { data, error, count } = await query
      if (!error) {
        setEmployees(data || [])
        setPagination({ total: count, pages: Math.ceil((count || 0) / 20) })
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [page, search, companyId])

  useEffect(() => { load() }, [load])

  // ── Cargar documentos del empleado ────────────────────
  async function loadDocs(emp) {
    setLoadingDocs(true)
    try {
      const { data } = await supabase
        .from('employee_documents')
        .select('*')
        .eq('employee_id', emp.id)
        .order('created_at', { ascending: false })
      setDetailDocs(data || [])
    } catch (e) {
      // Tabla puede no existir — cargar desde Storage
      try {
        const { data: files } = await supabase.storage
          .from('documents')
          .list(`employees/${emp.id}`)
        setDetailDocs((files || []).map(f => ({
          id: f.name,
          file_name: f.name,
          doc_type: f.name.split('_')[0] || 'otros',
          created_at: f.created_at,
          url: supabase.storage.from('documents').getPublicUrl(`employees/${emp.id}/${f.name}`).data.publicUrl,
        })))
      } catch {}
    }
    setLoadingDocs(false)
  }

  // ── Abrir detalle ─────────────────────────────────────
  async function openDetail(emp) {
    setDetail(emp)
    setDocType('cedula')
    await loadDocs(emp)
  }

  // ── Subir foto de perfil ──────────────────────────────
  async function uploadPhoto(file, emp) {
    if (!file) return
    setUploadingPhoto(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = `employees/${emp.id}/avatar.${ext}`
      const { error: upErr } = await supabase.storage
        .from('documents').upload(path, file, { upsert: true })
      if (upErr) throw new Error(upErr.message)
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
      // Actualizar avatar_url en profiles
      await supabase.from('profiles')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', emp.profile_id)
      // Refrescar detalle
      setDetail(d => ({ ...d, profiles: { ...d.profiles, avatar_url: urlData.publicUrl } }))
      load()
      alert('✅ Foto actualizada')
    } catch (err) { alert('❌ ' + err.message) }
    setUploadingPhoto(false)
  }

  // ── Subir documento ───────────────────────────────────
  async function uploadDoc(file, emp) {
    if (!file) return
    setUploadingDoc(true)
    try {
      const ts   = Date.now()
      const ext  = file.name.split('.').pop()
      const path = `employees/${emp.id}/${docType}_${ts}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('documents').upload(path, file, { upsert: false })
      if (upErr) throw new Error(upErr.message)
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)

      // Intentar insertar en tabla de documentos
      try {
        await supabase.from('employee_documents').insert({
          employee_id: emp.id,
          company_id:  companyId,
          doc_type:    docType,
          file_name:   file.name,
          file_url:    urlData.publicUrl,
          uploaded_by: user.id,
        })
      } catch {}

      await loadDocs(emp)
      alert('✅ Documento subido exitosamente')
    } catch (err) { alert('❌ ' + err.message) }
    setUploadingDoc(false)
  }

  // ── Cargar form data ──────────────────────────────────
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

  async function openNew() {
    setEditing(null)
    setForm({ position: '', hire_date: new Date().toISOString().split('T')[0], salary: '', salary_currency: 'DOP', branch_id: branchId, profile_id: '', status: 'active' })
    setShowModal(true)
    await loadFormData()
  }

  async function openEdit(emp) {
    setEditing(emp)
    setForm({ position: emp.position || '', hire_date: emp.hire_date || '', salary: emp.salary || '', salary_currency: emp.salary_currency || 'DOP', branch_id: emp.branch_id || branchId, profile_id: emp.profile_id || '', status: emp.status || 'active' })
    setShowModal(true)
    await loadFormData()
  }

  function fc(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.position) return alert('El cargo es obligatorio')
    setSaving(true)
    try {
      if (editing?.id) {
        const { error } = await supabase.from('employees').update({
          position: form.position, hire_date: form.hire_date,
          salary: form.salary ? parseFloat(form.salary) : null,
          salary_currency: form.salary_currency, branch_id: form.branch_id || null,
          status: form.status, updated_at: new Date().toISOString(),
        }).eq('id', editing.id)
        if (error) throw new Error(error.message)
      } else {
        if (!form.profile_id) { setSaving(false); return alert('Selecciona un perfil de usuario') }
        const { count } = await supabase.from('employees').select('*', { count: 'exact', head: true }).eq('company_id', companyId)
        const { error } = await supabase.from('employees').insert({
          profile_id: form.profile_id, company_id: companyId,
          branch_id: form.branch_id || branchId,
          employee_code: `HPA-E-${String((count || 0) + 1).padStart(4, '0')}`,
          position: form.position, hire_date: form.hire_date,
          salary: form.salary ? parseFloat(form.salary) : null,
          salary_currency: form.salary_currency || 'DOP', status: 'active',
        })
        if (error) throw new Error(error.message)
      }
      await supabase.from('audit_log').insert({
        company_id: companyId, actor_id: user.id, actor_type: 'user',
        actor_name: user.full_name || user.email, actor_role: user.role?.code || 'super_admin',
        action: editing ? 'UPDATE' : 'CREATE', module: 'employees', record_type: 'employee',
      })
      setShowModal(false)
      load()
      if (detail?.id === editing?.id) setDetail(d => ({ ...d, ...form }))
    } catch (err) { alert('❌ ' + err.message) }
    setSaving(false)
  }

  async function toggleStatus(emp) {
    const newStatus = emp.status === 'active' ? 'inactive' : 'active'
    try {
      await supabase.from('employees').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', emp.id)
      load()
      if (detail?.id === emp.id) setDetail(d => ({ ...d, status: newStatus }))
    } catch (err) { alert(err.message) }
  }

  const initials = (name) => name?.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase() || '?'

  // ── VISTA DETALLE ─────────────────────────────────────
  if (detail) {
    const emp = detail
    return (
      <div className="space-y-5 animate-fade-in">
        {/* Header detalle */}
        <div className="flex items-center gap-3">
          <button className="btn btn-ghost btn-sm" onClick={() => setDetail(null)}>
            <ChevronLeft size={16} /> Volver
          </button>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-hpa-slate-9">{emp.profiles?.full_name}</h2>
            <p className="text-xs text-hpa-slate-5">{emp.employee_code} · {emp.position}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(emp)}>
            <Edit2 size={14} /> Editar
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Perfil card */}
          <div className="card space-y-4">
            {/* Foto */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative group">
                <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center bg-hpa-700 text-white text-2xl font-bold">
                  {emp.profiles?.avatar_url
                    ? <img src={emp.profiles.avatar_url} alt="Foto" className="w-full h-full object-cover" />
                    : <span>{initials(emp.profiles?.full_name)}</span>
                  }
                </div>
                <label className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  {uploadingPhoto
                    ? <Spinner size={16} />
                    : <Upload size={16} className="text-white" />
                  }
                  <input type="file" className="hidden" accept="image/*"
                    onChange={e => uploadPhoto(e.target.files[0], emp)}
                    disabled={uploadingPhoto} />
                </label>
              </div>
              <div className="text-center">
                <p className="font-bold text-hpa-slate-9">{emp.profiles?.full_name}</p>
                <p className="text-xs text-hpa-slate-5">{emp.position}</p>
                <button
                  className={`badge mt-2 cursor-pointer ${emp.status === 'active' ? 'badge-green' : 'badge-gray'}`}
                  onClick={() => toggleStatus(emp)}>
                  {emp.status === 'active' ? 'ACTIVO' : 'INACTIVO'}
                </button>
              </div>
            </div>

            {/* Info */}
            <div className="space-y-0 border-t border-hpa-slate-2 pt-4">
              {[
                { label: 'Código',    value: emp.employee_code },
                { label: 'Email',     value: emp.profiles?.email },
                { label: 'Teléfono', value: emp.profiles?.phone || '—' },
                { label: 'Sucursal', value: emp.branches?.name || '—' },
                { label: 'Ingreso',  value: fmtDate(emp.hire_date) },
                { label: 'Salario',  value: emp.salary ? `${emp.salary_currency} ${parseFloat(emp.salary).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—' },
              ].map(item => (
                <div key={item.label} className="stat-row">
                  <span className="stat-label">{item.label}</span>
                  <span className="stat-value text-right text-xs">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Documentos */}
          <div className="lg:col-span-2 card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-hpa-slate-9">Documentos</h3>
                <p className="text-xs text-hpa-slate-5">Cédula, pasaporte, contrato, CV y otros</p>
              </div>
            </div>

            {/* Subir documento */}
            <div className="p-4 bg-hpa-slate-1 rounded-xl border border-hpa-slate-2 border-dashed">
              <p className="text-xs font-semibold text-hpa-slate-7 mb-3">Subir nuevo documento</p>
              <div className="flex gap-3 flex-wrap items-end">
                <div className="flex-1 min-w-40">
                  <label className="text-xs text-hpa-slate-5 mb-1 block">Tipo de documento</label>
                  <select className="select text-xs" value={docType} onChange={e => setDocType(e.target.value)}>
                    {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                <label className={`btn btn-primary btn-sm cursor-pointer ${uploadingDoc ? 'opacity-50' : ''}`}>
                  <Upload size={13} />
                  {uploadingDoc ? 'Subiendo...' : 'Seleccionar archivo'}
                  <input type="file" className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                    onChange={e => uploadDoc(e.target.files[0], emp)}
                    disabled={uploadingDoc} />
                </label>
              </div>
              <p className="text-2xs text-hpa-slate-4 mt-2">
                Formatos: PDF, JPG, PNG, Word, Excel · Máx 10MB · También puedes guardar documentos enviados por WhatsApp
              </p>
            </div>

            {/* Lista de documentos */}
            {loadingDocs ? (
              <div className="py-8 flex justify-center"><Spinner size={20} /></div>
            ) : detailDocs.length === 0 ? (
              <Empty icon={FileText} title="Sin documentos" desc="Sube la cédula, pasaporte o contrato del empleado" />
            ) : (
              <div className="space-y-2">
                {detailDocs.map(doc => {
                  const docLabel = DOC_TYPES.find(d => d.value === doc.doc_type)?.label || doc.doc_type
                  const isImage  = /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.file_name || doc.id || '')
                  const isPdf    = /\.pdf$/i.test(doc.file_name || doc.id || '')
                  return (
                    <div key={doc.id} className="flex items-center gap-3 p-3 bg-white border border-hpa-slate-2 rounded-xl hover:bg-hpa-slate-1 transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-hpa-slate-1 flex items-center justify-center flex-shrink-0">
                        {isImage
                          ? <img src={doc.file_url || doc.url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                          : <FileText size={18} className={isPdf ? 'text-red-500' : 'text-hpa-700'} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-hpa-slate-9 truncate">{doc.file_name || doc.id}</p>
                        <p className="text-2xs text-hpa-slate-5">{docLabel} · {fmtDate(doc.created_at)}</p>
                      </div>
                      <a href={doc.file_url || doc.url} target="_blank" rel="noreferrer"
                        className="btn btn-ghost btn-sm btn-icon" title="Ver documento">
                        <Eye size={14} />
                      </a>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal editar desde detalle */}
        <Modal open={showModal} onClose={() => setShowModal(false)}
          title="Editar Empleado" size="lg"
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <Spinner size={14} /> : <><Save size={14} /> Guardar Cambios</>}
              </button>
            </>
          }>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cargo / Posición" required>
                <input className="input" value={form.position || ''} onChange={e => fc('position', e.target.value)} />
              </Field>
              <Field label="Sucursal">
                <select className="select" value={form.branch_id || ''} onChange={e => fc('branch_id', e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Fecha de Ingreso">
                <input className="input" type="date" value={form.hire_date || ''} onChange={e => fc('hire_date', e.target.value)} />
              </Field>
              <Field label="Salario">
                <input className="input" type="number" step="0.01" value={form.salary || ''} onChange={e => fc('salary', e.target.value)} />
              </Field>
              <Field label="Moneda">
                <select className="select" value={form.salary_currency || 'DOP'} onChange={e => fc('salary_currency', e.target.value)}>
                  <option value="DOP">🇩🇴 DOP</option>
                  <option value="USD">🇺🇸 USD</option>
                  <option value="BRL">🇧🇷 BRL</option>
                </select>
              </Field>
            </div>
            <Field label="Estado">
              <select className="select" value={form.status || 'active'} onChange={e => fc('status', e.target.value)}>
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
                <option value="terminated">Terminado</option>
                <option value="suspended">Suspendido</option>
              </select>
            </Field>
          </div>
        </Modal>
      </div>
    )
  }

  // ── VISTA LISTA ───────────────────────────────────────
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Empleados</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">{pagination.total || 0} empleados registrados</p>
        </div>
        {(user?.role?.code === 'super_admin' || user?.role?.code === 'admin') && (
          <button className="btn btn-primary" onClick={openNew}><Plus size={14} /> Nuevo Empleado</button>
        )}
      </div>

      <div className="card p-4">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-hpa-slate-4" />
          <input className="input pl-8" placeholder="Buscar por cargo o código..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Empleado</th><th>Código</th><th>Cargo</th><th>Sucursal</th><th>Ingreso</th><th>Salario</th><th>Estado</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-12 text-center"><Spinner size={20} className="mx-auto" /></td></tr>
              ) : employees.length === 0 ? (
                <tr><td colSpan={8}><Empty icon={Briefcase} title="Sin empleados" desc="Registra el primer empleado" /></td></tr>
              ) : employees.map(e => (
                <tr key={e.id} className="cursor-pointer" onClick={() => openDetail(e)}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-hpa-700 text-white text-xs font-bold flex-shrink-0">
                        {e.profiles?.avatar_url
                          ? <img src={e.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                          : <span>{initials(e.profiles?.full_name)}</span>
                        }
                      </div>
                      <div>
                        <p className="font-semibold text-hpa-slate-9">{e.profiles?.full_name || '—'}</p>
                        <p className="text-xs text-hpa-slate-5 flex items-center gap-1"><Mail size={10} />{e.profiles?.email || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="font-mono text-xs font-semibold text-hpa-700">{e.employee_code}</td>
                  <td><p className="font-medium text-sm">{e.position}</p></td>
                  <td className="text-sm text-hpa-slate-6">{e.branches?.name || '—'}</td>
                  <td className="text-xs text-hpa-slate-5"><div className="flex items-center gap-1"><Calendar size={11} />{fmtDate(e.hire_date)}</div></td>
                  <td className="font-numeric text-sm">{e.salary ? `${e.salary_currency} ${parseFloat(e.salary).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}</td>
                  <td>
                    <button className={`badge cursor-pointer ${e.status === 'active' ? 'badge-green' : 'badge-gray'}`}
                      onClick={ev => { ev.stopPropagation(); toggleStatus(e) }}>
                      {e.status === 'active' ? 'ACTIVO' : 'INACTIVO'}
                    </button>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={ev => { ev.stopPropagation(); openEdit(e) }}>
                      <Edit2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={pagination.pages} total={pagination.total} limit={20} onChange={setPage} />
      </div>

      {/* Modal nuevo empleado */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title="Nuevo Empleado" size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <Spinner size={14} /> : <><Save size={14} /> Registrar Empleado</>}
            </button>
          </>
        }>
        <div className="space-y-4">
          <Field label="Usuario del sistema" required>
            <select className="select" value={form.profile_id || ''} onChange={e => fc('profile_id', e.target.value)}>
              <option value="">Seleccionar usuario...</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name} — {p.email}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cargo / Posición" required>
              <input className="input" placeholder="Ej: Analista de Crédito" value={form.position || ''} onChange={e => fc('position', e.target.value)} />
            </Field>
            <Field label="Sucursal">
              <select className="select" value={form.branch_id || ''} onChange={e => fc('branch_id', e.target.value)}>
                <option value="">Seleccionar...</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Fecha de Ingreso" required>
              <input className="input" type="date" value={form.hire_date || ''} onChange={e => fc('hire_date', e.target.value)} />
            </Field>
            <Field label="Salario">
              <input className="input" type="number" step="0.01" placeholder="0.00" value={form.salary || ''} onChange={e => fc('salary', e.target.value)} />
            </Field>
            <Field label="Moneda">
              <select className="select" value={form.salary_currency || 'DOP'} onChange={e => fc('salary_currency', e.target.value)}>
                <option value="DOP">🇩🇴 DOP</option>
                <option value="USD">🇺🇸 USD</option>
                <option value="BRL">🇧🇷 BRL</option>
              </select>
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  )
}
