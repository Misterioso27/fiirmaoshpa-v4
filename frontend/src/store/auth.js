import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

// ── Aplicar preferencias al DOM ───────────────────────────
function applyPreferences(prefs = {}) {
  const fontSize = prefs.font_size || 'normal'
  const lang     = prefs.language  || 'es'
  document.documentElement.setAttribute('data-font-size', fontSize)
  document.documentElement.setAttribute('lang', lang)
}

// ── Traducciones básicas del sistema ──────────────────────
export const i18n = {
  es: {
    dashboard:    'Dashboard',
    clients:      'Clientes',
    investments:  'Inversiones',
    loans:        'Préstamos',
    collections:  'Cobranza',
    cash:         'Caja',
    employees:    'Empleados',
    reports:      'Reportes',
    audit:        'Auditoría',
    settings:     'Configuración',
    logout:       'Cerrar sesión',
    save:         'Guardar',
    cancel:       'Cancelar',
    loading:      'Cargando...',
    welcome:      'Bienvenido',
    noData:       'Sin registros',
    search:       'Buscar...',
  },
  br: {
    dashboard:    'Painel',
    clients:      'Clientes',
    investments:  'Investimentos',
    loans:        'Empréstimos',
    collections:  'Cobrança',
    cash:         'Caixa',
    employees:    'Funcionários',
    reports:      'Relatórios',
    audit:        'Auditoria',
    settings:     'Configurações',
    logout:       'Sair',
    save:         'Salvar',
    cancel:       'Cancelar',
    loading:      'Carregando...',
    welcome:      'Bem-vindo',
    noData:       'Sem registros',
    search:       'Buscar...',
  },
  en: {
    dashboard:    'Dashboard',
    clients:      'Clients',
    investments:  'Investments',
    loans:        'Loans',
    collections:  'Collections',
    cash:         'Cash',
    employees:    'Employees',
    reports:      'Reports',
    audit:        'Audit',
    settings:     'Settings',
    logout:       'Sign out',
    save:         'Save',
    cancel:       'Cancel',
    loading:      'Loading...',
    welcome:      'Welcome',
    noData:       'No records',
    search:       'Search...',
  },
}

const DEFAULT_PREFS = {
  font_size: 'normal',  // small | normal | large
  language:  'es',      // es | br | en
}

