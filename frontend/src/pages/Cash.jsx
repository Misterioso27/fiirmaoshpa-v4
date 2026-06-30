import { useState, useEffect, useCallback } from 'react'
import { DollarSign, ArrowUpRight, ArrowDownLeft, Lock, Unlock, ClipboardList, RefreshCw } from 'lucide-react'
import { supabase, fmt, fmtDate } from '@/lib/supabase'
import { Field, Spinner, Empty } from '@/components/ui'
import useAuthStore from '@/store/auth'

function CashManagement() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id
  const branchId  = user?.branch?.id

  // Estados de carga y catálogos
  const [loading, setLoading] = useState(false)
  const [registers, setRegisters] = useState([])
  
  // Estados de la sesión actual
  const [activeSession, setActiveSession] = useState(null)
  const [movements, setMovements] = useState([])
  const [loadingMovements, setLoadingMovements] = useState(false)

  // Formularios
  const [openingBalance, setOpeningBalance] = useState('')
  const [selectedRegister, setSelectedRegister] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 1. Cargar las cajas físicas disponibles para la sucursal
  const loadRegisters = useCallback(async () => {
    if (!branchId) return
    try {
      const { data, error } = await supabase
        .from('cash_registers')
        .select('*')
        .eq('branch_id', branchId)
        .eq('status', 'active')
      if (error) throw error
      setRegisters(data || [])
      if (data?.length > 0) setSelectedRegister(data[0].id)
    } catch (err) {
      console.error('Error cargando cajas:', err.message)
    }
  }, [branchId])

  // 2. Verificar si hay una sesión abierta para el usuario actual
  const checkActiveSession = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('cash_sessions')
        .select(`
          id, status, opening_balance, current_balance, opened_at, cash_register_id,
          cash_registers (name, code, currency)
        `)
        .eq('user_id', user.id)
        .eq('status', 'open')
        .maybeSingle()

      if (error) throw error
      setActiveSession(data)
      
      if (data) {
        loadMovements(data.id)
      }
    } catch (err) {
      console.error('Error verificando sesión de caja:', err.message)
    }
    setLoading(false)
  }, [user?.id])

  // 3. Cargar movimientos de la sesión activa
  const loadMovements = async (sessionId) => {
    setLoadingMovements(true)
    try {
      const { data, error } = await supabase
        .from('cash_movements')
        .select('*')
        .eq('cash_session_id', sessionId)
        .order('created_at', { ascending: false })
      if (error) throw error
      setMovements(data || [])
    } catch (err) {
      console.error('Error cargando movimientos:', err.message)
    }
    setLoadingMovements(false)
  }

  useEffect(() => {
    if (branchId && user?.id) {
      loadRegisters()
      checkActiveSession()
    }
  }, [branchId, user?.id, loadRegisters, checkActiveSession])

  // 4. Ejecutar Apertura de Caja
  const handleOpenSession = async (e) => {
    e.preventDefault()
    const monto = parseFloat(openingBalance)
    if (isNaN(monto) || monto < 0) {
      alert('Por favor ingrese un monto de apertura válido.')
      return
    }
    if (!selectedRegister) {
      alert('Debe seleccionar una caja física para operar.')
      return
    }

    setSubmitting(true)
    try {
      // Insertar nueva sesión de caja
      const { data, error } = await supabase
        .from('cash_sessions')
        .insert([{
          company_id: companyId,
          branch_id: branchId,
          cash_register_id: selectedRegister,
          user_id: user.id,
          opening_balance: monto,
          current_balance: monto,
          status: 'open',
          opened_at: new Date().toISOString()
        }])
        .select()
        .single()

      if (error) throw error

      // Actualizar el estado de la caja física a "ocupada/abierta"
      await supabase
        .from('cash_registers')
        .update({ status: 'open', current_balance: monto })
        .eq('id', selectedRegister)

      alert('¡Caja abierta con éxito! Ya puede procesar cobros y desembolsos.')
      setOpeningBalance('')
      checkActiveSession()
    } catch (err) {
      alert('Error al abrir caja: ' + err.message)
    }
    setSubmitting(false)
  }

  // 5. Ejecutar Cierre de Caja (Cuadre de Efectivo)
  const handleCloseSession = async () => {
    if (!window.confirm(`¿Está seguro que desea cerrar la caja con un balance actual de ${fmt(activeSession.current_balance, activeSession.cash_registers?.currency)}?`)) {
      return
    }

    setSubmitting(true)
    try {
      // Actualizar la sesión de caja a cerrada
      const { error: sessionErr } = await supabase
        .from('cash_sessions')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          closing_balance: activeSession.current_balance
        })
        .eq('id', activeSession.id)

      if (sessionErr) throw sessionErr

      // Devolver la caja física a estado "activo" (disponible para otra sesión)
      await supabase
        .from('cash_registers')
        .update({ status: 'active' })
        .eq('id', activeSession.cash_register_id)

      alert('Caja cerrada correctamente y bloqueada para nuevas transacciones.')
      setActiveSession(null)
      setMovements([])
      loadRegisters()
    } catch (err) {
      alert('Error al cerrar la caja: ' + err.message)
    }
    setSubmitting(false)
  }

  if (loading) {
    return <div className="p-12 text-center"><Spinner size={24} className="mx-auto" /></div>
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-hpa-slate-9">Control de Caja y Flujo</h2>
        <p className="text-xs text-hpa-slate-5 mt-0.5">Gestión diaria de disponibilidad de efectivo, aperturas y arqueos de caja</p>
      </div>

      {!activeSession ? (
        /* VISTA DE CAJA CERRADA: FORMULARIO DE APERTURA */
        <div className="max-w-md mx-auto card p-6 mt-6 border border-hpa-slate-2 shadow-sm">
          <div className="text-center space-y-2 mb-6">
            <div className="p-3 bg-amber-50 text-amber-700 rounded-full inline-block border
