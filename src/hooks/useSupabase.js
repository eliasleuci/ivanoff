import { supabase } from '../supabaseClient';

/* ───────────────── AUTH ───────────────── */

// Supabase Auth pide email: el usuario "juan" se guarda como juan@pdv.local.
// Debe coincidir con EMAIL_DOMAIN en netlify/functions/admin-users.mjs
export const USERNAME_EMAIL_DOMAIN = 'pdv.local';

// Acepta "juan" o el email completo "juan@pdv.local"
const usernameToEmail = (username) => {
  const u = username.trim().toLowerCase();
  return u.includes('@') ? u : `${u}@${USERNAME_EMAIL_DOMAIN}`;
};

export async function signIn(username, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Cambio de clave del propio usuario. Si se pasa la clave actual, se verifica antes.
export async function changeMyPassword(newPassword, currentPassword = null) {
  if (currentPassword !== null) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error: checkErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (checkErr) throw new Error('La clave actual no es correcta.');
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    if (/different from the old/i.test(error.message)) {
      throw new Error('La clave nueva tiene que ser distinta a la actual.');
    }
    throw error;
  }
  const { error: markErr } = await supabase.rpc('mark_password_changed');
  if (markErr) throw markErr;
}

export async function fetchMyProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/* ───────────────── EQUIPO (RRPP / PUERTA) ───────────────── */

export async function fetchProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('display_name', { ascending: true });
  if (error) throw error;
  return data;
}

// Altas y claves pasan por la Netlify Function, que tiene la service role key
async function callAdminUsers(action, payload) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/.netlify/functions/admin-users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  return body;
}

export async function createTeamUser({ username, displayName, password, role }) {
  const { profile } = await callAdminUsers('create', { username, displayName, password, role });
  return profile;
}

export async function resetTeamPassword(userId, password) {
  await callAdminUsers('reset_password', { userId, password });
}

export async function setTeamUserActive(userId, active) {
  const { profile } = await callAdminUsers('set_active', { userId, active });
  return profile;
}

export async function updateTeamUser(userId, { displayName, username }) {
  const { profile } = await callAdminUsers('update', { userId, displayName, username });
  return profile;
}

export async function deleteTeamUser(userId) {
  await callAdminUsers('delete', { userId });
}

/* ───────────────── PRODUCTS ───────────────── */

export async function fetchProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('type', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return data;
}

export async function addProduct({ name, type, price, stock }) {
  const { data, error } = await supabase
    .from('products')
    .insert([{ name, type, price: Number(price), stock: Number(stock), sold: 0 }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProduct(id, fields) {
  const { data, error } = await supabase
    .from('products')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProduct(id) {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

/* ───────────────── SALES ───────────────── */

export async function fetchSales() {
  const { data, error } = await supabase
    .from('sales')
    .select('*')
    .order('ticket_num', { ascending: false });
  if (error) throw error;
  return data;
}

export async function checkoutSale(cartItems, totalAmount) {
  const { data, error } = await supabase.rpc('checkout_sale', {
    cart_items: cartItems,
    total_amount: totalAmount,
  });
  if (error) throw error;
  return data;
}

/* ───────────────── EVENT CONFIG ───────────────── */

export async function fetchEventConfig() {
  const { data, error } = await supabase
    .from('event_config')
    .select('*')
    .eq('id', 1)
    .single();
  if (error) throw error;
  return data;
}

export async function updateEventName(name) {
  const { error } = await supabase
    .from('event_config')
    .update({ event_name: name })
    .eq('id', 1);
  if (error) throw error;
}

// Alias de cobro y escáner exclusivo
export async function updateEventSettings(fields) {
  const { data, error } = await supabase
    .from('event_config')
    .update(fields)
    .eq('id', 1)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ───────────────── RESET DAY ───────────────── */

export async function resetDaySales() {
  console.log('[resetDaySales] Iniciando reseteo...');
  // 1. Reset products
  const { data: products, error: fetchErr } = await supabase
    .from('products')
    .select('id');
  
  if (fetchErr) {
    console.error('[resetDaySales] Error al obtener productos:', fetchErr);
    throw fetchErr;
  }

  if (products && products.length > 0) {
    const promises = products.map((p) =>
      supabase.from('products').update({ sold: 0 }).eq('id', p.id)
    );
    const results = await Promise.all(promises);
    const err = results.find((r) => r.error);
    if (err) {
      console.error('[resetDaySales] Error al actualizar un producto:', err.error);
      throw err.error;
    }
  }

  console.log('[resetDaySales] Productos reseteados. Reseteando ticket_counter...');
  // 2. Reset ticket counter
  const { error: e2 } = await supabase
    .from('event_config')
    .update({ ticket_counter: 1 })
    .eq('id', 1);

  if (e2) {
    console.error('[resetDaySales] Error al actualizar event_config:', e2);
    throw e2;
  }
  console.log('[resetDaySales] Reseteo exitoso.');
}

/* ───────────────── EVENT TICKETS ───────────────── */

// La entrada queda a nombre de quien la vende (admin o RRPP)
export async function sellTicket({ buyerName, buyerPhone, ticketType, paymentMethod, price }) {
  const { data, error } = await supabase.rpc('sell_ticket', {
    p_buyer_name: buyerName,
    p_buyer_phone: buyerPhone,
    p_ticket_type: ticketType,
    p_payment_method: paymentMethod,
    p_price: price,
  });
  if (error) throw error;
  return data;
}

// Lote de entradas de puerta pre-generadas para imprimir (código PTA-…)
export async function createDoorTickets({ count, ticketType, price, startNumber }) {
  const rows = Array.from({ length: count }, (_, i) => ({
    ticket_code: `PTA-${crypto.randomUUID().toUpperCase()}`,
    buyer_name: `Puerta #${String(startNumber + i).padStart(3, '0')}`,
    ticket_type: ticketType,
    price: Number(price),
    payment_method: 'efectivo',
    used: false,
  }));

  const { data, error } = await supabase
    .from('event_tickets')
    .insert(rows)
    .select();
  if (error) throw error;
  return data;
}

export async function validateTicket(ticketCode) {
  const { data, error } = await supabase.rpc('validate_ticket', {
    p_ticket_code: ticketCode,
  });
  if (error) throw error;
  return data;
}

export async function fetchEventTickets() {
  const { data, error } = await supabase
    .from('event_tickets')
    .select('*, seller:profiles(display_name, username)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function deleteEventTicket(id) {
  const { error } = await supabase.from('event_tickets').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteAllEventTickets() {
  // Delete all rows — filter by created_at >= epoch so it matches everything
  const { error } = await supabase
    .from('event_tickets')
    .delete()
    .gte('created_at', '2000-01-01');
  if (error) throw error;
}

