
import { useState, useEffect, useCallback } from 'react'
import { Plus, CreditCard, Calculator, Upload, ShieldAlert, CheckCircle2 } from 'lucide-react'
import { db, supabase, fmt, fmtDate } from '@/lib/supabase'
import { StatusBadge, Modal, Field, Pagination, Empty, Spinner, Tabs } from '@/components/ui'
import useAuthStore from '@/store/auth'

// ─── MOTOR DE AMORTIZACIÓN (Lógica exacta del Excel de Margareth) ────
function calcularEstructura({ monto, tasaMensual, meses, frecuencia, ingresoNeto }) {
  if (!monto || !tasaMensual || !meses) return { cuotas: [], error: '', warning: '', montoCuota: 0 }

  const p = parseFloat(monto)
  const rm = parseFloat(tasaMensual) / 100
  const tiempo = parseFloat(meses)

  // Mapeo estricto según Excel: Frecuencia × Tiempo
  let totalCuotas = 0
  let etiqueta = 'Cuota'
  if (frecuencia === 'weekly') {
    totalCuotas = (tiempo === 2.5) ? 10 : 12
    etiqueta = 'Semana'
  } else if (frecuencia === 'biweekly') {
    totalCuotas = (tiempo === 2.5) ? 5 : 6
    etiqueta = 'Quincena'
  } else {
    totalCuotas = 3
    etiqueta = 'Mes'
  }

  // Interés simple directo (Calculadora General del Excel)
  const totalInteres = p * rm
  const totalPagar = p + totalInteres
  const montoCuota = Math.round((totalPagar / totalCuotas) * 100) / 100

  // Regla del 30% con formatos específicos del sistema (, para miles, . para decimales)
  let errorMsg = '', warningMsg = ''
  if (ingresoNeto && parseFloat(ingresoNeto) > 0) {
    const ingreso = parseFloat(ingresoNeto)
    const cuotaMensualEquiv = frecuencia === 'weekly'
      ? montoCuota * 4.333
      : frecuencia === 'biweekly' ? montoCuota * 2 : montoCuota
    const limite30 = ingreso * 0.30
    const exceso = cuotaMensualEquiv - limite30

    if (cuotaMensualEquiv > limite30) {
      if (exceso <= 1000) {
        warningMsg = `⚠️ Requiere Autorización Administrativa: Excede el límite del 30% por RD$ ${exceso.toLocaleString('en-US', { minimumFractionDigits: 2 })}. Se guardará en revisión.`
      } else {
        errorMsg = `❌ Solicitud Bloqueada: Supera la capacidad de pago por RD$ ${exceso.toLocaleString('en-US', { minimumFractionDigits: 2 })} (límite excedido por más de RD$1,000).`
      }
    }
  }

  // Generar tabla de cuotas reductiva
  const listado = []
  let saldo = totalPagar
  for (let i = 1; i <= totalCuotas; i++) {
    saldo = Math.max(0, saldo - montoCuota)
    listado.push({
      num: i,
      label: `${etiqueta} ${i}`,
      monto: montoCuota,
      saldoRestante: Math.round(saldo * 100) / 100,
      pagado: false
    })
  }

  return { cuotas: listado, error: errorMsg, warning: warningMsg, montoCuota }
}

