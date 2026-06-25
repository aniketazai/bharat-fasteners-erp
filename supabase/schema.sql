-- =================================================================
-- BHARAT FASTENERS ERP — SUPABASE SCHEMA
-- Run this entire file in: Supabase Dashboard > SQL Editor > New Query
-- =================================================================

-- ─────────────────────────────────────────────────────────────────
-- AUTO-GENERATE SEQUENCES
-- ─────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS orders_seq      START 1;
CREATE SEQUENCE IF NOT EXISTS plating_lot_seq START 1;

-- =================================================================
-- MASTER TABLES
-- =================================================================

-- ─────────────────────────────────────────────────────────────────
-- 1. MACHINES
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE machines (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_code TEXT        UNIQUE NOT NULL,
  machine_name TEXT        NOT NULL,
  machine_type TEXT        NOT NULL DEFAULT 'Header'
                           CHECK (machine_type IN ('Header', 'Other')),
  status       TEXT        NOT NULL DEFAULT 'Active'
                           CHECK (status IN ('Active', 'Inactive')),
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Seed: 10 Workshop 1 Header machines (from reference Excel data)
INSERT INTO machines (machine_code, machine_name, machine_type) VALUES
  ('W1-H-01', 'W1 Header 1',  'Header'),
  ('W1-H-02', 'W1 Header 2',  'Header'),
  ('W1-H-03', 'W1 Header 3',  'Header'),
  ('W1-H-04', 'W1 Header 4',  'Header'),
  ('W1-H-05', 'W1 Header 5',  'Header'),
  ('W1-H-06', 'W1 Header 6',  'Header'),
  ('W1-H-07', 'W1 Header 7',  'Header'),
  ('W1-H-08', 'W1 Header 8',  'Header'),
  ('W1-H-09', 'W1 Header 9',  'Header'),
  ('W1-H-10', 'W1 Header 10', 'Header');

-- ─────────────────────────────────────────────────────────────────
-- 2. RM WIRE MASTER
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE rm_wire_master (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  diameter_mm NUMERIC     NOT NULL,
  grade       TEXT        NOT NULL DEFAULT 'Grade-1',
  unit        TEXT        NOT NULL DEFAULT 'kg',
  status      TEXT        NOT NULL DEFAULT 'Active'
                          CHECK (status IN ('Active', 'Inactive')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (diameter_mm, grade)
);

-- Seed: 8 diameters with placeholder grade (rename via Masters UI later)
INSERT INTO rm_wire_master (diameter_mm, grade) VALUES
  (3.88, 'Grade-1'),
  (2.92, 'Grade-1'),
  (3.25, 'Grade-1'),
  (2.40, 'Grade-1'),
  (4.40, 'Grade-1'),
  (2.30, 'Grade-1'),
  (1.90, 'Grade-1'),
  (3.40, 'Grade-1');

-- ─────────────────────────────────────────────────────────────────
-- 3. OUTPUT SCREW MASTER
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE output_screw_master (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  screw_code              TEXT        UNIQUE NOT NULL,
  screw_name              TEXT        NOT NULL,
  die_spec                TEXT,
  rm_wire_id              UUID        REFERENCES rm_wire_master(id),
  conversion_ratio_per_kg NUMERIC     NOT NULL
                          CHECK (conversion_ratio_per_kg > 0),
  status                  TEXT        NOT NULL DEFAULT 'Active'
                          CHECK (status IN ('Active', 'Inactive')),
  created_at              TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────
-- 4. CUSTOMER MASTER
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE customer_master (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name  TEXT        UNIQUE NOT NULL,
  contact_person TEXT,
  phone          TEXT,
  address        TEXT,
  status         TEXT        NOT NULL DEFAULT 'Active'
                             CHECK (status IN ('Active', 'Inactive')),
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Seed: 7 placeholder customers (rename via Masters UI)
INSERT INTO customer_master (customer_name) VALUES
  ('Customer A'),
  ('Customer B'),
  ('Customer C'),
  ('Customer D'),
  ('Customer E'),
  ('Customer F'),
  ('Customer G');

-- ─────────────────────────────────────────────────────────────────
-- 5. PLATING TYPE MASTER
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE plating_type_master (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plating_name TEXT        UNIQUE NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'Active'
                           CHECK (status IN ('Active', 'Inactive')),
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Seed
INSERT INTO plating_type_master (plating_name) VALUES
  ('Zinc'),
  ('CED'),
  ('Black'),
  ('Silver'),
  ('Others');

-- =================================================================
-- TRANSACTIONAL TABLES
-- =================================================================

-- ─────────────────────────────────────────────────────────────────
-- 6. ORDERS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE orders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no    TEXT        UNIQUE NOT NULL DEFAULT '',
  order_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
  customer_id UUID        NOT NULL REFERENCES customer_master(id),
  screw_id    UUID        NOT NULL REFERENCES output_screw_master(id),
  order_qty   INTEGER     NOT NULL CHECK (order_qty > 0),
  due_date    DATE,
  status      TEXT        NOT NULL DEFAULT 'Open'
                          CHECK (status IN ('Open', 'In Progress', 'Completed', 'Cancelled')),
  created_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION generate_order_no()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_no IS NULL OR NEW.order_no = '' THEN
    NEW.order_no := 'ORD-' || LPAD(nextval('orders_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_order_no
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_order_no();

-- ─────────────────────────────────────────────────────────────────
-- 7. RM LOT  (opening/purchase; usage + closing computed in view)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE rm_lot (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rm_wire_id      UUID        NOT NULL REFERENCES rm_wire_master(id),
  date            DATE        NOT NULL,
  opening_qty_kg  NUMERIC     NOT NULL DEFAULT 0,
  purchase_qty_kg NUMERIC     NOT NULL DEFAULT 0,
  created_by      UUID        REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (rm_wire_id, date)
);

-- ─────────────────────────────────────────────────────────────────
-- 8. PRODUCTION HEADER
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE production_header (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  date              DATE        NOT NULL DEFAULT CURRENT_DATE,
  machine_id        UUID        NOT NULL REFERENCES machines(id),
  rm_wire_id        UUID        NOT NULL REFERENCES rm_wire_master(id),
  rm_qty_issued_kg  NUMERIC     NOT NULL CHECK (rm_qty_issued_kg > 0),
  order_id          UUID        REFERENCES orders(id),
  screw_id          UUID        NOT NULL REFERENCES output_screw_master(id),
  actual_output_qty INTEGER     NOT NULL DEFAULT 0,
  status            TEXT        NOT NULL DEFAULT 'Running'
                                CHECK (status IN ('Running', 'Setup', 'Breakdown', 'Idle')),
  created_by        UUID        REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────
-- VIEWS (created after both rm_lot and production_header exist)
-- ─────────────────────────────────────────────────────────────────

-- RM Lot with live usage and closing (usage = sum of production issues that day)
CREATE OR REPLACE VIEW rm_lot_with_closing AS
SELECT
  l.id,
  l.rm_wire_id,
  l.date,
  l.opening_qty_kg,
  l.purchase_qty_kg,
  w.diameter_mm,
  w.grade,
  COALESCE(u.usage_qty_kg, 0)                                        AS usage_qty_kg,
  l.opening_qty_kg + l.purchase_qty_kg - COALESCE(u.usage_qty_kg, 0) AS closing_qty_kg,
  l.created_by,
  l.created_at
FROM rm_lot l
JOIN rm_wire_master w ON w.id = l.rm_wire_id
LEFT JOIN (
  SELECT
    rm_wire_id,
    date,
    SUM(rm_qty_issued_kg) AS usage_qty_kg
  FROM production_header
  GROUP BY rm_wire_id, date
) u ON u.rm_wire_id = l.rm_wire_id AND u.date = l.date;

-- Production header with computed expected output, loss qty, and loss %
CREATE OR REPLACE VIEW production_header_with_computed AS
SELECT
  ph.id,
  ph.date,
  ph.machine_id,
  ph.rm_wire_id,
  ph.rm_qty_issued_kg,
  ph.order_id,
  ph.screw_id,
  ph.actual_output_qty,
  ph.status,
  ph.created_by,
  ph.created_at,
  m.machine_code,
  m.machine_name,
  w.diameter_mm,
  w.grade,
  s.screw_code,
  s.screw_name,
  s.conversion_ratio_per_kg,
  ROUND(ph.rm_qty_issued_kg * s.conversion_ratio_per_kg)                            AS expected_output_qty,
  ROUND(ph.rm_qty_issued_kg * s.conversion_ratio_per_kg) - ph.actual_output_qty     AS material_loss_qty,
  CASE
    WHEN ROUND(ph.rm_qty_issued_kg * s.conversion_ratio_per_kg) > 0
    THEN ROUND(
      (ROUND(ph.rm_qty_issued_kg * s.conversion_ratio_per_kg) - ph.actual_output_qty)::NUMERIC
      / ROUND(ph.rm_qty_issued_kg * s.conversion_ratio_per_kg) * 100,
      2
    )
    ELSE 0
  END                                                                                AS loss_pct
FROM production_header ph
JOIN machines          m ON m.id = ph.machine_id
JOIN rm_wire_master    w ON w.id = ph.rm_wire_id
JOIN output_screw_master s ON s.id = ph.screw_id;

-- RM Requirement per open/in-progress order (required kg vs already issued)
CREATE OR REPLACE VIEW rm_requirement AS
SELECT
  o.id           AS order_id,
  o.order_no,
  o.order_date,
  o.order_qty,
  o.due_date,
  o.status,
  c.customer_name,
  s.screw_code,
  s.screw_name,
  s.conversion_ratio_per_kg,
  w.diameter_mm,
  w.grade,
  ROUND(o.order_qty::NUMERIC / s.conversion_ratio_per_kg, 3)           AS required_kg,
  COALESCE(issued.total_issued_kg, 0)                                   AS issued_kg,
  ROUND(o.order_qty::NUMERIC / s.conversion_ratio_per_kg, 3)
    - COALESCE(issued.total_issued_kg, 0)                               AS pending_kg
FROM orders o
JOIN customer_master     c ON c.id = o.customer_id
JOIN output_screw_master s ON s.id = o.screw_id
JOIN rm_wire_master      w ON w.id = s.rm_wire_id
LEFT JOIN (
  SELECT order_id, SUM(rm_qty_issued_kg) AS total_issued_kg
  FROM production_header
  WHERE order_id IS NOT NULL
  GROUP BY order_id
) issued ON issued.order_id = o.id
WHERE o.status IN ('Open', 'In Progress');

-- ─────────────────────────────────────────────────────────────────
-- 9. PLATING BATCH
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE plating_batch (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plating_lot_no      TEXT        UNIQUE NOT NULL DEFAULT '',
  date_sent           DATE        NOT NULL DEFAULT CURRENT_DATE,
  production_batch_id UUID        NOT NULL REFERENCES production_header(id),
  plating_type_id     UUID        NOT NULL REFERENCES plating_type_master(id),
  qty_sent_kg         NUMERIC     NOT NULL CHECK (qty_sent_kg > 0),
  date_received       DATE,
  qty_received_kg     NUMERIC,
  status              TEXT        NOT NULL DEFAULT 'Sent'
                                  CHECK (status IN ('Sent', 'Received')),
  created_by          UUID        REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- plating_loss_kg = qty_sent_kg - qty_received_kg (derived in application/query)

CREATE OR REPLACE FUNCTION generate_plating_lot_no()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.plating_lot_no IS NULL OR NEW.plating_lot_no = '' THEN
    NEW.plating_lot_no := 'PL-' || LPAD(nextval('plating_lot_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_plating_lot_no
  BEFORE INSERT ON plating_batch
  FOR EACH ROW
  EXECUTE FUNCTION generate_plating_lot_no();

-- ─────────────────────────────────────────────────────────────────
-- 10. DISPATCH
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE dispatch (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  date             DATE        NOT NULL DEFAULT CURRENT_DATE,
  dc_no            TEXT        NOT NULL,
  order_id         UUID        NOT NULL REFERENCES orders(id),
  customer_id      UUID        NOT NULL REFERENCES customer_master(id),
  screw_id         UUID        NOT NULL REFERENCES output_screw_master(id),
  plating_batch_id UUID        REFERENCES plating_batch(id),
  qty_dispatched   INTEGER     NOT NULL CHECK (qty_dispatched > 0),
  vehicle_no       TEXT,
  status           TEXT        NOT NULL DEFAULT 'Ready'
                               CHECK (status IN ('Ready', 'Dispatched', 'On Hold')),
  created_by       UUID        REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Auto-complete order when cumulative dispatched >= order_qty
CREATE OR REPLACE FUNCTION check_order_completion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total_dispatched INTEGER;
  v_order_qty        INTEGER;
BEGIN
  SELECT COALESCE(SUM(qty_dispatched), 0) INTO v_total_dispatched
  FROM dispatch WHERE order_id = NEW.order_id;

  SELECT order_qty INTO v_order_qty FROM orders WHERE id = NEW.order_id;

  IF v_total_dispatched >= v_order_qty THEN
    UPDATE orders SET status = 'Completed'   WHERE id = NEW.order_id;
  ELSIF v_total_dispatched > 0 THEN
    UPDATE orders SET status = 'In Progress' WHERE id = NEW.order_id AND status = 'Open';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_order_completion
  AFTER INSERT OR UPDATE ON dispatch
  FOR EACH ROW
  EXECUTE FUNCTION check_order_completion();

-- =================================================================
-- ROW LEVEL SECURITY
-- All tables: authenticated users have full read/write access.
-- Extend per-user scoping here later if multi-tenant isolation needed.
-- =================================================================
ALTER TABLE machines              ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_wire_master        ENABLE ROW LEVEL SECURITY;
ALTER TABLE output_screw_master   ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_master       ENABLE ROW LEVEL SECURITY;
ALTER TABLE plating_type_master   ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_lot                ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_header     ENABLE ROW LEVEL SECURITY;
ALTER TABLE plating_batch         ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch              ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_full" ON machines              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full" ON rm_wire_master        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full" ON output_screw_master   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full" ON customer_master       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full" ON plating_type_master   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full" ON orders                FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full" ON rm_lot                FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full" ON production_header     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full" ON plating_batch         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full" ON dispatch              FOR ALL TO authenticated USING (true) WITH CHECK (true);
