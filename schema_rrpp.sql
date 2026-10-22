-- ============================================================
-- RRPP + LOGIN REAL POR ROLES
-- EJECUTAR EN EL SQL EDITOR DE SUPABASE (después de schema.sql y schema_entradas.sql)
-- Se puede ejecutar más de una vez sin romper nada.
--
-- ANTES de ejecutarlo:
--   1. Authentication → Sign In / Providers → desactivar "Allow new users to sign up".
--   2. Authentication → Users → "Add user" → "Create new user":
--        email:    controldegestion@pdv.local   (usuario "controldegestion")
--        password: la clave del administrador
--        marcar "Auto Confirm User".
--   3. Ejecutar este script completo (el bloque 9 le da rol admin a ese usuario).
--
-- OJO: al ejecutarlo se corta el acceso anónimo, así que la versión vieja
-- de la app deja de funcionar hasta publicar la nueva.
-- ============================================================

-- 1. Perfiles de usuario (uno por cada usuario de Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'rrpp', 'puerta')),
  active boolean NOT NULL DEFAULT true,
  -- true cuando el admin crea el usuario o le resetea la clave: se le pide cambiarla al entrar
  must_change_password boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- 2. Columnas nuevas
ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
-- Copia del nombre del vendedor: se conserva aunque el RRPP se elimine
ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS seller_name text;
ALTER TABLE event_tickets ADD COLUMN IF NOT EXISTS buyer_phone text;

ALTER TABLE event_config ADD COLUMN IF NOT EXISTS payment_alias text;
-- Si tiene valor, solo ese usuario puede escanear entradas
ALTER TABLE event_config ADD COLUMN IF NOT EXISTS exclusive_scanner uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE event_config DROP COLUMN IF EXISTS ticket_prices;

UPDATE event_tickets t
   SET seller_name = p.display_name
  FROM profiles p
 WHERE t.seller_id = p.id AND t.seller_name IS NULL;

-- 3. Helpers de rol (security definer para poder usarlos dentro de las policies)
CREATE OR REPLACE FUNCTION my_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM profiles WHERE id = auth.uid() AND active
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(my_role() = 'admin', false)
$$;

-- 4. Borrar las policies abiertas anteriores
DROP POLICY IF EXISTS "allow_select_products" ON products;
DROP POLICY IF EXISTS "allow_insert_products" ON products;
DROP POLICY IF EXISTS "allow_update_products" ON products;
DROP POLICY IF EXISTS "allow_delete_products" ON products;
DROP POLICY IF EXISTS "allow_select_sales" ON sales;
DROP POLICY IF EXISTS "allow_insert_sales" ON sales;
DROP POLICY IF EXISTS "allow_select_event_config" ON event_config;
DROP POLICY IF EXISTS "allow_update_event_config" ON event_config;
DROP POLICY IF EXISTS "allow_select_event_tickets" ON event_tickets;
DROP POLICY IF EXISTS "allow_insert_event_tickets" ON event_tickets;
DROP POLICY IF EXISTS "allow_update_event_tickets" ON event_tickets;
DROP POLICY IF EXISTS "allow_delete_event_tickets" ON event_tickets;

REVOKE ALL ON products, sales, event_config, event_tickets, profiles FROM anon;

-- 5. Policies nuevas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_products" ON products;
CREATE POLICY "admin_all_products" ON products FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_all_sales" ON sales;
CREATE POLICY "admin_all_sales" ON sales FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- Todos los usuarios activos leen la config (nombre del evento, alias, escáner)
DROP POLICY IF EXISTS "active_select_event_config" ON event_config;
CREATE POLICY "active_select_event_config" ON event_config FOR SELECT TO authenticated
  USING (my_role() IS NOT NULL);
DROP POLICY IF EXISTS "admin_update_event_config" ON event_config;
CREATE POLICY "admin_update_event_config" ON event_config FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- Entradas: el admin hace todo; el RRPP solo ve las suyas (vende vía sell_ticket)
DROP POLICY IF EXISTS "admin_all_event_tickets" ON event_tickets;
CREATE POLICY "admin_all_event_tickets" ON event_tickets FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "rrpp_select_own_event_tickets" ON event_tickets;
CREATE POLICY "rrpp_select_own_event_tickets" ON event_tickets FOR SELECT TO authenticated
  USING (seller_id = auth.uid() AND my_role() = 'rrpp');

