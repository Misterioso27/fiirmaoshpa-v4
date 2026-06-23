import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// ─── FORMATTERS ─────────────────────────────────────────────
export function fmt(amount, currency = 'DOP') {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency', currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount || 0)
}

export function fmtDate(date) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('es-DO', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
}

export function fmtDateTime(date) {
  if (!date) return '—'
  return new Date(date).toLocaleString('es-DO', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export function fmtPercent(value) {
  return `${(value || 0).toFixed(2)}%`
}

// ─── SUPABASE DIRECT API ────────────────────────────────────
// Reemplaza las llamadas a Netlify Functions con Supabase directo

export const db = {

  // ── CLIENTS ──────────────────────────────────────────────
  async getClients({ page = 1, limit = 20, search = '', status = '', companyId }) {
    const offset = (page - 1) * limit
    let query = supabase
      .from('clients')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)
    if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,national_id.ilike.%${search}%,client_code.ilike.%${search}%`)

    const { data, error, count } = await query
    if (error) throw new Error(error.message)
    return { clients: data, pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } }
  },

  async createClient(clientData, companyId, branchId, userId) {
    // Generar código secuencial
    const { count } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)

    const clientCode = `HPA-C-${String((count || 0) + 1).padStart(4, '0')}`

    const { data, error } = await supabase
      .from('clients')
      .insert({
        ...clientData,
        company_id: companyId,
        branch_id: branchId,
        client_code: clientCode,
        created_by: userId,
        status: clientData.status || 'prospect',
        kyc_status: 'pending',
        kyc_level: 0,
        internal_score: 0,
        risk_score: 0,
        risk_level: 'low'
      })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return data
  },

  async updateClient(id, updates, companyId) {
    const { data, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data
  },

  // ── LOAN APPLICATIONS ────────────────────────────────────
  async getLoanApplications({ page = 1, limit = 20, status = '', companyId }) {
    const offset = (page - 1) * limit
    let query = supabase
      .from('loan_applications')
      .select(`
        *,
        clients(first_name, last_name, client_code, phone_primary),
        financial_products(name, code)
      `, { count: 'exact' })
      .eq('company_id', companyId)
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data, error, count } = await query
    if (error) throw new Error(error.message)
    return { applications: data, pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } }
  },

  async createLoanApplication(appData, companyId, branchId, userId) {
    const { count } = await supabase
      .from('loan_applications')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)

    const appCode = `HPA-SOL-${String((count || 0) + 1).padStart(4, '0')}`

    const { data, error } = await supabase
      .from('loan_applications')
      .insert({
        ...appData,
        company_id: companyId,
        branch_id: branchId,
        application_code: appCode,
        status: 'submitted',
        created_by: userId
      })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return data
  },

  async updateLoanApplication(id, updates, companyId) {
    const { data, error } = await supabase
      .from('loan_applications')
      .update(updates)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data
  },

  // ── LOANS ────────────────────────────────────────────────
  async getLoans({ page = 1, limit = 20, status = '', companyId }) {
    const offset = (page - 1) * limit
    let query = supabase
      .from('loans')
      .select(`
        *,
        clients(first_name, last_name, client_code, phone_primary),
        financial_products(name, code)
      `, { count: 'exact' })
      .eq('company_id', companyId)
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data, error, count } = await query
    if (error) throw new Error(error.message)
    return { loans: data, pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } }
  },

  // ── INVESTMENTS ──────────────────────────────────────────
  async getInvestments({ page = 1, limit = 20, status = '', companyId }) {
    const offset = (page - 1) * limit
    let query = supabase
      .from('investments')
      .select(`
        *,
        clients(first_name, last_name, client_code),
        financial_products(name, code)
      `, { count: 'exact' })
      .eq('company_id', companyId)
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data, error, count } = await query
    if (error) throw new Error(error.message)
    return { investments: data, pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } }
  },

  // ── PRODUCTS ─────────────────────────────────────────────
  async getProducts(companyId) {
    const { data, error } = await supabase
      .from('financial_products')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name')
    if (error) throw new Error(error.message)
    return data || []
  },

  // ── CASH REGISTERS ───────────────────────────────────────
  async getCashRegisters(companyId) {
    const { data, error } = await supabase
      .from('cash_registers')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
    if (error) throw new Error(error.message)
    return data || []
  },

  // ── EMPLOYEES ────────────────────────────────────────────
  async getEmployees({ page = 1, limit = 20, companyId }) {
    const offset = (page - 1) * limit
    const { data, error, count } = await supabase
      .from('employees')
      .select(`
        *,
        profiles(full_name, email, avatar_url),
        departments(name),
        branches(name, code)
      `, { count: 'exact' })
      .eq('company_id', companyId)
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)
    return { employees: data, pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } }
  },

  // ── COLLECTIONS ──────────────────────────────────────────
  async getCollections({ page = 1, limit = 20, stage = '', companyId }) {
    const offset = (page - 1) * limit
    let query = supabase
      .from('collection_cases')
      .select(`
        *,
        clients(first_name, last_name, phone_primary),
        loans(loan_code),
        profiles(full_name)
      `, { count: 'exact' })
      .eq('company_id', companyId)
      .range(offset, offset + limit - 1)
      .order('days_overdue', { ascending: false })

    if (stage) query = query.eq('stage', stage)

    const { data, error, count } = await query
    if (error) throw new Error(error.message)
    return { cases: data, pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } }
  },

  // ── AUDIT LOG ────────────────────────────────────────────
  async getAuditLog({ page = 1, limit = 25, module = '', action = '', companyId }) {
    const offset = (page - 1) * limit
    let query = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false })

    if (module) query = query.eq('module', module)
    if (action) query = query.eq('action', action)

    const { data, error, count } = await query
    if (error) throw new Error(error.message)
    return { logs: data, pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } }
  },

  // ── AI AGENTS ────────────────────────────────────────────
  async getAgents(companyId) {
    const { data, error } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name')
    if (error) throw new Error(error.message)
    return data || []
  },

  async getPendingDecisions(companyId) {
    const { data, error } = await supabase
      .from('ai_decisions')
      .select('*, ai_agents(name, avatar_emoji)')
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data || []
  }
}