const useAuthStore = create((set, get) => ({
  user:        JSON.parse(localStorage.getItem('hpa_user')  || 'null'),
  token:       localStorage.getItem('hpa_token') || null,
  preferences: JSON.parse(localStorage.getItem('hpa_prefs') || JSON.stringify(DEFAULT_PREFS)),
  loading:     false,
  error:       null,

  // ── LOGIN ─────────────────────────────────────────────
  login: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) throw new Error(authError.message)

      const uid = authData.user.id

      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .limit(1)

      if (profileError) throw new Error('Error al leer perfil: ' + profileError.message)
      if (!profiles || profiles.length === 0) throw new Error('Perfil no encontrado')

      const profile = profiles[0]
      if (profile.status !== 'active') throw new Error('Usuario inactivo o suspendido')

      let role = null
      if (profile.role_id) {
        const { data: roles } = await supabase.from('roles').select('id, name, code').eq('id', profile.role_id).limit(1)
        if (roles?.length) role = roles[0]
      }

      let branch = null
      if (profile.branch_id) {
        const { data: branches } = await supabase.from('branches').select('id, name, code').eq('id', profile.branch_id).limit(1)
        if (branches?.length) branch = branches[0]
      }

      let company = null
      if (profile.company_id) {
        const { data: companies } = await supabase.from('companies').select('id, name, legal_name, logo_url, currency_base').eq('id', profile.company_id).limit(1)
        if (companies?.length) company = companies[0]
      }

      let permissions = []
      if (profile.role_id) {
        const { data: perms } = await supabase.from('permissions').select('module, can_view, can_create, can_edit, can_delete, can_approve, can_export, can_sign, can_authorize').eq('role_id', profile.role_id)
        permissions = perms || []
      }

      // Cargar preferencias del usuario desde Supabase
      let userPrefs = { ...DEFAULT_PREFS }
      const { data: prefsData } = await supabase
        .from('system_config')
        .select('key, value')
        .eq('company_id', profile.company_id)
        .in('key', [`user_prefs_${uid}_font_size`, `user_prefs_${uid}_language`])

      if (prefsData?.length) {
        prefsData.forEach(p => {
          if (p.key === `user_prefs_${uid}_font_size`) userPrefs.font_size = p.value
          if (p.key === `user_prefs_${uid}_language`)  userPrefs.language  = p.value
        })
      }

      const userData = {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        avatar_url: profile.avatar_url,
        role,
        branch,
        company,
        permissions,
      }

      localStorage.setItem('hpa_token', authData.session.access_token)
      localStorage.setItem('hpa_user',  JSON.stringify(userData))
      localStorage.setItem('hpa_prefs', JSON.stringify(userPrefs))

      applyPreferences(userPrefs)

      set({ user: userData, token: authData.session.access_token, preferences: userPrefs, loading: false })
      return userData

    } catch (err) {
      set({ error: err.message, loading: false })
      throw err
    }
  },

  // ── LOGOUT ────────────────────────────────────────────
  logout: async () => {
    try { await supabase.auth.signOut() } catch {}
    localStorage.removeItem('hpa_token')
    localStorage.removeItem('hpa_user')
    localStorage.removeItem('hpa_prefs')
    set({ user: null, token: null, preferences: DEFAULT_PREFS })
    applyPreferences(DEFAULT_PREFS)
  },

  // ── RESTORE SESSION ───────────────────────────────────
  restoreSession: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        localStorage.removeItem('hpa_token')
        localStorage.removeItem('hpa_user')
        set({ user: null, token: null })
        return
      }
      localStorage.setItem('hpa_token', session.access_token)
      const stored      = localStorage.getItem('hpa_user')
      const storedPrefs = localStorage.getItem('hpa_prefs')

      if (stored) {
        const userData = JSON.parse(stored)
        if (!userData.company) userData.company = { id: 'a0000000-0000-4000-8000-000000000001', name: 'Financiera HPA', currency_base: 'DOP' }
        if (!userData.branch)  userData.branch  = { id: 'b0000000-0000-4000-8000-000000000001', name: 'Sede Central' }

        const prefs = storedPrefs ? JSON.parse(storedPrefs) : DEFAULT_PREFS
        applyPreferences(prefs)
        set({ user: userData, token: session.access_token, preferences: prefs })
      }
    } catch {}
  },

  // ── ACTUALIZAR PREFERENCIAS ───────────────────────────
  updatePreferences: async (newPrefs) => {
    const { user, preferences } = get()
    const merged = { ...preferences, ...newPrefs }

    localStorage.setItem('hpa_prefs', JSON.stringify(merged))
    applyPreferences(merged)
    set({ preferences: merged })

    // Persistir en Supabase si hay usuario
    if (user?.id && user?.company?.id) {
      const entries = Object.entries(newPrefs).map(([k, v]) => ({
        company_id: user.company.id,
        key:        `user_prefs_${user.id}_${k}`,
        value:      String(v),
        type:       'string',
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }))
      for (const entry of entries) {
        await supabase.from('system_config')
          .upsert(entry, { onConflict: 'company_id,key' })
      }
    }
  },

  // ── HELPERS ───────────────────────────────────────────
  hasPermission: (module, action = 'can_view') => {
    const { user } = get()
    if (!user) return false
    if (user.role?.code === 'super_admin') return true
    const perm = user.permissions?.find(p => p.module === module)
    return perm?.[action] || false
  },

  isRole: (...roles) => {
    const { user } = get()
    return roles.includes(user?.role?.code)
  },

  // Traducir una clave al idioma activo
  t: (key) => {
    const { preferences } = get()
    const lang = preferences?.language || 'es'
    return i18n[lang]?.[key] || i18n.es[key] || key
  },
}))

export default useAuthStore
