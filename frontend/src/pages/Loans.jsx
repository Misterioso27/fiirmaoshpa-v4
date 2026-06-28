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

  // Alternar estado de pago de cuota (lógica reductiva)
  function alternarCuota(index) {
    setAnalisis(prev => ({
      ...prev,
      cuotas: prev.cuotas.map((c, i) => i === index ? { ...c, pagado: !c.pagado } : c)
    }))
  }

  // Totales reductivos en tiempo real
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
      
      // Intentar buscar el producto de manera dinámica si existiera catálogo
      let productoEncontrado = products.find(p => (p.type || '').toLowerCase() === tipoFormulario)
      if (!productoEncontrado) {
        productoEncontrado = products.find(p => 
          (p.type || '').toLowerCase().includes(tipoFormulario) || 
          (p.name || '').toLowerCase().includes(tipoFormulario)
        )
      }

      // ASIGNACIÓN DE FALLBACK AUTOMÁTICA COHERENTE CON TUS REGISTROS DE BASE DE DATOS
      const finalProductId = form.product_id || (
        productoEncontrado ? productoEncontrado.id : (
          products.length > 0 ? products[0].id : (
            // Si la tabla local está vacía, forzar los IDs estructurales nativos mapeados por tipo
            tipoFormulario === 'commercial' ? '24a2fdd3-1a29-4907-9122-6c9e71b57ffb' :
            tipoFormulario === 'business'   ? 'a3d66d25-47ed-4cdc-849e-62f835d664d4' :
            tipoFormulario === 'vehicle'    ? '156beb17-b2d6-41fd-a122-9f10bfd04f9a' :
            '3047c3ee-889d-4964-8cb6-660bf285b85d' // Fallback Personal (Corto Plazo)
          )
        )
      )

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
              : ['active','overdue','defaulted','paid','written_off'].
