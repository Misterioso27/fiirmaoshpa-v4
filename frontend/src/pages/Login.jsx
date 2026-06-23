import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Eye, EyeOff, Loader2 } from 'lucide-react'
import useAuthStore from '@/store/auth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const { login, loading } = useAuthStore()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    }
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
          <p className="text-white/50 text-sm mt-1">Financiera e Inversiones Irmaos HPA</p>
          <div className="gold-bar w-24 mx-auto mt-3" />
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-6 shadow-card-lg">
          <h2 className="text-white font-semibold text-base mb-5">Iniciar sesión</h2>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-200 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">Correo electrónico</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus placeholder="usuario@fiirmaoshpa.com"
                className="w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-hpa-gold/50 focus:border-hpa-gold/50 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">Contraseña</label>
              <div className="relative">
                <input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  required placeholder="••••••••"
                  className="w-full px-3 py-2.5 pr-10 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-hpa-gold/50 focus:border-hpa-gold/50 transition-all" />
                <button type="button" onClick={() => setShow(!show)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full btn btn-gold py-2.5 justify-center text-sm font-semibold mt-2">
              {loading ? <Loader2 size={15} className="animate-spin" /> : 'Entrar al sistema'}
            </button>
          </form>
          <div className="mt-4 text-center">
            <a href="/forgot-password" className="text-xs text-white/40 hover:text-white/70 transition-colors">
              ¿Olvidaste tu contraseña?
            </a>
          </div>
        </div>
        <p className="text-center text-white/20 text-2xs mt-6">app.fiirmaoshpa.com · v4 Enterprise · © 2026</p>
      </div>
    </div>
  )
}
