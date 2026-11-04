import { useState, useEffect, useCallback } from 'react'
import { Plus, Eye, Edit, Trash2, X } from 'lucide-react'
import { supabase, fmtDate } from '@/lib/supabase'
import { StatusBadge, Modal, Field, Spinner, Empty } from '@/components/ui'
import useAuthStore from '@/store/auth'

export default function Advertising() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id || 'a0000000-0000-4000-8000-000000000001'

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    id: '',
    advertiser_name: '',
    agency_name: '',
    space_name: '',
    period: 'MENSUAL',
    amount: '',
    payment_status: 'PAGADO',
    status: 'ACTIVO',
    start_date: '',
    end_date: ''
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('ad_spaces')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })

      if (!error) setItems(data || [])
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [companyId])

  useEffect(() => { loadData() }, [loadData])

  function handleEdit(item) {
    setForm({
      id: item.id,
      advertiser_name: item.advertiser_name || '',
      agency_name: item.agency_name || '',
      space_name: item.space_name || '',
      period: item.period || 'MENSUAL',
      amount: item.amount || '',
      payment_status: item.payment_status || 'PAGADO',
      status: item.status || 'ACTIVO',
      start_date: item.start_date ? item.start_date.split('T')[0] : '',
      end_date: item.end_date ? item.end_date.split('T')[0] : ''
    })
    setShowEditModal(true)
  }

  async function saveChanges() {
    if (!form.amount) return alert('El monto es requerido')
    setSaving(true)
    try {
      const { error } = await supabase
        .from('ad_spaces')
        .update({
          advertiser_name: form.advertiser_name,
          agency_name: form.agency_name,
          space_name: form.space_name,
          period: form.period,
          amount: parseFloat(form.amount),
          payment_status: form.payment_status,
          status: form.status,
          start_date: form.start_date || null,
          end_date: form.end_date || null
        })
        .eq('id', form.id)

      if (error) throw error
      
      alert('✅ Publicación alterada y actualizada correctamente.')
      setShowEditModal(false)
      loadData()
    } catch (e) {
      alert('❌ Error al actualizar: ' + e.message)
    }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('¿Estás seguro de cancelar esta pauta publicitaria?')) return
    try {
      const { error } = await supabase
        .from('ad_spaces')
        .update({ status: 'CANCELADO', payment_status: 'CANCELADO' })
        .eq('id', id)

      if (error) throw error
      alert('✅ Pauta cancelada correctamente.')
      loadData()
    } catch (e) {
      alert('❌ Error al cancelar: ' + e.message)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-hpa-slate-9">Publicidad</h2>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>ANUNCIANTE</th>
                <th>ESPACIO</th>
                <th>PERÍODO</th>
                <th>MONTO</th>
                <th>PAGO</th>
                <th>ESTADO</th>
                <th>FECHAS</th>
                <th className="text-right">ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-12 text-center"><Spinner size={20} className="mx-auto" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8}><Empty title="Sin registros de publicidad" /></td></tr>
              ) : items.map(item => (
                <tr key={item.id}>
                  <td>
                    <p className="font-medium text-sm">{item.advertiser_name}</p>
                    <p className="text-xs text-hpa-slate-5">{item.agency_name}</p>
                  </td>
                  <td>{item.space_name}</td>
                  <td><span className="badge badge-blue">{item.period}</span></td>
                  <td className="font-numeric font-semibold">RD${parseFloat(item.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td><span className={`badge ${item.payment_status === 'PAGADO' ? 'badge-emerald' : 'badge-gold'}`}>{item.payment_status}</span></td>
                  <td><StatusBadge status={item.status} /></td>
                  <td className="text-xs text-hpa-slate-5">
                    {item.start_date ? fmtDate(item.start_date) : '—'} — {item.end_date ? fmtDate(item.end_date) : '—'}
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button 
                        className="p-1.5 hover:bg-slate-100 rounded text-slate-600 hover:text-hpa-700" 
                        title="Alterar / Corregir datos"
                        onClick={() => handleEdit(item)}
                      >
                        <Edit size={14} />
                      </button>
                      <button 
                        className="p-1.5 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600" 
                        title="Cancelar publicación"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Alterar Publicación / Pauta">
        <div className="space-y-4">
          <Field label="Anunciante">
            <input className="input" value={form.advertiser_name} onChange={e => setForm({...form, advertiser_name: e.target.value})} />
          </Field>
          
          <div className="grid grid-cols-2 gap-4">
            <Field label="Espacio / Banner">
              <select className="input" value={form.space_name} onChange={e => setForm({...form, space_name: e.target.value})}>
                <option value="Banner Dashboard Principal">Banner Dashboard Principal</option>
                <option value="Banner Superior - Header">Banner Superior - Header</option>
                <option value="Banner Pie de Página">Banner Pie de Página</option>
                <option value="Banner Lateral">Banner Lateral</option>
              </select>
            </Field>
            <Field label="Período / Plan">
              <select className="input" value={form.period} onChange={e => setForm({...form, period: e.target.value})}>
                <option value="SEMANAL">SEMANAL</option>
                <option value="MENSUAL">MENSUAL</option>
                <option value="ANUAL">ANUAL</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Monto (RD$)">
              <input className="input font-numeric" type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
            </Field>
            <Field label="Estado de Pago">
              <select className="input" value={form.payment_status} onChange={e => setForm({...form, payment_status: e.target.value})}>
                <option value="PENDIENTE">PENDIENTE</option>
                <option value="PAGADO">PAGADO</option>
                <option value="CANCELADO">CANCELADO</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Fecha Inicio">
              <input className="input" type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} />
            </Field>
            <Field label="Fecha Fin">
              <input className="input" type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} />
            </Field>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t">
            <button className="btn btn-ghost" onClick={() => setShowEditModal(false)}>Cancelar</button>
            <button className="btn btn-primary" disabled={saving} onClick={saveChanges}>
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
