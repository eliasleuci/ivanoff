-- ============================================================
-- EJECUTAR ESTO EN EL SQL EDITOR DE SUPABASE
-- Si ya creaste la tabla, ejecutá solo desde el bloque de POLICIES
-- ============================================================

-- 1. Crear la tabla (si no existe)
CREATE TABLE IF NOT EXISTS event_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code text UNIQUE NOT NULL,
  buyer_name text,
  ticket_type text NOT NULL DEFAULT 'General',
  price numeric NOT NULL DEFAULT 0,
  payment_method text CHECK (payment_method IN ('efectivo', 'transferencia')),
  used boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 2. Habilitar RLS
ALTER TABLE event_tickets ENABLE ROW LEVEL SECURITY;

-- 3. Eliminar policies anteriores (por si ya existían mal)
DROP POLICY IF EXISTS "allow_select_event_tickets" ON event_tickets;
DROP POLICY IF EXISTS "allow_insert_event_tickets" ON event_tickets;
DROP POLICY IF EXISTS "allow_update_event_tickets" ON event_tickets;
DROP POLICY IF EXISTS "allow_delete_event_tickets" ON event_tickets;

-- 4. Crear policies correctas
CREATE POLICY "allow_select_event_tickets" ON event_tickets FOR SELECT USING (true);
CREATE POLICY "allow_insert_event_tickets" ON event_tickets FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_update_event_tickets" ON event_tickets FOR UPDATE USING (true);
CREATE POLICY "allow_delete_event_tickets" ON event_tickets FOR DELETE USING (true);

-- 5. Permisos explícitos al rol anon
GRANT ALL ON event_tickets TO anon;
GRANT ALL ON event_tickets TO authenticated;

-- 6. Función RPC para validar QR atómicamente
CREATE OR REPLACE FUNCTION validate_ticket(p_ticket_code text)
RETURNS json AS $$
DECLARE
  ticket_row event_tickets%ROWTYPE;
BEGIN
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
    'price',       ticket_row.price
  );
END;
$$ LANGUAGE plpgsql;

-- 7. Permiso para ejecutar la función
GRANT EXECUTE ON FUNCTION validate_ticket(text) TO anon;
GRANT EXECUTE ON FUNCTION validate_ticket(text) TO authenticated;
