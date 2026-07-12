import { useState, useEffect, useCallback } from 'react'
import { Settings2, Building2, Package, GitBranch, Sliders, Plus, Edit2, Save, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Tabs, Field, Spinner, Modal, Empty } from '@/components/ui'
import useAuthStore from '@/store/auth'

const COMPANY_ID = 'a0000000-0000-4000-8000-000000000001'

const CONFIG_LABELS = {
  company_name:                 { label: 'Nombre de la Empresa',          type: 'text'   },
  currency_base:                { label: 'Moneda Base',                   type: 'select', options: ['DOP','BRL','USD','EUR','GBP'] },
  loan_grace_days:              { label: 'Días de Gracia (Préstamos)',     type: 'number' },
  loan_late_fee_daily:          { label: 'Penalidad Mora Diaria (%)',      type: 'number' },
  loan_capacity_limit_pct:      { label: 'Límite Capacidad Pago (%)',      type: 'number' },
  loan_capacity_tolerance:      { label: 'Tolerancia Capacidad (RD$)',     type: 'number' },
  investment_rate_standard:     { label: 'Tasa Inversión Estándar (%)',    type: 'number' },
  investment_rate_premium:      { label: 'Tasa Inversión Premium (%)',     type: 'number' },
  investment_rate_corporate:    { label: 'Tasa Inversión Corporativa (%)', type: 'number' },
  investment_threshold_standard:{ label: 'Umbral Tier Estándar (BRL)',     type: 'number' },
  investment_threshold_premium: { label: 'Umbral Tier Premium (BRL)',      type: 'number' },
  app_domain:                   { label: 'Dominio de la App',              type: 'text'   },
  support_email:                { label: 'Email de Soporte',               type: 'text'   },
  support_phone:                { label: 'Teléfono de Soporte',            type: 'text'   },
}

