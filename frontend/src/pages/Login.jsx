import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Eye, EyeOff, Loader2, UserPlus, ArrowLeft, CreditCard, TrendingUp } from 'lucide-react'
import useAuthStore from '@/store/auth'
import { supabase } from '@/lib/supabase'

const COMPANY_ID = 'a0000000-0000-4000-8000-000000000001'
const BRANCH_ID  = 'b0000000-0000-4000-8000-000000000001'

export default function Login() {
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'choose'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const { login, loading } = useAuthStore()
  const navigate = useNavigate()

  // registro
  const [regForm, setRegForm] = useState({
    first_name: '', last_name: '', national_id: '', phone_primary: '',
    address: '', city: '', email: '', password: '',
  })
  const [regSaving, setRegSaving] = useState(false)
  const [regError, setRegError] = useState('')

  function rc(k, v) { setRegForm(f => ({ ...f, [k]: v })) }

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

  async function handleRegister(e) {
    e.preventDefault()
    setRegError('')
    const reqs = ['first_name', 'last_name', 'national_id', 'phone_primary', 'address', 'city', 'email', 'password']
    for (const k of reqs) {
      if (!regForm[k]) { setRegError('Todos los campos son obligatorios.'); return }
    }
    if (regForm.password.length < 6) { setRegError('La contraseña debe tener al menos 6 caracteres.'); return }

    setRegSaving(true)
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: regForm.email, password: regForm.password,
      })
      if (authError) throw new Error(authError.message)

      const { count } = await supabase.from('clients')
        .select('*', { count: 'exact', head: true }).eq('company_id', COMPANY_ID)
      const clientCode = `HPA-C-${String((count || 0) + 1).padStart(4, '0')}`

      const { error: clientError } = await supabase.from('clients').insert({
        company_id: COMPANY_ID, branch_id: BRANCH_ID,
        client_code: clientCode, type: 'person', status: 'prospect',
        first_name: regForm.first_name, last_name: regForm.last_name,
        national_id: regForm.national_id, phone_primary: regForm.phone_primary,
        address: regForm.address, city: regForm.city,
        nationality: 'DO', kyc_level: 0, risk_level: 'medium',
        user_id: authData.user?.id || null,
      })
      if (clientError) throw new Error('Cuenta creada, pero hubo un problema registrando tu perfil: ' + clientError.message)

      setMode('choose')
    } catch (err) {
      setRegError(err.message)
    }
    setRegSaving(false)
  }

  function goTo(destino) {
    navigate(destino)
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

        {/* ─── LOGIN ─────────────────────────────────────────── */}
        {mode === 'login' && (
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
            <div className="mt-4 text-center space-y-2">
              <a href="/forgot-password" className="block text-xs text-white/40 hover:text-white/70 transition-colors">
                ¿Olvidaste tu contraseña?
              </a>
              <button type="button" onClick={() => { setMode('register'); setRegError('') }}
                className="inline-flex items-center gap-1 text-xs text-hpa-gold hover:text-hpa-gold/80 font-semibold transition-colors">
                <UserPlus size={13} /> Crear cuenta nueva
              </button>
            </div>
          </div>
        )}

        {/* ─── REGISTRO ──────────────────────────────────────── */}
        {mode === 'register' && (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-6 shadow-card-lg">
            <button type="button" onClick={() => { setMode('login'); setRegError('') }}
              className="flex items-center gap-1 text-xs text-white/50 hover:text-white/80 mb-4">
              <ArrowLeft size={13} /> Volver a iniciar sesión
            </button>
            <h2 className="text-white font-semibold text-base mb-5">Crear cuenta</h2>
            {regError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-200 text-sm">
                {regError}
              </div>
            )}
            <form onSubmit={handleRegister} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1">Nombre</label>
                  <input value={regForm.first_name} onChange={e => rc('first_name', e.target.value)} required
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-hpa-gold/50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1">Apellido</label>
                  <input value={regForm.last_name} onChange={e => rc('last_name', e.target.value)} required
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-hpa-gold/50" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1">Cédula / Documento</label>
                <input value={regForm.national_id} onChange={e => rc('national_id', e.target.value)} required
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-hpa-gold/50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1">Teléfono</label>
                <input value={regForm.phone_primary} onChange={e => rc('phone_primary', e.target.value)} required
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-hpa-gold/50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1">Dirección</label>
                <input value={regForm.address} onChange={e => rc('address', e.target.value)} required
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-hpa-gold/50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1">Ciudad</label>
                <input value={regForm.city} onChange={e => rc('city', e.target.value)} required
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-hpa-gold/50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1">Correo electrónico</label>
                <input type="email" value={regForm.email} onChange={e => rc('email', e.target.value)} required
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-hpa-gold/50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1">Contraseña</label>
                <input type="password" value={regForm.password} onChange={e => rc('password', e.target.value)} required
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-hpa-gold/50" />
              </div>
              <button type="submit" disabled={regSaving}
                className="w-full btn btn-gold py-2.5 justify-center text-sm font-semibold mt-2">
                {regSaving ? <Loader2 size={15} className="animate-spin" /> : 'Crear cuenta'}
              </button>
            </form>
          </div>
        )}

        {/* ─── ELEGIR DESTINO ────────────────────────────────── */}
        {mode === 'choose' && (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-6 shadow-card-lg text-center">
            <h2 className="text-white font-semibold text-base mb-2">¡Cuenta creada!</h2>
            <p className="text-white/60 text-sm mb-6">¿Qué deseas hacer?</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => goTo('/loans')}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 hover:border-hpa-gold/50 transition-all">
                <CreditCard size={22} className="text-hpa-gold" />
                <span className="text-white text-sm font-semibold">Solicitar préstamo</span>
              </button>
              <button type="button" onClick={() => goTo('/investments')}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 hover:border-hpa-gold/50 transition-all">
                <TrendingUp size={22} className="text-hpa-gold" />
                <span className="text-white text-sm font-semibold">Invertir</span>
              </button>
            </div>
            <p className="text-white/40 text-2xs mt-5">
              Inicia sesión con tu correo y contraseña para continuar, y busca tu nombre en el formulario correspondiente.
            </p>
          </div>
        )}

        <p className="text-center text-white/20 text-2xs mt-6">app.fiirmaoshpa.com · v4 Enterprise · © 2026</p>
      </div>
    </div>
  )
}
