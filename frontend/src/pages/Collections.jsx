import { useState, useEffect, useCallback } from 'react'
import { 
  QrCode, 
  Send, 
  CheckCircle, 
  Copy, 
  Wallet 
} from 'lucide-react'
import { supabase, fmtDate } from '@/lib/supabase'
import { StatusBadge, Modal, Field, Spinner, Empty } from '@/components/ui'
import useAuthStore from '@/store/auth'

export default function Collections() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id || 'a0000000-0000-4000-8000-000000000001'

  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedLoan, setSelectedLoan] = useState(null)
  const [showPixModal, setShowPixModal] = useState(false)
  const [pixKey, setPixKey] = useState('')
  const [copied, setCopied] = useState(false)
  const [activeSessions, setActiveSessions] = useState([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: loanData, error: loanErr } = await supabase
        .from('loans')
        .select(`
          id, code, amount, currency, status,
          clients (id, name, phone_primary),
          loan_schedule (id, installment_number, amount, due_date, status)
        `)
        .eq('company_id', companyId)
        .eq('status', 'active')

      if (!loanErr) setLoans(loanData || [])

      const { data: bankData } = await supabase
        .from('bank_accounts')
        .select('pix_key')
        .eq('company_id', companyId)
        .limit(1)
        .maybeSingle()

      setPixKey(bankData?.pix_key || 'fiirmaoshpallc@gmail.com')

      const { data: cashData } = await supabase
        .from('cash_sessions')
        .select('id, currency, status')
        .eq('company_id', companyId)
        .eq('status', 'open')

      setActiveSessions(cashData || [])
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }, [companyId])

  useEffect(() => {
    loadData()
  }, [loadData])

  function handleSendWhatsApp(loan, scheduleItem) {
    const phone = loan.clients?.phone_primary?.replace(/[^0-9]/g, '')
    if (!phone) {
      alert('El cliente no tiene un número de teléfono válido asignado.')
      return
    }

    const clientName = loan.clients?.name || 'Cliente'
    const amountFormatted = `${loan.currency || 'RD$'} ${parseFloat(scheduleItem.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    const dueDateFormatted = fmtDate(scheduleItem.due_date)

    const text = encodeURIComponent(
      `Hola ${clientName}, le escribimos de FIIRMAOSHPA Enterprise.\n\n` +
      `Le recordamos que su cuota #${scheduleItem.installment_number} por valor de ${amountFormatted} vence el ${dueDateFormatted}.\n\n` +
      `Puede realizar su pago vía PIX (Clave: ${pixKey}) o transferencia bancaria.\n\n` +
      `¡Muchas gracias por su puntualidad!`
    )

    window.open(`https://wa.me/${phone}?text=${text}`, '_blank')
  }

  function handleOpenPix(loan, scheduleItem) {
    setSelectedLoan({ loan, scheduleItem })
    setShowPixModal(true)
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Cobranza y Pagos Digitales</h2>
          <p className="text-xs text-slate-500">Gestión de cuotas pendientes, recordatorios y cobros por PIX / Multimoneda</p>
        </div>

        <div className="flex items-center gap-2">
          {['BRL', 'USD', 'DOP'].map(curr => {
            const isOpen = activeSessions.some(s => s.currency === curr)
            return (
              <span 
                key={curr} 
                className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  isOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'
                }`}
              >
                <Wallet size={12} />
                Caja {curr}: {isOpen ? 'Abierta' : 'Cerrada'}
              </span>
            )
          })}
        </div>
      </div>

      <div className="card p-0 overflow-hidden shadow-sm border border-slate-200">
        <div className="table-wrapper">
          <table className="table w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b text-xs font-semibold text-slate-600">
                <th className="p-3">CÓDIGO / CLIENTE</th>
                <th className="p-3">TELÉFONO</th>
                <th className="p-3">CUOTA</th>
                <th className="p-3">MONTO CUOTA</th>
                <th className="p-3">VENCIMIENTO</th>
                <th className="p-3">ESTADO</th>
                <th className="p-3 text-right">ACCIONES RÁPIDAS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <Spinner size={24} className="mx-auto" />
                  </td>
                </tr>
              ) : loans.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <Empty title="No hay cuotas pendientes para cobro" />
                  </td>
                </tr>
              ) : (
                loans.flatMap(loan => 
                  (loan.loan_schedule || [])
                    .filter(s => s.status === 'pending')
                    .map(schedule => (
                      <tr key={schedule.id} className="border-b hover:bg-slate-50/50 text-sm">
                        <td className="p-3">
                          <p className="font-bold text-slate-800">{loan.code}</p>
                          <p className="text-xs text-slate-500">{loan.clients?.name}</p>
                        </td>
                        <td className="p-3 text-slate-600 font-mono text-xs">
                          {loan.clients?.phone_primary || 'Sin teléfono'}
                        </td>
                        <td className="p-3">
                          <span className="badge badge-blue">Cuota #{schedule.installment_number}</span>
                        </td>
                        <td className="p-3 font-semibold text-slate-900">
                          {loan.currency || 'RD$'} {parseFloat(schedule.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-xs text-slate-600">
                          {fmtDate(schedule.due_date)}
                        </td>
                        <td className="p-3">
                          <StatusBadge status={schedule.status} />
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleSendWhatsApp(loan, schedule)}
                              className="inline-flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded font-medium transition-colors"
                              title="Enviar recordatorio por WhatsApp"
                            >
                              <Send size={13} />
                              WhatsApp
                            </button>

                            <button
                              onClick={() => handleOpenPix(loan, schedule)}
                              className="inline-flex items-center gap-1 text-xs bg-cyan-700 hover:bg-cyan-800 text-white px-2.5 py-1.5 rounded font-medium transition-colors"
                              title="Generar código PIX"
                            >
                              <QrCode size={13} />
                              PIX (BRL)
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showPixModal} onClose={() => setShowPixModal(false)} title="Cobro Digital por PIX (Brasil / BRL)">
        {selectedLoan && (
          <div className="space-y-5 py-2">
            <div className="p-4 bg-slate-50 border rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Cliente:</span>
                <span className="font-semibold text-slate-800">{selectedLoan.loan.clients?.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Préstamo:</span>
                <span className="font-mono">{selectedLoan.loan.code}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Monto Cuota:</span>
                <span className="font-bold text-emerald-700 text-base">
                  {selectedLoan.loan.currency || 'RD$'} {parseFloat(selectedLoan.scheduleItem.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="text-center space-y-3 p-4 border-2 border-dashed border-slate-300 rounded-lg bg-white">
              <div className="mx-auto w-36 h-36 bg-slate-900 text-white flex items-center justify-center rounded-lg shadow-inner">
                <QrCode size={96} className="text-emerald-400" />
              </div>
              <p className="text-xs text-slate-500">Escanee el código QR o copie la clave inferior</p>
            </div>

            <Field label="Clave PIX Oficial (Chave PIX)">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={pixKey} 
                  className="input font-mono text-xs bg-slate-100 flex-1"
                />
                <button
                  onClick={() => copyToClipboard(pixKey)}
                  className="btn btn-primary inline-flex items-center gap-1 text-xs"
                >
                  {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </Field>

            <div className="flex justify-end pt-3 border-t">
              <button className="btn btn-ghost" onClick={() => setShowPixModal(false)}>
                Cerrar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
