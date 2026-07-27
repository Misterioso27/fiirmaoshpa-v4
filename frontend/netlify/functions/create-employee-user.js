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
    // Se pasa full_name/company_id en user_metadata para que el trigger handle_new_user
    // (que crea la fila en profiles automáticamente) use los datos correctos desde el inicio
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name, company_id: company_id || 'a0000000-0000-4000-8000-000000000001' },
    })
    if (authError) {
      // Siempre incluir el status HTTP real de Supabase Auth — el .message a veces
      // llega vacío o como "{}" si el cuerpo de error del servidor vino vacío
      const detalle = authError.message || authError.msg || authError.error_description
        || authError.name || 'sin mensaje del servidor'
      const status = authError.status || authError.statusCode || 'desconocido'
      return { statusCode: 400, body: JSON.stringify({ error: `Error al crear usuario en Auth (HTTP ${status} de Supabase): ${detalle}` }) }
    }

    // 2) El trigger handle_new_user ya creó la fila base en profiles al insertar en auth.users.
    // Aquí solo completamos branch_id y role_id, que el trigger no conoce.
    const { error: profileError } = await admin.from('profiles').update({
      branch_id: branch_id || 'b0000000-0000-4000-8000-000000000001',
      role_id:   role_id || null,
    }).eq('id', authData.user.id)
    if (profileError) {
      // si falla completar el perfil, deshacer el usuario de Auth para no dejarlo huérfano
      await admin.auth.admin.deleteUser(authData.user.id)
      const detalle = profileError.message || profileError.details || profileError.hint || profileError.code || 'error desconocido sin mensaje'
      return { statusCode: 400, body: JSON.stringify({ error: `Error al completar perfil: ${detalle}` }) }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ id: authData.user.id, email, full_name }),
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
