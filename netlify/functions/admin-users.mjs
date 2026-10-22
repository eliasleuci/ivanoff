import { createClient } from '@supabase/supabase-js';

// Alta, edición, pausa, eliminación y reseteo de clave de usuarios del equipo (RRPP y puerta).
// Corre en Netlify con la service role key, que nunca llega al navegador.
// Variables de entorno en Netlify: SUPABASE_SERVICE_ROLE_KEY y VITE_SUPABASE_URL (o SUPABASE_URL).

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Debe coincidir con USERNAME_EMAIL_DOMAIN en src/hooks/useSupabase.js
const EMAIL_DOMAIN = 'pdv.local';
const TEAM_ROLES = ['rrpp', 'puerta'];
const BAN_FOREVER = '876000h';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en Netlify.' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verificar que quien llama sea un admin activo
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const expired = 'Tu sesión venció. Tocá Salir y volvé a ingresar.';
  if (!token) return json(401, { error: expired });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    console.warn('admin-users: token rechazado', userErr?.message);
    return json(401, { error: expired });
  }

  const { data: me } = await admin
    .from('profiles')
    .select('role, active')
    .eq('id', userData.user.id)
    .single();
  if (!me || me.role !== 'admin' || !me.active) {
    return json(403, { error: 'Solo el administrador puede gestionar el equipo.' });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Pedido inválido.' });
  }

  // Las acciones sobre usuarios existentes solo aplican a RRPP / puerta, nunca a otro admin
  const loadTarget = async (userId) => {
    const { data } = await admin.from('profiles').select('*').eq('id', userId).single();
    return data && TEAM_ROLES.includes(data.role) ? data : null;
  };

  const usernameError = (username) =>
    /^[a-z0-9._-]{3,30}$/.test(username)
      ? null
      : 'El usuario debe tener entre 3 y 30 caracteres: letras minúsculas, números, punto o guion.';

  switch (body.action) {
    case 'create': {
      const username = String(body.username || '').trim().toLowerCase();
      const displayName = String(body.displayName || '').trim();
      const password = String(body.password || '');
      const role = body.role;

      if (usernameError(username)) return json(400, { error: usernameError(username) });
      if (!displayName) return json(400, { error: 'Falta el nombre.' });
      if (password.length < 6) return json(400, { error: 'La clave debe tener al menos 6 caracteres.' });
      if (!TEAM_ROLES.includes(role)) return json(400, { error: 'Rol inválido.' });

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: `${username}@${EMAIL_DOMAIN}`,
        password,
        email_confirm: true,
        user_metadata: { username, display_name: displayName },
      });
      if (createErr) {
        const taken = /already|registered|exists/i.test(createErr.message);
        return json(taken ? 409 : 400, { error: taken ? 'Ese usuario ya existe.' : createErr.message });
      }

      const { data: profile, error: profileErr } = await admin
        .from('profiles')
        .insert({ id: created.user.id, username, display_name: displayName, role, must_change_password: true })
        .select()
        .single();
      if (profileErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json(400, { error: profileErr.message });
      }
      return json(200, { profile });
    }

    case 'reset_password': {
      const password = String(body.password || '');
      if (password.length < 6) return json(400, { error: 'La clave debe tener al menos 6 caracteres.' });
      const target = await loadTarget(body.userId);
      if (!target) return json(404, { error: 'Usuario no encontrado.' });

      const { error } = await admin.auth.admin.updateUserById(target.id, { password });
      if (error) return json(400, { error: error.message });
      await admin.from('profiles').update({ must_change_password: true }).eq('id', target.id);
      return json(200, { ok: true });
    }

    case 'update': {
      const target = await loadTarget(body.userId);
      if (!target) return json(404, { error: 'Usuario no encontrado.' });
      const username = String(body.username ?? target.username).trim().toLowerCase();
      const displayName = String(body.displayName ?? target.display_name).trim();

      if (usernameError(username)) return json(400, { error: usernameError(username) });
      if (!displayName) return json(400, { error: 'Falta el nombre.' });

      if (username !== target.username) {
        const { data: taken } = await admin.from('profiles').select('id').eq('username', username).maybeSingle();
        if (taken) return json(409, { error: 'Ese usuario ya existe.' });
        const { error: emailErr } = await admin.auth.admin.updateUserById(target.id, {
          email: `${username}@${EMAIL_DOMAIN}`,
          email_confirm: true,
        });
        if (emailErr) return json(400, { error: emailErr.message });
      }

      const { data: profile, error } = await admin
        .from('profiles')
        .update({ username, display_name: displayName })
        .eq('id', target.id)
        .select()
        .single();
      if (error) return json(400, { error: error.message });

      // Las entradas ya vendidas pasan a mostrar el nombre nuevo
      if (displayName !== target.display_name) {
        await admin.from('event_tickets').update({ seller_name: displayName }).eq('seller_id', target.id);
      }
      return json(200, { profile });
    }

    case 'delete': {
      const target = await loadTarget(body.userId);
      if (!target) return json(404, { error: 'Usuario no encontrado.' });
      // Borra el login y el perfil (cascade). Sus entradas quedan válidas y conservan seller_name.
      const { error } = await admin.auth.admin.deleteUser(target.id);
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true });
    }

    case 'set_active': {
      const active = !!body.active;
      const target = await loadTarget(body.userId);
      if (!target) return json(404, { error: 'Usuario no encontrado.' });

      // El ban impide volver a iniciar sesión; active=false corta el acceso a los datos al instante
      const { error: banErr } = await admin.auth.admin.updateUserById(target.id, {
        ban_duration: active ? 'none' : BAN_FOREVER,
      });
      if (banErr) return json(400, { error: banErr.message });

      const { data: profile, error } = await admin
        .from('profiles')
        .update({ active })
        .eq('id', target.id)
        .select()
        .single();
      if (error) return json(400, { error: error.message });
      return json(200, { profile });
    }

    default:
      return json(400, { error: 'Acción desconocida.' });
  }
};
