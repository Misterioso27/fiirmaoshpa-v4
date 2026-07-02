import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

const useAuthStore = create((set, get) => ({
  user: JSON.parse(localStorage.getItem('hpa_user') || 'null'),
  token: localStorage.getItem('hpa_token') || null,
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null })
    try {
      // 1. Autenticar
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) throw new Error(authError.message)

      const uid = authData.user.id

      // 2. Obtener perfil — sin JOIN, consulta simple
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .limit(1)

      if (profileError) throw new Error('Error al leer perfil: ' + profileError.message)
      if (!profiles || profiles.length === 0) throw new Error('Perfil no encontrado')

      const profile = profiles[0]
      if (profile.status !== 'active') throw new Error('Usuario inactivo o suspendido')

      // 3. Obtener rol por separado
      let role = null
      if (profile.role_id) {
        const { data: roles } = await supabase
          .from('roles')
          .select('id, name, code')
          .eq('id', profile.role_id)
          .limit(1)
        if (roles && roles.length > 0) role = roles[0]
      }

      // 4. Obtener sucursal por separado
      let branch = null
      if (profile.branch_id) {
        const { data: branches } = await supabase
          .from('branches')
          .select('id, name, code')
          .eq('id', profile.branch_id)
          .limit(1)
        if (branches && branches.length > 0) branch = branches[0]
      }

      // 5. Obtener empresa por separado
      let company = null
      if (profile.company_id) {
        const { data: companies } = await supabase
          .from('companies')
          .select('id, name, legal_name, logo_url, currency_base')
          .eq('id', profile.company_id)
          .limit(1)
        if (companies && companies.length > 0) company = companies[0]
      }

      // 6. Obtener permisos
      let permissions = []
      if (profile.role_id) {
        const { data: perms } = await supabase
          .from('permissions')
          .select('module, can_view, can_create, can_edit, can_delete, can_approve, can_export, can_sign, can_authorize')
          .eq('role_id', profile.role_id)
        permissions = perms || []
      }

      // 7. Construir usuario
      const userData = {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        avatar_url: profile.avatar_url,
        role,
        branch,
        company,
        permissions
      }

      localStorage.setItem('hpa_token', authData.session.access_token)
      localStorage.setItem('hpa_user', JSON.stringify(userData))

      set({ user: userData, token: authData.session.access_token, loading: false })
      return userData

    } catch (err) {
      set({ error: err.message, loading: false })
      throw err
    }
  },

  logout: async () => {
    try { await supabase.auth.signOut() } catch {}
    localStorage.removeItem('hpa_token')
    localStorage.removeItem('hpa_user')
    set({ user: null, token: null })
  },

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
      const stored = localStorage.getItem('hpa_user')
      if (stored) {
        const userData = JSON.parse(stored)
        // Si no tiene company, agregar el default
        if (!userData.company) {
          userData.company = {
            id: 'a0000000-0000-4000-8000-000000000001',
            name: 'Financiera HPA',
            currency_base: 'DOP'
          }
        }
        if (!userData.branch) {
          userData.branch = {
            id: 'b0000000-0000-4000-8000-000000000001',
            name: 'Sede Central'
          }
        }
        set({ user: userData, token: session.access_token })
      }
    } catch {}
  },

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
  }
}))

export default useAuthStore
