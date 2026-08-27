-- ============================================================
-- EJECUTAR ESTE SCRIPT EN EL SQL EDITOR DE SUPABASE
-- ============================================================

-- Tabla de productos
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('botella', 'vaso')),
  price numeric NOT NULL,
  stock integer NOT NULL DEFAULT 0,
  sold integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Tabla de ventas
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_num integer NOT NULL UNIQUE,
  items jsonb NOT NULL,
  total numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Configuración del evento (una sola fila)
CREATE TABLE IF NOT EXISTS event_config (
  id integer PRIMARY KEY DEFAULT 1,
  event_name text,
  ticket_counter integer NOT NULL DEFAULT 1
);

-- Insertar fila inicial
INSERT INTO event_config (id, event_name, ticket_counter)
VALUES (1, '', 1)
ON CONFLICT (id) DO NOTHING;

-- Función RPC para cobrar atómicamente (descuento de stock)
CREATE OR REPLACE FUNCTION checkout_sale(
  cart_items jsonb,
  total_amount numeric
)
RETURNS json AS $$
DECLARE
  new_ticket_num integer;
  item jsonb;
  prod_id uuid;
  qty_to_sell integer;
  current_stock integer;
  response json;
BEGIN
  SELECT ticket_counter INTO new_ticket_num FROM event_config WHERE id = 1 FOR UPDATE;

  FOR item IN SELECT jsonb_array_elements(cart_items)
  LOOP
    prod_id := (item->>'product_id')::uuid;
    qty_to_sell := (item->>'qty')::integer;
    SELECT stock INTO current_stock FROM products WHERE id = prod_id FOR UPDATE;
    IF current_stock < qty_to_sell THEN
      RAISE EXCEPTION 'Stock insuficiente para producto % (necesita %)', prod_id, qty_to_sell;
    END IF;
    UPDATE products
    SET stock = stock - qty_to_sell,
        sold = sold + qty_to_sell
    WHERE id = prod_id;
  END LOOP;

  INSERT INTO sales (ticket_num, items, total, created_at)
  VALUES (new_ticket_num, cart_items, total_amount, now());

  UPDATE event_config
  SET ticket_counter = ticket_counter + 1
  WHERE id = 1;

  response := json_build_object(
    'ticket_num', new_ticket_num,
    'total', total_amount,
    'items', cart_items,
    'created_at', now()::text
  );

  RETURN response;
END;
$$ LANGUAGE plpgsql;

-- Habilitar RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_config ENABLE ROW LEVEL SECURITY;

-- Policies (app privada, sin login)
CREATE POLICY "allow_select_products" ON products FOR SELECT USING (true);
CREATE POLICY "allow_insert_products" ON products FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_update_products" ON products FOR UPDATE USING (true);
CREATE POLICY "allow_delete_products" ON products FOR DELETE USING (true);

CREATE POLICY "allow_select_sales" ON sales FOR SELECT USING (true);
CREATE POLICY "allow_insert_sales" ON sales FOR INSERT WITH CHECK (true);

CREATE POLICY "allow_select_event_config" ON event_config FOR SELECT USING (true);
CREATE POLICY "allow_update_event_config" ON event_config FOR UPDATE USING (true);
