import { useState, useEffect } from 'react'
import { Plus, Edit2, CheckCircle, XCircle, Eye, DollarSign } from 'lucide-react'
import { supabase, fmt, fmtDate } from '@/lib/supabase'
import { StatusBadge, Modal, Field, Spinner, Empty, Tabs, Pagination } from '@/components/ui'
import useAuthStore from '@/store/auth'

const STATUS_COLORS = {
  pending: 'badge-amber', approved: 'badge-blue', active: 'badge-green',
  paused: 'badge-gray', expired: 'badge-gray', rejected: 'badge-red'
}
const STATUS_LABELS = {
  pending: 'Pendiente', approved: 'Aprobado', active: 'Activo',
  paused: 'Pausado', expired: 'Expirado', rejected: 'Rechazado'
}

export default function Advertising() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState('banners')
  const [banners, setBanners] = useState([])
  const [spaces, setSpaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({})
  const [showModal, setShowModal] = useState(false)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadSpaces(); loadBanners() }, [page])

  async function loadSpaces() {
    const { data } = await supabase.from('ad_spaces').select('*').eq('is_active', true)
    setSpaces(data || [])
  }

  async function loadBanners() {
    setLoading(true)
    const limit = 20
    const offset = (page - 1) * limit
    const { data, count } = await supabase
      .from('ad_banners')
      .select('*, ad_spaces(name, position)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    setBanners(data || [])
    setPagination({ total: count, page, limit, pages: Math.ceil((count||0)/limit) })
    setLoading(false)
  }

  function fc(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function saveRequest() {
    setSaving(true)
    try {
      if (!form.advertiser_name || !form.advertiser_email || !form.space_id || !form.period_type) {
        throw new Error('Completa: Nombre, Email, Espacio y Período')
      }
      const space = spaces.find(s => s.id === form.space_id)
      const amount = form.period_type === 'weekly' ? space?.price_weekly : space?.price_monthly
      const start = form.start_date || new Date().toISOString().split('T')[0]
      const days = form.period_type === 'weekly' ? 7 : 30
      const end = new Date(new Date(start).getTime() + days * 86400000).toISOString().split('T')[0]

      await supabase.from('ad_banners').insert({
        space_id: form.space_id,
        advertiser_name: form.advertiser_name,
        advertiser_email: form.advertiser_email,
        advertiser_phone: form.advertiser_phone || null,
        company_name: form.company_name || null,
        image_url: form.image_url || null,
        link_url: form.link_url || null,
        alt_text: form.alt_text || null,
        period_type: form.period_type,
        start_date: start,
        end_date: end,
        payment_method: form.payment_method || 'transfer',
        amount_paid: amount || 0,
        notes: form.notes || null,
        status: 'pending',
        payment_status: 'pending'
      })
      setShowRequestModal(false)
      setForm({})
      loadBanners()
      alert('✅ Solicitud enviada exitosamente. Te contactaremos para confirmar el pago.')
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  async function updateStatus(banner, newStatus) {
    try {
      const updates = { status: newStatus }
      if (newStatus === 'approved') {
        updates.approved_by = user.id
        updates.approved_at = new Date().toISOString()
      }
      if (newStatus === 'active') {
        updates.payment_status = 'paid'
      }
      await supabase.from('ad_banners').update(updates).eq('id', banner.id)
      loadBanners()
    } catch (err) { alert(err.message) }
  }

  const TABS = [
    { id: 'banners', label: 'Solicitudes y Banners' },
    { id: 'spaces',  label: 'Espacios Disponibles' },
  ]

  const positionLabel = {
    header: 'Header (Superior)', dashboard_top: 'Dashboard Principal',
    footer: 'Pie de Página', sidebar: 'Lateral'
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Publicidad</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">Gestión de espacios publicitarios</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm({}); setShowRequestModal(true) }}>
          <Plus size={15} /> Nueva Solicitud
        </button>
      </div>

      <div className="card p-0">
        <div className="px-5 pt-4">
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
        </div>

        {tab === 'spaces' && (
          <div className="p-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
            {spaces.map(s => (
              <div key={s.id} className="border border-hpa-slate-2 rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-hpa-slate-9">{s.name}</p>
                    <p className="text-xs text-hpa-slate-5">{positionLabel[s.position]} · {s.width}×{s.height}px</p>
                  </div>
                  <span className="badge badge-green">Disponible</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-hpa-slate-1 rounded-lg text-center">
                    <p className="text-xs text-hpa-slate-5">Semanal</p>
                    <p className="font-bold text-hpa-700">{fmt(s.price_weekly)}</p>
                  </div>
                  <div className="p-3 bg-hpa-slate-1 rounded-lg text-center">
                    <p className="text-xs text-hpa-slate-5">Mensual</p>
                    <p className="font-bold text-hpa-700">{fmt(s.price_monthly)}</p>
                  </div>
                </div>
                <button className="btn btn-primary w-full mt-3"
                  onClick={() => { setForm({ space_id: s.id }); setShowRequestModal(true) }}>
                  Solicitar este espacio
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'banners' && (
          <>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Anunciante</th><th>Espacio</th><th>Período</th>
                    <th>Monto</th><th>Pago</th><th>Estado</th><th>Fechas</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="py-12 text-center"><Spinner size={20} className="mx-auto" /></td></tr>
                  ) : banners.length === 0 ? (
                    <tr><td colSpan={8}><Empty icon={DollarSign} title="Sin solicitudes" desc="No hay solicitudes de publicidad aún" /></td></tr>
                  ) : banners.map(b => (
                    <tr key={b.id}>
                      <td>
                        <p className="font-medium">{b.advertiser_name}</p>
                        <p className="text-xs text-hpa-slate-5">{b.company_name || b.advertiser_email}</p>
                      </td>
                      <td className="text-xs">{b.ad_spaces?.name || '—'}</td>
                      <td><span className="badge badge-blue">{b.period_type === 'weekly' ? 'Semanal' : 'Mensual'}</span></td>
                      <td className="font-numeric">{fmt(b.amount_paid)}</td>
                      <td>
                        <span className={`badge ${b.payment_status === 'paid' ? 'badge-green' : 'badge-amber'}`}>
                          {b.payment_status === 'paid' ? 'Pagado' : 'Pendiente'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_COLORS[b.status] || 'badge-gray'}`}>
                          {STATUS_LABELS[b.status] || b.status}
                        </span>
                      </td>
                      <td className="text-xs text-hpa-slate-5">
                        {fmtDate(b.start_date)} — {fmtDate(b.end_date)}
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {b.status === 'pending' && (
                            <>
                              <button className="btn btn-ghost btn-sm btn-icon text-emerald-600" title="Aprobar"
                                onClick={() => updateStatus(b, 'approved')}>
                                <CheckCircle size={13} />
                              </button>
                              <button className="btn btn-ghost btn-sm btn-icon text-red-500" title="Rechazar"
                                onClick={() => updateStatus(b, 'rejected')}>
                                <XCircle size={13} />
                              </button>
                            </>
                          )}
                          {b.status === 'approved' && (
                            <button className="btn btn-ghost btn-sm btn-icon text-hpa-700" title="Activar (marcar pagado)"
                              onClick={() => updateStatus(b, 'active')}>
                              <DollarSign size={13} />
                            </button>
                          )}
                          {b.image_url && (
                            <a href={b.image_url} target="_blank" rel="noreferrer"
                              className="btn btn-ghost btn-sm btn-icon">
                              <Eye size={13} />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pages={pagination.pages} total={pagination.total} limit={20} onChange={setPage} />
          </>
        )}
      </div>

      {/* Modal solicitud de banner */}
      <Modal open={showRequestModal} onClose={() => { setShowRequestModal(false); setForm({}) }}
        title="Solicitar Espacio Publicitario" size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => { setShowRequestModal(false); setForm({}) }}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveRequest} disabled={saving}>
              {saving ? <Spinner size={14} /> : 'Enviar Solicitud'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div>
            <p className="form-section-title">Datos del Anunciante</p>
            <div className="form-row">
              <Field label="Nombre del Contacto" required>
                <input className="input" value={form.advertiser_name||''} onChange={e=>fc('advertiser_name',e.target.value)} />
              </Field>
              <Field label="Empresa">
                <input className="input" value={form.company_name||''} onChange={e=>fc('company_name',e.target.value)} />
              </Field>
            </div>
            <div className="form-row mt-3">
              <Field label="Email" required>
                <input className="input" type="email" value={form.advertiser_email||''} onChange={e=>fc('advertiser_email',e.target.value)} />
              </Field>
              <Field label="Teléfono">
                <input className="input" type="tel" value={form.advertiser_phone||''} onChange={e=>fc('advertiser_phone',e.target.value)} />
              </Field>
            </div>
          </div>
          <div>
            <p className="form-section-title">Espacio y Período</p>
            <div className="form-row">
              <Field label="Espacio Publicitario" required>
                <select className="select" value={form.space_id||''} onChange={e=>fc('space_id',e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {spaces.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Período" required>
                <select className="select" value={form.period_type||''} onChange={e=>fc('period_type',e.target.value)}>
                  <option value="">Seleccionar...</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </Field>
            </div>
            {form.space_id && form.period_type && (
              <div className="mt-2 p-3 bg-hpa-700/5 border border-hpa-700/20 rounded-lg">
                <p className="text-xs text-hpa-slate-6">Precio del espacio seleccionado:</p>
                <p className="text-lg font-bold text-hpa-700 font-numeric">
                  {fmt(spaces.find(s=>s.id===form.space_id)?.[form.period_type==='weekly'?'price_weekly':'price_monthly'] || 0)}
                </p>
              </div>
            )}
            <Field label="Fecha de inicio" className="mt-3">
              <input className="input" type="date" value={form.start_date||''} onChange={e=>fc('start_date',e.target.value)} />
            </Field>
          </div>
          <div>
            <p className="form-section-title">Contenido del Banner</p>
            <Field label="URL de la imagen (link directo)">
              <input className="input" type="url" placeholder="https://..." value={form.image_url||''} onChange={e=>fc('image_url',e.target.value)} />
            </Field>
            <Field label="URL de destino (al hacer clic)" className="mt-3">
              <input className="input" type="url" placeholder="https://..." value={form.link_url||''} onChange={e=>fc('link_url',e.target.value)} />
            </Field>
            <Field label="Texto alternativo / descripción" className="mt-3">
              <input className="input" value={form.alt_text||''} onChange={e=>fc('alt_text',e.target.value)} />
            </Field>
          </div>
          <div>
            <p className="form-section-title">Método de Pago</p>
            <Field label="Cómo deseas pagar">
              <select className="select" value={form.payment_method||''} onChange={e=>fc('payment_method',e.target.value)}>
                <option value="">Seleccionar...</option>
                <option value="transfer">Transferencia bancaria</option>
                <option value="cash">Efectivo</option>
                <option value="stripe">Stripe (tarjeta)</option>
                <option value="paypal">PayPal</option>
              </select>
            </Field>
            <Field label="Notas adicionales" className="mt-3">
              <textarea className="input h-16 resize-none" value={form.notes||''} onChange={e=>fc('notes',e.target.value)} />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  )
}
