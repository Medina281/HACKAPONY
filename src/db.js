import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// Esquema relacional. Dinero en centavos (INTEGER), cantidades en gramos (INTEGER),
// fechas en milisegundos epoch (INTEGER). Restricciones CHECK y claves foráneas
// protegen la consistencia aun si alguien omite una validación en el código.
const MIGRATIONS = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('productor','comprador','admin')),
    name TEXT NOT NULL,
    business_name TEXT,
    business_type TEXT,
    email TEXT UNIQUE COLLATE NOCASE,
    phone TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    municipality TEXT NOT NULL DEFAULT 'morelia',
    pickup_point TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE lots (
    id INTEGER PRIMARY KEY,
    producer_id INTEGER NOT NULL REFERENCES users(id),
    product TEXT NOT NULL,
    category TEXT NOT NULL,
    quality TEXT NOT NULL CHECK (quality IN ('excedente','imperfeccion','maduro','proximo')),
    total_g INTEGER NOT NULL CHECK (total_g > 0),
    available_g INTEGER NOT NULL CHECK (available_g >= 0 AND available_g <= total_g),
    min_g INTEGER NOT NULL CHECK (min_g > 0),
    allow_partial INTEGER NOT NULL DEFAULT 1,
    ref_price_c INTEGER NOT NULL CHECK (ref_price_c > 0),
    rescue_price_c INTEGER NOT NULL CHECK (rescue_price_c > 0),
    original_rescue_price_c INTEGER NOT NULL,
    fresh_hours REAL NOT NULL,
    expires_at INTEGER NOT NULL,
    municipality TEXT NOT NULL,
    pickup_point TEXT,
    pickup_window TEXT,
    producer_transport INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    photo TEXT,
    status TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','pausado','retirado')),
    declaration_ok INTEGER NOT NULL CHECK (declaration_ok = 1),
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    CHECK (rescue_price_c < ref_price_c)
  );
  CREATE INDEX idx_lots_feed ON lots(status, expires_at);
  CREATE INDEX idx_lots_producer ON lots(producer_id);

  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    folio TEXT UNIQUE,
    lot_id INTEGER NOT NULL REFERENCES lots(id),
    buyer_id INTEGER NOT NULL REFERENCES users(id),
    producer_id INTEGER NOT NULL REFERENCES users(id),
    qty_g INTEGER NOT NULL CHECK (qty_g > 0),
    unit_ref_c INTEGER NOT NULL,
    unit_rescue_c INTEGER NOT NULL,
    total_ref_c INTEGER NOT NULL,
    total_rescue_c INTEGER NOT NULL,
    savings_c INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('apartado','confirmado','listo','recolectado','cancelado','vencido')),
    pickup_at INTEGER NOT NULL,
    hold_until INTEGER NOT NULL,
    delivery_code TEXT NOT NULL,
    cancel_reason TEXT,
    cancelled_by INTEGER REFERENCES users(id),
    delivered_at INTEGER,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_orders_buyer ON orders(buyer_id, status);
  CREATE INDEX idx_orders_producer ON orders(producer_id, status);
  CREATE INDEX idx_orders_lot ON orders(lot_id);
  CREATE INDEX idx_orders_hold ON orders(status, hold_until);

  CREATE TABLE order_events (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    actor_id INTEGER REFERENCES users(id),
    note TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE inventory_movements (
    id INTEGER PRIMARY KEY,
    lot_id INTEGER NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id),
    delta_g INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE price_history (
    id INTEGER PRIMARY KEY,
    lot_id INTEGER NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
    old_c INTEGER NOT NULL,
    new_c INTEGER NOT NULL,
    actor_id INTEGER REFERENCES users(id),
    reason TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE reports (
    id INTEGER PRIMARY KEY,
    lot_id INTEGER REFERENCES lots(id),
    order_id INTEGER REFERENCES orders(id),
    reporter_id INTEGER NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'abierto' CHECK (status IN ('abierto','resuelto','descartado')),
    resolution TEXT,
    resolved_by INTEGER REFERENCES users(id),
    created_at INTEGER NOT NULL
  );

  CREATE TABLE templates (
    id INTEGER PRIMARY KEY,
    producer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE notifications (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    link TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_notif_user ON notifications(user_id, read);
  `,
  // v2: cómo se capturó la publicación y la estimación de vida útil por clima (instantánea al publicar)
  `
  ALTER TABLE lots ADD COLUMN input_method TEXT NOT NULL DEFAULT 'formulario'
    CHECK (input_method IN ('formulario','voz','frase'));
  ALTER TABLE lots ADD COLUMN shelf_json TEXT;
  `,
  // v3: rol transportista (se reconstruye users para ampliar el CHECK de roles) y fletes
  {
    fkOff: true,
    sql: `
  CREATE TABLE users_new (
    id INTEGER PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('productor','comprador','transportista','admin')),
    name TEXT NOT NULL,
    business_name TEXT,
    business_type TEXT,
    email TEXT UNIQUE COLLATE NOCASE,
    phone TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    municipality TEXT NOT NULL DEFAULT 'morelia',
    pickup_point TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    vehicle TEXT,
    capacity_kg INTEGER CHECK (capacity_kg IS NULL OR capacity_kg > 0),
    refrigerated INTEGER NOT NULL DEFAULT 0,
    radius_km INTEGER NOT NULL DEFAULT 40,
    available INTEGER NOT NULL DEFAULT 1
  );
  INSERT INTO users_new (id, role, name, business_name, business_type, email, phone, password_hash, municipality, pickup_point, active, is_demo, created_at)
    SELECT id, role, name, business_name, business_type, email, phone, password_hash, municipality, pickup_point, active, is_demo, created_at FROM users;
  DROP TABLE users;
  ALTER TABLE users_new RENAME TO users;

  CREATE TABLE deliveries (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
    buyer_id INTEGER NOT NULL REFERENCES users(id),
    producer_id INTEGER NOT NULL REFERENCES users(id),
    carrier_id INTEGER REFERENCES users(id),
    from_muni TEXT NOT NULL,
    to_muni TEXT NOT NULL,
    address TEXT NOT NULL,
    distance_km REAL NOT NULL,
    weight_g INTEGER NOT NULL,
    fee_c INTEGER NOT NULL CHECK (fee_c > 0),
    needs_cold INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    pickup_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta','asignada','recogida','entregada','cancelada')),
    cancel_reason TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    assigned_at INTEGER,
    picked_at INTEGER,
    delivered_at INTEGER
  );
  CREATE INDEX idx_deliv_status ON deliveries(status, from_muni);
  CREATE INDEX idx_deliv_carrier ON deliveries(carrier_id, status);
  `,
  },
  // v4: precios de mercado del SNIIM (caché) y origen del precio de referencia de cada lote
  `
  CREATE TABLE market_prices (
    id INTEGER PRIMARY KEY,
    product TEXT NOT NULL,
    sniim_id INTEGER NOT NULL,
    variety TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('morelia','nacional')),
    market TEXT NOT NULL,
    price_date TEXT,
    freq_c INTEGER NOT NULL CHECK (freq_c > 0),
    min_c INTEGER,
    max_c INTEGER,
    n_markets INTEGER NOT NULL DEFAULT 1,
    source_url TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );
  CREATE INDEX idx_market_product ON market_prices(product, fetched_at);
  CREATE TABLE market_fetch_log (id INTEGER PRIMARY KEY, product TEXT NOT NULL, ok INTEGER NOT NULL, error TEXT, fetched_at INTEGER NOT NULL);
  ALTER TABLE lots ADD COLUMN ref_source TEXT NOT NULL DEFAULT 'declarado' CHECK (ref_source IN ('declarado','sniim'));
  ALTER TABLE lots ADD COLUMN ref_market_json TEXT;
  `,
  // v5: el transportista trabaja para un productor (no es un servicio independiente) y la entrega no lleva tarifa en la app
  {
    fkOff: true,
    sql: `
  ALTER TABLE users ADD COLUMN employer_id INTEGER REFERENCES users(id);
  CREATE TABLE deliveries_new (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
    buyer_id INTEGER NOT NULL REFERENCES users(id),
    producer_id INTEGER NOT NULL REFERENCES users(id),
    carrier_id INTEGER REFERENCES users(id),
    from_muni TEXT NOT NULL,
    to_muni TEXT NOT NULL,
    address TEXT NOT NULL,
    distance_km REAL NOT NULL,
    weight_g INTEGER NOT NULL,
    fee_c INTEGER NOT NULL DEFAULT 0 CHECK (fee_c >= 0),
    needs_cold INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    pickup_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta','asignada','recogida','entregada','cancelada')),
    cancel_reason TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    assigned_at INTEGER,
    picked_at INTEGER,
    delivered_at INTEGER
  );
  INSERT INTO deliveries_new SELECT id, order_id, buyer_id, producer_id, carrier_id, from_muni, to_muni, address, distance_km, weight_g, 0, needs_cold, notes,
    pickup_code, status, cancel_reason, is_demo, created_at, assigned_at, picked_at, delivered_at FROM deliveries;
  DROP TABLE deliveries;
  ALTER TABLE deliveries_new RENAME TO deliveries;
  CREATE INDEX idx_deliv_status ON deliveries(producer_id, status);
  CREATE INDEX idx_deliv_carrier ON deliveries(carrier_id, status);
  CREATE INDEX idx_users_employer ON users(employer_id);
  UPDATE users SET employer_id = (SELECT id FROM users WHERE phone = '4430000001' AND is_demo = 1) WHERE phone = '4430000201' AND is_demo = 1;
  UPDATE users SET employer_id = (SELECT id FROM users WHERE phone = '4430000002' AND is_demo = 1) WHERE phone = '4430000202' AND is_demo = 1;
  `,
  },
  // v6: seguimiento en vivo de la entrega (última posición del transportista y punto exacto de entrega opcional)
  `
  ALTER TABLE deliveries ADD COLUMN pos_lat REAL;
  ALTER TABLE deliveries ADD COLUMN pos_lng REAL;
  ALTER TABLE deliveries ADD COLUMN pos_acc REAL;
  ALTER TABLE deliveries ADD COLUMN pos_at INTEGER;
  ALTER TABLE deliveries ADD COLUMN dest_lat REAL;
  ALTER TABLE deliveries ADD COLUMN dest_lng REAL;
  `,
  // v7: código de equipo del proveedor (el transportista se registra solo con ese código)
  `
  ALTER TABLE users ADD COLUMN team_code TEXT;
  CREATE UNIQUE INDEX idx_users_team_code ON users(team_code) WHERE team_code IS NOT NULL;
  `,
  // v8: tarifa de envío que fija cada proveedor (cargo base + por km); el costo se calcula y se guarda al apartar
  `
  ALTER TABLE users ADD COLUMN delivery_base_c INTEGER CHECK (delivery_base_c IS NULL OR delivery_base_c >= 0);
  ALTER TABLE users ADD COLUMN delivery_per_km_c INTEGER CHECK (delivery_per_km_c IS NULL OR delivery_per_km_c >= 0);
  `,
];

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL)');
  const row = db.prepare('SELECT v FROM schema_version').get();
  let v = row ? row.v : 0;
  if (!row) db.prepare('INSERT INTO schema_version (v) VALUES (0)').run();
  for (; v < MIGRATIONS.length; v++) {
    const m = typeof MIGRATIONS[v] === 'string' ? { sql: MIGRATIONS[v] } : MIGRATIONS[v];
    // Reconstruir una tabla con claves foráneas exige desactivarlas fuera de la transacción.
    if (m.fkOff) db.exec('PRAGMA foreign_keys = OFF');
    tx(db, () => {
      db.exec(m.sql);
      if (m.fkOff) {
        const bad = db.prepare('PRAGMA foreign_key_check').all();
        if (bad.length) throw new Error('Migración rompe claves foráneas');
      }
      db.prepare('UPDATE schema_version SET v = ?').run(v + 1);
    });
    if (m.fkOff) db.exec('PRAGMA foreign_keys = ON');
  }
  return db;
}

/** Ejecuta fn dentro de BEGIN IMMEDIATE: toma el candado de escritura desde el inicio. */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