export default function Loans() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id
  const branchId  = user?.branch?.id

  const [tab, setTab]           = useState('applications')
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(1)
  const [pagination, setPagination] = useState({})
  const [status, setStatus]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]         = useState({ type: 'personal', currency: 'DOP', frequency: 'monthly', term_months: 3, rate_monthly: 30 })
  const [saving, setSaving]     = useState(false)
  const [clients, setClients]   = useState([])
  const [products, setProducts] = useState([])
  const [analisis, setAnalisis] = useState({ cuotas: [], error: '', warning: '', montoCuota: 0 })
  const [showSchedule, setShowSchedule] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [idDocUrl, setIdDocUrl] = useState('')

  // Calculadora en tiempo real
  useEffect(() => {
    setAnalisis(calcularEstructura({
      monto: form.amount_requested,
      tasaMensual: form.rate_monthly,
      meses: form.term_months,
      frecuencia: form.frequency || 'monthly',
      ingresoNeto: form.monthly_income
    }))
  }, [form.amount_requested, form.rate_monthly, form.term_months, form.frequency, form.monthly_income])

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      if (tab === 'applications') {
        const data = await db.getLoanApplications({ page, limit: 20, status, companyId })
        setItems(data.applications || [])
        setPagination(data.pagination || {})
      } else {
        const data = await db.getLoans({ page, limit: 20, status, companyId })
        setItems(data.loans || [])
        setPagination(data.pagination || {})
      }
    } catch {}
    setLoading(false)
  }, [tab, page, status, companyId])

  useEffect(() => { load() }, [load])

  async function openNew() {
    setForm({ type: 'personal', currency: 'DOP', frequency: 'monthly', term_months: 3, rate_monthly: 30 })
    setIdDocUrl('')
    setShowSchedule(false)
    setShowModal(true)
    try {
      const { data: cls } = await supabase
        .from('clients')
        .select('id, first_name, last_name, client_code')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .limit(100)
      setClients(cls || [])

      const { data: prods } = await supabase
        .from('loan_products')
        .select('id, name, type')
        .eq('company_id', companyId)
      setProducts(prods || [])
    } catch {}
  }

  function fc(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function alternarCuota(index) {
    setAnalisis(prev => ({
      ...prev,
      cuotas: prev.cuotas.map((c, i) => i === index ? { ...c, pagado: !c.pagado } : c)
    }))
  }

  const cuotasPagadas    = analisis.cuotas.filter(c => c.pagado).length
  const totalCobrado      = analisis.cuotas.filter(c => c.pagado).reduce((a, c) => a + c.monto, 0)
  const balancePendiente = analisis.cuotas.filter(c => !c.pagado).reduce((a, c) => a + c.monto, 0)

  async function uploadIdDoc(file) {
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `loan-docs/${companyId}/${Date.now()}.${ext}`
      const { error: err } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
      if (err) throw err
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
      setIdDocUrl(urlData.publicUrl)
    } catch {
      alert('Error al subir documento. Verifica el almacenamiento.')
    }
    setUploading(false)
  }

  async function save() {
    if (analisis.error) return
    setSaving(true)
    try {
      const requeridos = [
        ['client_id',        'Cliente'],
        ['amount_requested', 'Monto Solicitado'],
        ['term_months',      'Plazo'],
        ['purpose',          'Propósito'],
        ['monthly_income',   'Ingreso Mensual'],
      ]
      for (const [campo, label] of requeridos) {
        if (!form[campo]) throw new Error(`El campo "${label}" es obligatorio`)
      }

      const plazoOriginal = parseFloat(form.term_months)
      const tipoFormulario = (form.type || 'personal').toLowerCase()
      
      // 1. Intentar buscar correspondencia en los productos existentes en la BD
      let productoEncontrado = products.find(p => (p.type || '').toLowerCase() === tipoFormulario)
      if (!productoEncontrado) {
        productoEncontrado = products.find(p => 
          (p.type || '').toLowerCase().includes(tipoFormulario) || 
          (p.name || '').toLowerCase().includes(tipoFormulario)
        )
      }

      let finalProductId = form.product_id || (productoEncontrado ? productoEncontrado.id : products[0]?.id)

      // 2. CREACIÓN AUTÓNOMA (Estrategia Anti-FK Error): Si no hay producto, lo insertamos en caliente
      if (!finalProductId) {
        const nombresMapeados = {
          personal: 'Crédito Personal (Corto Plazo)',
          commercial: 'Crédito Comercial',
          business: 'Préstamo Emprende',
          vehicle: 'Financiamiento de Vehículo',
          mortgage: 'Garantía Inmobiliaria'
        }
        
        const { data: nuevoProd, error: prodErr } = await supabase
          .from('loan_products')
          .insert([{
            company_id: companyId,
            name: nombresMapeados[tipoFormulario] || 'Crédito General',
            type: tipoFormulario,
            status: 'active',
            min_amount: 1000,
            max_amount: 5000000,
            min_rate: 1,
            max_rate: 100
          }])
          .select('id')
          .single()

        if (prodErr) throw new Error(`Error estructural al autogenerar el producto: ${prodErr.message}`)
        finalProductId = nuevoProd.id
      }

      // 3. Insertar la solicitud de préstamo garantizando que el ID del producto es 100% válido
      await db.createLoanApplication({
        client_id:        form.client_id,
        product_id:       finalProductId, 
        type:              form.type || 'personal',
        amount_requested: parseFloat(form.amount_requested),
        currency:          form.currency || 'DOP',
        term_months:      plazoOriginal === 2.5 ? 3 : Math.round(plazoOriginal),
        purpose:          form.purpose,
        monthly_income:   parseFloat(form.monthly_income),
        analyst_notes:    analisis.warning
          ? `[AUTORIZACIÓN REQUERIDA]: ${form.analyst_notes || ''}`
          : form.analyst_notes || null,
        ai_analysis: {
          frequency:         form.frequency,
          rate_monthly:      parseFloat(form.rate_monthly),
          total_periods:      analisis.cuotas.length,
          cuota_individual:  analisis.montoCuota,
          total_interes:      analisis.cuotas.reduce((a, c) => a + c.monto, 0) - parseFloat(form.amount_requested),
          id_doc_url:        idDocUrl || null,
          requiere_autorizacion: !!analisis.warning,
          real_term_months:  plazoOriginal 
        }
      }, companyId, branchId, user.id)

      setShowModal(false)
      load()
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  const TABS = [
    { id: 'applications', label: 'Solicitudes' },
    { id: 'loans',        label: 'Préstamos Activos' },
  ]

  const tipoLabel = {
    'weekly': 'Semanal', 'biweekly': 'Quincenal', 'monthly': 'Mensual'
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Préstamos</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">{pagination.total || 0} registros en cartera</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={15} /> Nueva Solicitud
        </button>
      </div>

      <div className="card p-0">
        <div className="px-5 pt-4">
          <Tabs tabs={TABS} active={tab} onChange={t => { setTab(t); setPage(1) }} />
        </div>
        <div className="p-4 border-b border-hpa-slate-2">
          <select className="select w-48" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
            <option value="">Todos los estados</option>
            {tab === 'applications'
              ? ['draft','submitted','in_review','approved','rejected','cancelled'].map(s => <option key={s} value={s}>{s}</option>)
              : ['active','overdue','defaulted','paid','written_off'].map(s => <option key={s} value={s}>{s}</option>)
            }
          </select>
        </div>

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th><th>Cliente</th><th>Monto</th>
                <th>Plazo</th><th>Propósito</th><th>Estado</th><th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-12 text-center"><Spinner size={20} className="mx-auto" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7}>
                  <Empty icon={CreditCard} title="Sin registros" desc="Registra la primera solicitud de préstamo" />
                </td></tr>
              ) : items.map(item => {
                let plazoVisual = item.term_months;
                const freq = item.ai_analysis?.frequency;
                const periods = item.ai_analysis?.total_periods;
                
                if (item.term_months === 3 && ((freq === 'weekly' && periods === 10) || (freq === 'biweekly' && periods === 5))) {
                  plazoVisual = 2.5;
                }

                return (
                  <tr key={item.id}>
                    <td className="font-mono text-xs font-semibold text-hpa-700">
                      {item.application_code || item.loan_code}
                    </td>
                    <td>
                      <p className="font-medium">{item.clients?.first_name} {item.clients?.last_name}</p>
                      <p className="text-xs text-hpa-slate-5">{item.clients?.phone_primary}</p>
                    </td>
                    <td className="font-numeric">{fmt(item.amount_requested || item.principal, item.currency)}</td>
                    <td>{plazoVisual} meses</td>
                    <td className="max-w-xs truncate text-xs">{item.purpose || '—'}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td className="text-xs text-hpa-slate-5">{fmtDate(item.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={pagination.pages} total={pagination.total} limit={20} onChange={setPage} />
      </div>

      {/* ─── MODAL SOLICITUD ─────────────────────────────────────── */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title="Nueva Solicitud de Préstamo" size="xl"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={save}
              disabled={saving || !!analisis.error}>
              {saving ? <Spinner size={14} /> : 'Registrar Solicitud'}
            </button>
          </>
        }>

        {analisis.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex gap-2 items-start rounded-lg">
            <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" /> {analisis.error}
          </div>
        )}
        {analisis.warning && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold flex gap-2 items-start rounded-lg">
            <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" /> {analisis.warning}
          </div>
        )}

        <div className="space-y-5">
          {/* DATOS DEL SOLICITANTE */}
          <div>
            <p className="form-section-title">Datos del Solicitante</p>
            <div className="form-row">
              <Field label="Cliente" required>
                <select className="select" value={form.client_id||''} onChange={e=>fc('client_id',e.target.value)}>
                  <option value="">Seleccionar cliente...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.first_name} {c.last_name} — {c.client_code}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo de Préstamo" required>
                <select className="select" value={form.type||'personal'} onChange={e=>fc('type',e.target.value)}>
                  <option value="personal">Personal (Corto Plazo)</option>
                  <option value="commercial">Comercial (Corto Plazo)</option>
                  <option value="business">Préstamo Emprende</option>
                  <option value="vehicle">Vehículo</option>
                  <option value="mortgage">Terreno / Propiedad</option>
                </select>
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Documento de Identificación (Cédula / Pasaporte)" required>
                <div className="flex gap-3 items-center">
                  <label className="btn btn-ghost btn-sm border border-dashed border-hpa-slate-3 cursor-pointer">
                    <Upload size={13} className="inline mr-1" />
                    {uploading ? 'Subiendo...' : idDocUrl ? 'Cambiar documento' : 'Subir Cédula / Pasaporte'}
                    <input type="file" className="hidden" accept="image/*,.pdf"
                      onChange={e => uploadIdDoc(e.target.files[0])} disabled={uploading} />
                  </label>
                  {idDocUrl && (
                    <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                      <CheckCircle2 size={12} /> Documento cargado ✓
                    </span>
                  )}
                </div>
              </Field>
            </div>
          </div>

          {/* CONDICIONES */}
          <div>
            <p className="form-section-title">Condiciones del Préstamo</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Monto Solicitado (RD$)" required>
                <input className="input" type="number" placeholder="0.00"
                  value={form.amount_requested||''} onChange={e=>fc('amount_requested',e.target.value)} />
              </Field>
              <Field label="Tasa Mensual (%)" required>
                <input className="input" type="number" step="0.1" placeholder="3"
                  value={form.rate_monthly||''} onChange={e=>fc('rate_monthly',e.target.value)} />
              </Field>
              <Field label="Frecuencia de Pago" required>
                <select className="select" value={form.frequency||'monthly'} onChange={e=>fc('frequency',e.target.value)}>
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quincenal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Plazo" required>
                <select className="select" value={form.term_months||3} onChange={e=>fc('term_months',parseFloat(e.target.value))}>
                  <option value={2.5}>2.5 Meses {form.frequency === 'weekly' ? '(10 cuotas)' : form.frequency === 'biweekly' ? '(5 cuotas)' : ''}</option>
                  <option value={3}>3 Meses {form.frequency === 'weekly' ? '(12 cuotas)' : form.frequency === 'biweekly' ? '(6 cuotas)' : '(3 cuotas)'}</option>
                </select>
              </Field>
              <Field label="Ingreso Mensual Comprobable (RD$)" required>
                <input className="input" type="number" placeholder="0.00"
                  value={form.monthly_income||''} onChange={e=>fc('monthly_income',e.target.value)} />
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Propósito del préstamo" required>
                <input className="input" placeholder="Ej: Capital de trabajo, Compra de mercancía..."
                  value={form.purpose||''} onChange={e=>fc('purpose',e.target.value)} />
              </Field>
            </div>
          </div>

          {/* SIMULADOR REDUCTIVO DE CUOTAS */}
          {analisis.cuotas.length > 0 && (
            <div className="bg-hpa-slate-1 rounded-xl p-4 border border-hpa-slate-3 space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Calculator size={14} className="text-hpa-700" />
                  <p className="text-xs font-bold text-hpa-slate-7">
                    Simulador de Cobros — {tipoLabel[form.frequency]} · {analisis.cuotas.length} cuotas
                  </p>
                </div>
                <button type="button" className="text-xs text-hpa-700 font-semibold underline"
                  onClick={() => setShowSchedule(!showSchedule)}>
                  {showSchedule ? 'Ocultar' : `Ver desglose`}
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center bg-white p-3 rounded-lg border border-hpa-slate-2 text-xs">
                <div>
                  <p className="text-hpa-slate-5">Cuota {tipoLabel[form.frequency]}</p>
                  <p className="font-bold text-hpa-700 font-numeric">RD$ {analisis.montoCuota.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-hpa-slate-5">Cuotas Pendientes</p>
                  <p className="font-bold text-hpa-700">{analisis.cuotas.length - cuotasPagadas} / {analisis.cuotas.length}</p>
                </div>
                <div>
                  <p className="text-hpa-slate-5">Total Cobrado</p>
                  <p className="font-bold text-emerald-600">RD$ {totalCobrado.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-hpa-slate-5">Balance Pendiente</p>
                  <p className="font-bold text-amber-600">RD$ {balancePendiente.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>

              {showSchedule && (
                <div className="max-h-52 overflow-y-auto bg-white rounded-lg border border-hpa-slate-2">
                  <table className="table text-[11px] w-full">
                    <thead>
                      <tr>
                        <th>Período</th>
                        <th>Monto Cuota</th>
                        <th>Balance Restante</th>
                        <th>Estado</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analisis.cuotas.map((c, i) => (
                        <tr key={c.num} className={c.pagado ? 'bg-emerald-50/60' : ''}>
                          <td className="font-medium">{c.label}</td>
                          <td className="font-semibold font-numeric">
                            RD$ {c.monto.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="text-hpa-slate-5 font-numeric">
                            RD$ {c.saldoRestante.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.pagado ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                              {c.pagado ? 'PAGADO' : 'PENDIENTE'}
                            </span>
                          </td>
                          <td>
                            <button type="button" onClick={() => alternarCuota(i)}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${c.pagado ? 'bg-hpa-slate-4' : 'bg-emerald-600'}`}>
                              {c.pagado ? 'Revertir' : 'Cobrar'}
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

          {/* NOTAS */}
          <div>
            <Field label="Notas del Analista">
              <textarea className="input h-16 resize-none"
                placeholder="Observaciones, condiciones especiales, garantías..."
                value={form.analyst_notes||''} onChange={e=>fc('analyst_notes',e.target.value)} />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  )
}
