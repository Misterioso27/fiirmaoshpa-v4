import { useState, useEffect } from 'react'
import { Landmark, Copy, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const PAISES = [
  { value: 'DO', flag: '🇩🇴', label: 'República Dominicana' },
  { value: 'BR', flag: '🇧🇷', label: 'Brasil' },
  { value: 'US', flag: '🇺🇸', label: 'Estados Unidos' },
]

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  function copy() {
    navigator.clipboard?.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-hpa-slate-2 last:border-0">
      <div>
        <p className="text-2xs text-hpa-slate-5">{label}</p>
        <p className="text-sm font-semibold text-hpa-slate-9 font-mono">{value}</p>
      </div>
      <button onClick={copy} className="btn btn-ghost btn-sm btn-icon" title="Copiar">
        {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
      </button>
    </div>
  )
}

// ── Muestra las cuentas bancarias activas de la empresa para que el cliente transfiera ──
export default function BankTransferInfo({ companyId, defaultCountry = 'DO' }) {
  const [country, setCountry] = useState(defaultCountry)
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const { data } = await supabase
          .from('bank_accounts')
          .select('*')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('is_primary', { ascending: false })
        setAccounts(data || [])
      } catch (e) { console.error(e) }
      setLoading(false)
    })()
  }, [companyId])

  const cuentasPais = accounts.filter(a => a.country === country)

  return (
    <div className="border border-hpa-slate-2 rounded-xl overflow-hidden">
      <div className="p-3 bg-hpa-slate-1 flex items-center gap-2">
        <Landmark size={14} className="text-hpa-700" />
        <p className="text-xs font-bold text-hpa-slate-7 uppercase tracking-wide">¿Dónde transferir?</p>
      </div>
      <div className="p-3">
        <div className="grid grid-cols-3 gap-2 mb-3">
          {PAISES.map(p => (
            <button key={p.value} type="button"
              className={`p-2 rounded-lg border-2 text-center transition-all ${country === p.value ? 'border-hpa-700 bg-hpa-700/5' : 'border-hpa-slate-2 hover:border-hpa-slate-3'}`}
              onClick={() => setCountry(p.value)}>
              <p className="text-lg">{p.flag}</p>
              <p className="text-2xs font-semibold text-hpa-slate-8">{p.value}</p>
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-xs text-hpa-slate-5 text-center py-3">Cargando cuentas...</p>
        ) : cuentasPais.length === 0 ? (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 text-center">
            ⚠️ No hay cuentas configuradas para {PAISES.find(p => p.value === country)?.label} todavía. Contacta a soporte para coordinar tu transferencia.
          </div>
        ) : (
          <div className="space-y-3">
            {cuentasPais.map(acc => (
              <div key={acc.id} className="p-3 bg-white border border-hpa-slate-2 rounded-lg">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-bold text-hpa-slate-9">{acc.label}</p>
                  {acc.is_primary && <span className="badge badge-gold text-2xs">Principal</span>}
                </div>
                <CopyField label="Banco" value={acc.bank_name} />
                <CopyField label="Titular" value={acc.holder_name} />
                <CopyField label="Número de cuenta" value={acc.account_number} />
                <CopyField label="Clave PIX" value={acc.pix_key} />
                <CopyField label="Routing (ABA)" value={acc.routing_aba} />
                <CopyField label="SWIFT/BIC" value={acc.swift_bic} />
                <CopyField label="IBAN" value={acc.iban} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}