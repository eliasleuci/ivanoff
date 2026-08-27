import { supabase } from '../supabaseClient';

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

/* ───────────────── RESET DAY ───────────────── */

export async function resetDaySales() {
  const { error: e1 } = await supabase
    .from('products')
    .update({ sold: 0 })
    .gte('sold', 0); // matches all rows

  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from('event_config')
    .update({ ticket_counter: 1 })
    .eq('id', 1);

  if (e2) throw e2;
}