-- Perfiles: cada uno ve el suyo, el admin ve todos.
-- Altas / bajas / edición se hacen desde la Netlify Function (service role).
DROP POLICY IF EXISTS "select_profiles" ON profiles;
CREATE POLICY "select_profiles" ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_admin());

-- 6. Vender entrada (admin o RRPP): queda a nombre de quien la vende
DROP FUNCTION IF EXISTS sell_ticket(text, text, text, text, numeric);
CREATE FUNCTION sell_ticket(
  p_buyer_name text,
  p_buyer_phone text,
  p_ticket_type text,
  p_payment_method text,
  p_price numeric
)
RETURNS event_tickets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := my_role();
  v_seller text;
  v_row event_tickets;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('admin', 'rrpp') THEN
    RAISE EXCEPTION 'Tu usuario no tiene permiso para vender entradas.';
  END IF;
  IF p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION 'Ingresá un precio válido (0 o mayor).';
  END IF;

  SELECT display_name INTO v_seller FROM profiles WHERE id = auth.uid();

  INSERT INTO event_tickets (ticket_code, buyer_name, buyer_phone, ticket_type, price, payment_method, used, seller_id, seller_name)
  VALUES (
    'EVT-' || upper(gen_random_uuid()::text),
    coalesce(nullif(trim(p_buyer_name), ''), 'Sin nombre'),
    nullif(trim(p_buyer_phone), ''),
    p_ticket_type,
    p_price,
    p_payment_method,
    false,
    auth.uid(),
    v_seller
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- 7. Validar QR: solo admin o puerta, respetando el escáner exclusivo
CREATE OR REPLACE FUNCTION validate_ticket(p_ticket_code text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ticket_row event_tickets%ROWTYPE;
  v_role text := my_role();
  v_exclusive uuid;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('admin', 'puerta') THEN
    RETURN json_build_object('status', 'not_allowed', 'message', 'Tu usuario no tiene permiso para escanear.');
  END IF;

  SELECT exclusive_scanner INTO v_exclusive FROM event_config WHERE id = 1;
  IF v_exclusive IS NOT NULL AND v_exclusive <> auth.uid() THEN
    RETURN json_build_object('status', 'not_allowed', 'message', 'El escaneo está asignado a otro usuario.');
  END IF;

  SELECT * INTO ticket_row
    FROM event_tickets
   WHERE ticket_code = p_ticket_code
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_found');
  END IF;

  IF ticket_row.used THEN
    RETURN json_build_object(
      'status',      'already_used',
      'buyer_name',  ticket_row.buyer_name,
      'ticket_type', ticket_row.ticket_type,
      'seller_name', ticket_row.seller_name,
      'used_at',     ticket_row.used_at::text
    );
  END IF;

  UPDATE event_tickets
     SET used = true, used_at = now()
   WHERE ticket_code = p_ticket_code;

  RETURN json_build_object(
    'status',      'valid',
    'buyer_name',  ticket_row.buyer_name,
    'ticket_type', ticket_row.ticket_type,
    'seller_name', ticket_row.seller_name,
    'price',       ticket_row.price
  );
END;
$$;

-- 8. El usuario avisa que ya cambió su clave (deja de pedírsela al entrar)
CREATE OR REPLACE FUNCTION mark_password_changed()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE profiles SET must_change_password = false WHERE id = auth.uid()
$$;

REVOKE EXECUTE ON FUNCTION validate_ticket(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION validate_ticket(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION sell_ticket(text, text, text, text, numeric) FROM anon, public;
GRANT EXECUTE ON FUNCTION sell_ticket(text, text, text, text, numeric) TO authenticated;
REVOKE EXECUTE ON FUNCTION mark_password_changed() FROM anon, public;
GRANT EXECUTE ON FUNCTION mark_password_changed() TO authenticated;
REVOKE EXECUTE ON FUNCTION checkout_sale(jsonb, numeric) FROM anon, public;
GRANT EXECUTE ON FUNCTION checkout_sale(jsonb, numeric) TO authenticated;

-- 9. Dar rol admin al usuario creado en el paso 2
INSERT INTO profiles (id, username, display_name, role)
SELECT id, 'controldegestion', 'Administrador', 'admin'
  FROM auth.users
 WHERE email = 'controldegestion@pdv.local'
ON CONFLICT (id) DO NOTHING;

-- 10. Que la API de Supabase tome las columnas y funciones nuevas al instante
NOTIFY pgrst, 'reload schema';
