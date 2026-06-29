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

  const totalInteres = p * rm
  const totalPagar = p + totalInteres
  const montoCuota = Math.round((totalPagar / totalCuotas) * 100) / 100

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

function Loans() {
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
  const [analisis, setAnalisis] = useState({ cuotas: [], error: '', warning: '',
