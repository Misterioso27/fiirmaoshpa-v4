import { useState, useEffect } from 'react'
import { Settings2, Building2, Package, GitBranch, Sliders } from 'lucide-react'
import { db } from '@/lib/supabase'
import { Tabs, Field, Spinner } from '@/components/ui'

export default function Settings() {
  const [tab, setTab]     = useState('company')
  const [config, setConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    api.get('/config').then(d => { setConfig(d.config || {}); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    try { await api.put('/config', config) } catch (err) { alert(err.message) }
    setSaving(false)
  }

  const TABS = [
    { id: 'company',   label: 'Empresa' },
    { id: 'products',  label: 'Productos' },
    { id: 'workflows', label: 'Workflows' },
    { id: 'config',    label: 'Sistema' },
  ]

  if (loading) return <div className="flex justify-center py-16"><Spinner size={24} /></div>

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-hpa-slate-9">Configuración</h2>
        <p className="text-xs text-hpa-slate-5 mt-0.5">Parámetros del sistema y reglas de negocio</p>
      </div>

      <div className="card p-0">
        <div className="px-5 pt-4 border-b border-hpa-slate-2">
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
        </div>
        <div className="p-6">
          {tab === 'company' && (
            <div className="max-w-lg space-y-4">
              <p className="form-section-title">Datos de la Empresa</p>
              <Field label="Razón Social">
                <input className="input" defaultValue="Financiera e Inversiones Irmaos HPA SRL" readOnly />
              </Field>
              <Field label="Dominio">
                <input className="input" defaultValue="fiirmaoshpa.com" readOnly />
              </Field>
              <Field label="Moneda Base">
                <select className="select" defaultValue="DOP">
                  {['DOP','USD','BRL'].map(c=><option key={c}>{c}</option>)}
                </select>
              </Field>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <Spinner size={14} /> : 'Guardar Cambios'}
              </button>
            </div>
          )}
          {tab === 'config' && (
            <div className="max-w-lg space-y-4">
              <p className="form-section-title">Parámetros del Sistema</p>
              {Object.entries(config).slice(0,8).map(([key, val]) => (
                <Field key={key} label={key}>
                  <input className="input font-mono text-xs" defaultValue={val}
                    onChange={e => setConfig(c => ({...c, [key]: e.target.value}))} />
                </Field>
              ))}
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <Spinner size={14} /> : 'Guardar'}
              </button>
            </div>
          )}
          {(tab === 'products' || tab === 'workflows') && (
            <div className="text-center py-12 text-hpa-slate-5 text-sm">
              Módulo disponible próximamente
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