export default function Settings() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id || COMPANY_ID

  const [tab, setTab]           = useState('company')
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  // Config del sistema
  const [config, setConfig]     = useState({})
  const [configDirty, setConfigDirty] = useState({})

  // Productos financieros
  const [products, setProducts] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [showProductModal, setShowProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [productForm, setProductForm] = useState({})
  const [savingProduct, setSavingProduct] = useState(false)

  // Sucursales / Cajas
  const [branches, setBranches] = useState([])
  const [registers, setRegisters] = useState([])

  const TABS = [
    { id: 'company',   label: '🏢 Empresa'   },
    { id: 'products',  label: '📦 Productos'  },
    { id: 'cash',      label: '🏦 Cajas'      },
    { id: 'system',    label: '⚙️ Sistema'    },
  ]

  // ── Cargar configuración ──────────────────────────────────
  const loadConfig = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('system_config')
        .select('key, value, type')
        .eq('company_id', companyId)

      if (!error && data) {
        const parsed = {}
        data.forEach(row => {
          parsed[row.key] = row.type === 'number'  ? parseFloat(row.value)
                          : row.type === 'boolean' ? row.value === 'true'
                          : row.type === 'json'    ? (() => { try { return JSON.parse(row.value) } catch { return row.value } })()
                          : row.value
        })
        setConfig(parsed)
        setConfigDirty({})
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [companyId])

  // ── Cargar productos financieros ──────────────────────────
  const loadProducts = useCallback(async () => {
    if (!companyId) return
    setLoadingProducts(true)
    try {
      const { data } = await supabase
        .from('financial_products')
        .select('*')
        .eq('company_id', companyId)
        .order('category').order('name')
      setProducts(data || [])
    } catch (e) { console.error(e) }
    setLoadingProducts(false)
  }, [companyId])

  // ── Cargar cajas ──────────────────────────────────────────
  const loadCash = useCallback(async () => {
    if (!companyId) return
    try {
      const [branchRes, regRes] = await Promise.all([
        supabase.from('branches').select('*').eq('company_id', companyId),
        supabase.from('cash_registers').select('*, branches(name)').eq('company_id', companyId).order('name'),
      ])
      setBranches(branchRes.data || [])
      setRegisters(regRes.data  || [])
    } catch (e) { console.error(e) }
  }, [companyId])

  useEffect(() => {
    loadConfig()
    loadProducts()
    loadCash()
  }, [loadConfig, loadProducts, loadCash])

  // ── Guardar configuración ─────────────────────────────────
  async function saveConfig() {
    if (!Object.keys(configDirty).length) return
    setSaving(true)
    try {
      for (const [key, value] of Object.entries(configDirty)) {
        await supabase.from('system_config').upsert({
          company_id: companyId,
          key,
          value:      String(value),
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'company_id,key' })
      }

      await supabase.from('audit_log').insert({
        company_id:  companyId,
        actor_id:    user.id,
        actor_type:  'user',
        actor_name:  user.full_name || user.email,
        actor_role:  user.role?.code || 'super_admin',
        action:      'UPDATE_CONFIG',
        module:      'config',
        new_value:   configDirty,
      })

      setConfigDirty({})
      await loadConfig()
      alert('✅ Configuración guardada exitosamente')
    } catch (err) { alert('❌ ' + err.message) }
    setSaving(false)
  }

  function setConfigVal(key, val) {
    setConfig(c => ({ ...c, [key]: val }))
    setConfigDirty(d => ({ ...d, [key]: val }))
  }

  // ── Producto — abrir modal ────────────────────────────────
  function openProductModal(product = null) {
    setEditingProduct(product)
    setProductForm(product ? { ...product } : {
      name:               '',
      code:               '',
      category:           'loan',
      description:        '',
      rate_monthly:       10,
      rate_annual:        120,
      term_min_months:    1,
      term_max_months:    3,
      amount_min:         1000,
      amount_max:         '',
      currencies:         ['DOP'],
      origination_fee:    0,
      late_fee_daily:     0,
      grace_days:         3,
      requires_guarantee: false,
      requires_kyc_level: 1,
      is_active:          true,
    })
    setShowProductModal(true)
  }

  // ── Producto — guardar ────────────────────────────────────
  async function saveProduct() {
    if (!productForm.name || !productForm.code || !productForm.category) {
      return alert('Nombre, código y categoría son obligatorios')
    }
    setSavingProduct(true)
    try {
      const payload = {
        company_id:         companyId,
        name:               productForm.name,
        code:               productForm.code,
        category:           productForm.category,
        description:        productForm.description || null,
        rate_monthly:       parseFloat(productForm.rate_monthly || 0),
        rate_annual:        parseFloat(productForm.rate_monthly || 0) * 12,
        term_min_months:    parseInt(productForm.term_min_months || 1),
        term_max_months:    parseInt(productForm.term_max_months || 3),
        amount_min:         parseFloat(productForm.amount_min || 0),
        amount_max:         productForm.amount_max ? parseFloat(productForm.amount_max) : null,
        currencies:         Array.isArray(productForm.currencies)
                              ? productForm.currencies
                              : [productForm.currencies],
        origination_fee:    parseFloat(productForm.origination_fee || 0),
        late_fee_daily:     parseFloat(productForm.late_fee_daily  || 0),
        grace_days:         parseInt(productForm.grace_days || 3),
        requires_guarantee: productForm.requires_guarantee || false,
        requires_kyc_level: parseInt(productForm.requires_kyc_level || 1),
        is_active:          productForm.is_active !== false,
      }

      let error
      if (editingProduct?.id) {
        const res = await supabase.from('financial_products')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingProduct.id)
        error = res.error
      } else {
        payload.created_by = user.id
        const res = await supabase.from('financial_products').insert(payload)
        error = res.error
      }

      if (error) throw new Error(error.message)

      await supabase.from('audit_log').insert({
        company_id:  companyId,
        actor_id:    user.id,
        actor_type:  'user',
        actor_name:  user.full_name || user.email,
        action:      editingProduct ? 'UPDATE_PRODUCT' : 'CREATE_PRODUCT',
        module:      'config',
        record_type: 'financial_product',
        new_value:   { name: productForm.name, code: productForm.code },
      })

      setShowProductModal(false)
      await loadProducts()
      alert(`✅ Producto ${editingProduct ? 'actualizado' : 'creado'} exitosamente`)
    } catch (err) { alert('❌ ' + err.message) }
    setSavingProduct(false)
  }

  // ── Toggle producto activo/inactivo ───────────────────────
  async function toggleProduct(product) {
    try {
      await supabase.from('financial_products')
        .update({ is_active: !product.is_active, updated_at: new Date().toISOString() })
        .eq('id', product.id)
      await loadProducts()
    } catch (err) { alert('❌ ' + err.message) }
  }

  function pfv(k, v) { setProductForm(f => ({ ...f, [k]: v })) }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={24} />
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-hpa-slate-9">Configuración</h2>
        <p className="text-xs text-hpa-slate-5 mt-0.5">Parámetros del sistema y reglas de negocio</p>
      </div>

      <div className="card p-0">
        <div className="px-5 pt-4 border-b border-hpa-slate-2">
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
        </div>

        <div className="p-6">

          {/* ── TAB EMPRESA ──────────────────────────────────── */}
          {tab === 'company' && (
            <div className="max-w-lg space-y-4">
              <p className="form-section-title">Datos de la Empresa</p>

              <Field label="Razón Social">
                <input className="input" value="Financiera e Inversiones Irmaos HPA SRL" readOnly />
              </Field>
              <Field label="Dominio">
                <input className="input" value="app.fiirmaoshpa.com" readOnly />
              </Field>
              <Field label="Moneda Base">
                <select className="select"
                  value={config.currency_base || 'DOP'}
                  onChange={e => setConfigVal('currency_base', e.target.value)}>
                  {['DOP','USD','BRL','EUR','GBP'].map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Email de Soporte">
                <input className="input" type="email"
                  value={config.support_email || ''}
                  onChange={e => setConfigVal('support_email', e.target.value)}
                  placeholder="soporte@fiirmaoshpa.com" />
              </Field>
              <Field label="Teléfono de Soporte">
                <input className="input"
                  value={config.support_phone || ''}
                  onChange={e => setConfigVal('support_phone', e.target.value)}
                  placeholder="+1 809 000 0000" />
              </Field>

              {Object.keys(configDirty).length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-semibold">
                  ⚠️ Tienes cambios sin guardar — {Object.keys(configDirty).length} campo{Object.keys(configDirty).length !== 1 ? 's' : ''} modificado{Object.keys(configDirty).length !== 1 ? 's' : ''}
                </div>
              )}

              <button className="btn btn-primary" onClick={saveConfig} disabled={saving || !Object.keys(configDirty).length}>
                {saving ? <Spinner size={14} /> : <><Save size={14} /> Guardar Cambios</>}
              </button>
            </div>
          )}

          {/* ── TAB PRODUCTOS ─────────────────────────────────── */}
          {tab === 'products' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="form-section-title">Productos Financieros</p>
                <button className="btn btn-primary btn-sm" onClick={() => openProductModal()}>
                  <Plus size={13} /> Nuevo Producto
                </button>
              </div>

              {loadingProducts ? (
                <div className="py-8 flex justify-center"><Spinner size={20} /></div>
              ) : products.length === 0 ? (
                <Empty icon={Package} title="Sin productos" desc="Crea el primer producto financiero" />
              ) : (
                <div className="table-wrapper">
                  <table className="table text-xs">
                    <thead>
                      <tr>
                        <th>Código</th><th>Nombre</th><th>Categoría</th>
                        <th>Tasa</th><th>Plazo</th><th>Monedas</th>
                        <th>Estado</th><th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map(p => (
                        <tr key={p.id}>
                          <td className="font-mono font-semibold text-hpa-700">{p.code}</td>
                          <td>
                            <p className="font-semibold">{p.name}</p>
                            <p className="text-hpa-slate-5 text-[10px]">{p.description || '—'}</p>
                          </td>
                          <td>
                            <span className={`badge ${p.category === 'loan' ? 'badge-blue' : p.category === 'investment' ? 'badge-gold' : 'badge-gray'}`}>
                              {p.category}
                            </span>
                          </td>
                          <td className="font-numeric font-semibold text-hpa-700">{p.rate_monthly}%</td>
                          <td className="text-hpa-slate-5">{p.term_min_months}–{p.term_max_months}m</td>
                          <td>
                            <div className="flex gap-1 flex-wrap">
{(p.currencies || ['DOP']).map(c => (
                                <span key={c} className="badge badge-gray text-[9px]">{c}</span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <button
                              className={`badge cursor-pointer ${p.is_active ? 'badge-green' : 'badge-gray'}`}
                              onClick={() => toggleProduct(p)}
                            >
                              {p.is_active ? 'ACTIVO' : 'INACTIVO'}
                            </button>
                          </td>
                          <td>
                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openProductModal(p)}>
                              <Edit2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── TAB CAJAS ─────────────────────────────────────── */}
          {tab === 'cash' && (
            <div className="space-y-4">
              <p className="form-section-title">Cajas Registradas</p>
              {registers.length === 0 ? (
                <Empty icon={Building2} title="Sin cajas" desc="No hay cajas registradas para esta empresa" />
              ) : (
                <div className="table-wrapper">
                  <table className="table text-xs">
                    <thead>
                      <tr><th>Nombre</th><th>Código</th><th>Sucursal</th><th>Moneda</th><th>Saldo Actual</th><th>Estado</th></tr>
                    </thead>
                    <tbody>
                      {registers.map(r => (
                        <tr key={r.id}>
                          <td className="font-semibold">{r.name}</td>
                          <td className="font-mono text-hpa-700">{r.code}</td>
                          <td className="text-hpa-slate-5">{r.branches?.name || '—'}</td>
                          <td><span className="badge badge-blue">{r.currency}</span></td>
                          <td className="font-numeric font-semibold">
                            {parseFloat(r.current_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td>
                            <span className={`badge ${r.status === 'open' ? 'badge-green' : 'badge-gray'}`}>
                              {r.status === 'open' ? 'ABIERTA' : 'CERRADA'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="form-section-title mt-6">Sucursales</p>
              {branches.length === 0 ? (
                <Empty icon={Building2} title="Sin sucursales" desc="No hay sucursales registradas" />
              ) : (
                <div className="table-wrapper">
                  <table className="table text-xs">
                    <thead>
                      <tr><th>Nombre</th><th>Código</th><th>Ciudad</th><th>Estado</th></tr>
                    </thead>
                    <tbody>
                      {branches.map(b => (
                        <tr key={b.id}>
                          <td className="font-semibold">{b.name}</td>
                          <td className="font-mono text-hpa-700">{b.code}</td>
                          <td className="text-hpa-slate-5">{b.city || '—'}</td>
                          <td>
                            <span className={`badge ${b.is_active ? 'badge-green' : 'badge-gray'}`}>
                              {b.is_active ? 'ACTIVA' : 'INACTIVA'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── TAB SISTEMA ───────────────────────────────────── */}
          {tab === 'system' && (
            <div className="max-w-lg space-y-4">
              <p className="form-section-title">Parámetros del Sistema</p>

              {Object.entries(CONFIG_LABELS).map(([key, meta]) => (
                <Field key={key} label={meta.label}>
                  {meta.type === 'select' ? (
                    <select className="select"
                      value={config[key] || ''}
                      onChange={e => setConfigVal(key, e.target.value)}>
                      {meta.options.map(o => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      className="input"
                      type={meta.type === 'number' ? 'number' : 'text'}
                      step={meta.type === 'number' ? '0.01' : undefined}
                      value={config[key] ?? ''}
                      onChange={e => setConfigVal(key, meta.type === 'number' ? parseFloat(e.target.value) : e.target.value)}
                      placeholder={`Valor de ${meta.label}`}
                    />
                  )}
                </Field>
              ))}

              {Object.keys(configDirty).length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-semibold">
                  ⚠️ {Object.keys(configDirty).length} parámetro{Object.keys(configDirty).length !== 1 ? 's' : ''} sin guardar
                </div>
              )}

              <button className="btn btn-primary" onClick={saveConfig} disabled={saving || !Object.keys(configDirty).length}>
                {saving ? <Spinner size={14} /> : <><Save size={14} /> Guardar Parámetros</>}
              </button>
            </div>
          )}

        </div>
      </div>

      {/* ── MODAL PRODUCTO FINANCIERO ─────────────────────────── */}
      <Modal
        open={showProductModal}
        onClose={() => setShowProductModal(false)}
        title={editingProduct ? 'Editar Producto' : 'Nuevo Producto Financiero'}
        size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowProductModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveProduct} disabled={savingProduct}>
              {savingProduct ? <Spinner size={14} /> : <><Save size={14} /> {editingProduct ? 'Actualizar' : 'Crear'} Producto</>}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre" required>
              <input className="input" placeholder="Ej: Préstamo Personal HPA"
                value={productForm.name || ''} onChange={e => pfv('name', e.target.value)} />
            </Field>
            <Field label="Código" required>
              <input className="input" placeholder="Ej: LOAN-PERSONAL"
                value={productForm.code || ''} onChange={e => pfv('code', e.target.value.toUpperCase())} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría" required>
              <select className="select" value={productForm.category || 'loan'} onChange={e => pfv('category', e.target.value)}>
                <option value="loan">💳 Préstamo</option>
                <option value="investment">📈 Inversión</option>
                <option value="savings">🏦 Ahorro</option>
              </select>
            </Field>
            <Field label="Tasa Mensual (%)" required>
              <input className="input" type="number" step="0.1"
                value={productForm.rate_monthly || ''} onChange={e => pfv('rate_monthly', e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Plazo Mínimo (meses)">
              <input className="input" type="number"
                value={productForm.term_min_months || ''} onChange={e => pfv('term_min_months', e.target.value)} />
            </Field>
            <Field label="Plazo Máximo (meses)">
              <input className="input" type="number"
                value={productForm.term_max_months || ''} onChange={e => pfv('term_max_months', e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto Mínimo">
              <input className="input" type="number"
                value={productForm.amount_min || ''} onChange={e => pfv('amount_min', e.target.value)} />
            </Field>
            <Field label="Monto Máximo (vacío = sin límite)">
              <input className="input" type="number"
                value={productForm.amount_max || ''} onChange={e => pfv('amount_max', e.target.value)} />
            </Field>
          </div>

          <Field label="Monedas permitidas">
            <div className="flex gap-2 flex-wrap">
              {['DOP','BRL','USD','EUR','GBP'].map(c => {
                const selected = (productForm.currencies || []).includes(c)
                return (
                  <button key={c} type="button"
                    className={`px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${selected ? 'border-hpa-700 bg-hpa-700/10 text-hpa-700' : 'border-hpa-slate-2 text-hpa-slate-5'}`}
                    onClick={() => {
                      const curr = productForm.currencies || []
                      pfv('currencies', selected ? curr.filter(x => x !== c) : [...curr, c])
                    }}>
                    {c}
                  </button>
                )
              })}
            </div>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Comisión Apertura (%)">
              <input className="input" type="number" step="0.1"
                value={productForm.origination_fee || 0} onChange={e => pfv('origination_fee', e.target.value)} />
            </Field>
            <Field label="Mora Diaria (%)">
              <input className="input" type="number" step="0.01"
                value={productForm.late_fee_daily || 0} onChange={e => pfv('late_fee_daily', e.target.value)} />
            </Field>
            <Field label="Días de Gracia">
              <input className="input" type="number"
                value={productForm.grace_days || 3} onChange={e => pfv('grace_days', e.target.value)} />
            </Field>
          </div>

          <Field label="Descripción">
            <textarea className="input h-16 resize-none"
              placeholder="Descripción del producto..."
              value={productForm.description || ''} onChange={e => pfv('description', e.target.value)} />
          </Field>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="rounded"
                checked={productForm.requires_guarantee || false}
                onChange={e => pfv('requires_guarantee', e.target.checked)} />
              <span className="text-sm text-hpa-slate-7">Requiere garantía</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="rounded"
                checked={productForm.is_active !== false}
                onChange={e => pfv('is_active', e.target.checked)} />
              <span className="text-sm text-hpa-slate-7">Producto activo</span>
            </label>
          </div>
        </div>
      </Modal>
    </div>
  )
}
