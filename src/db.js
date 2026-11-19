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
    tx(db, () => {
      db.exec(MIGRATIONS[v]);
      db.prepare('UPDATE schema_version SET v = ?').run(v + 1);
    });
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
