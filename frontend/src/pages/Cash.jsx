import { useState, useEffect, useCallback } from 'react'
import { DollarSign, Lock, Unlock, ClipboardList, RefreshCw } from 'lucide-react'
import { supabase, fmt, fmtDate } from '@/lib/supabase'
import { Field, Spinner, Empty } from '@/components/ui'
import useAuthStore from '@/store/auth'

function MovementsTable({ movements }) {
  if (movements.length === 0) {
    return (
      <div className="py-12">
        <Empty icon={ClipboardList} title="Sin movimientos" desc="No hay transacciones todavía." />
      </div>
    )
  }

  return (
    <div className="table-wrapper max-h-[450px] overflow-y-auto">
      <table className="table text-xs">
        <thead>
          <tr>
            <th>Hora</th>
            <th>Tipo</th>
            <th>Concepto</th>
            <th className="text-right">Monto</th>
          </tr>
        </thead>
        <tbody>
          {movements.map(mov => (
            <tr key={mov.id}>
              <td className="text-hpa-slate-4">{fmtDate(mov.created_at)}</td>
              <td>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${mov.type === 'income' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                  {mov.type === 'income' ? 'ENTRADA' : 'SALIDA'}
                </span>
              </td>
              <td className="font-medium text-hpa-slate-8">{mov.description}</td>
              <td className={`text-right font-bold font-numeric ${mov.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                {mov.type === 'income' ? '+' : '-'}{fmt(mov.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Cash() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id
  const branchId  = user?.branch?.id

  const [loading, setLoading] = useState(false)
  const [registers, setRegisters] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [movements, setMovements] = useState([])
  const [loadingMovements, setLoadingMovements] = useState(false)
  const [openingBalance, setOpeningBalance] = useState('')
  const [selectedRegister, setSelectedRegister] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadRegisters = useCallback(async () => {
    try {
      let query = supabase.from('cash_registers').select('*')
      if (branchId) query = query.eq('branch_id', branchId)
      const { data, error } = await query
      if (error) throw error
      setRegisters(data || [])
      if (data
