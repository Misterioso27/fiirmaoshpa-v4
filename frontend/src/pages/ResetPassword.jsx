import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // Supabase entrega el access_token en el hash de la URL (#access_token=...&type=recovery)
  // supabase-js lo detecta automáticamente y crea una sesión temporal de recuperación.
  useEffect(() => {
    const hash = window.location.hash
    if (!hash || !hash.includes('access_token')) {
      setInvalid(true)
      setReady(true)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setReady(true)
      else { setInvalid(true); setReady(true) }
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return }
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return }
    setSaving(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) throw new Error(err.message)
      setDone(true)
      setTimeout(() => navigate('/login'), 2500)
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <div className="min-h-screen gradient-hpa flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-hpa-gold/10 blur-3xl" />
      </div>
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-hpa-gold shadow-glow-gold mb-4">
            <Building2 size={28} className="text-hpa-900" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">FIIRMAOSHPA</h1>
          <p className="text-white/50 text-sm mt-1">Restablecer contraseña</p>
          <div className="gold-bar w-24 mx-auto mt-3" />
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-6 shadow-card-lg">
          {!ready ? (
            <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-white/60" /></div>
          ) : invalid ? (
            <div className="text-center py-4">
              <p className="text-white font-semibold text-sm mb-2">Enlace inválido o expirado</p>
              <p className="text-white/50 text-xs mb-4">Solicita un nuevo enlace de recuperación desde la pantalla de inicio de sesión.</p>
              <button type="button" onClick={() => navigate('/login')}
                className="btn btn-gold w-full justify-center text-sm font-semibold">
                Volver a inicio de sesión
              </button>
            </div>
          ) : done ? (
            <div className="text-center py-4">
              <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-3" />
              <p className="text-white font-semibold text-sm mb-1">Contraseña actualizada</p>
              <p className="text-white/50 text-xs">Redirigiendo al inicio de sesión...</p>
            </div>
          ) : (
            <>
              <h2 className="text-white font-semibold text-base mb-5">Elige tu nueva contraseña</h2>
              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-200 text-sm">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1">Nueva contraseña</label>
                  <div className="relative">
                    <input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      required autoFocus placeholder="••••••••"
                      className="w-full px-3 py-2.5 pr-10 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-hpa-gold/50 focus:border-hpa-gold/50 transition-all" />
                    <button type="button" onClick={() => setShow(!show)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                      {show ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1">Confirmar contraseña</label>
                  <input type={show ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
                    required placeholder="••••••••"
                    className="w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-hpa-gold/50 focus:border-hpa-gold/50 transition-all" />
                </div>
                <button type="submit" disabled={saving}
                  className="w-full btn btn-gold py-2.5 justify-center text-sm font-semibold mt-2">
                  {saving ? <Loader2 size={15} className="animate-spin" /> : 'Guardar nueva contraseña'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-white/20 text-2xs mt-6">app.fiirmaoshpa.com · v4 Enterprise · © 2026</p>
      </div>
    </div>
  )
}
