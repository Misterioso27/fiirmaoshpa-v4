// frontend/netlify/functions/create-employee-user.js
//
// Crea un usuario de Supabase Auth + su perfil en `profiles`, usando la
// service_role key (nunca expuesta al navegador). No afecta la sesión
// del admin que hace la petición, porque el signup ocurre en el servidor,
// no en el cliente.

const { createClient } = require('@supabase/supabase-js')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido' }) }
  }

  try {
    const { full_name, email, password, company_id, branch_id, role_id } = JSON.parse(event.body || '{}')

    if (!full_name || !email || !password) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Nombre, correo y contraseña son obligatorios' }) }
    }
    if (password.length < 6) {
      return { statusCode: 400, body: JSON.stringify({ error: 'La contraseña debe tener al menos 6 caracteres' }) }
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Configuración del servidor incompleta (faltan variables de entorno)' }) }
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1) Crear el usuario en Auth (confirmado directamente, sin pedirle que verifique correo)
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (authError) {
      // exponer el error completo (mensaje, código, status) para diagnóstico real,
      // en vez de un objeto vacío si .message viniera mal formado
      const detalle = authError.message || authError.code || authError.status || JSON.stringify(authError)
      return { statusCode: 400, body: JSON.stringify({ error: `Error al crear usuario en Auth: ${detalle}` }) }
    }

    // 2) Crear su fila en profiles
    const { error: profileError } = await admin.from('profiles').insert({
      id: authData.user.id,
      full_name, email,
      company_id: company_id || 'a0000000-0000-4000-8000-000000000001',
      branch_id:  branch_id  || 'b0000000-0000-4000-8000-000000000001',
      role_id:    role_id || null,
      status: 'active',
    })
    if (profileError) {
      // si falla el perfil, deshacer el usuario de Auth para no dejarlo huérfano
      await admin.auth.admin.deleteUser(authData.user.id)
      const detalle = profileError.message || profileError.code || JSON.stringify(profileError)
      return { statusCode: 400, body: JSON.stringify({ error: `Error al crear perfil: ${detalle}` }) }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ id: authData.user.id, email, full_name }),
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
