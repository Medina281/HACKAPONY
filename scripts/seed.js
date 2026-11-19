// Datos de DEMOSTRACIÓN (ficticios). Personas, negocios, teléfonos y precios son inventados;
// no representan alianzas reales ni precios de mercado. Todo queda marcado con is_demo = 1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
import { createLot } from '../src/services/lots.js';
import { reserve, transition } from '../src/services/orders.js';
import { requestDelivery, actOnDelivery } from '../src/services/deliveries.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function seed(dbPath = path.join(ROOT, 'data', 'raiz.db'), { now = Date.now(), uploadsDir } = {}) {
  if (dbPath !== ':memory:') for (const ext of ['', '-wal', '-shm']) fs.rmSync(dbPath + ext, { force: true });
  const db = openDb(dbPath);
  const H = 3600e3;
  const pw = hashPassword('demo1234');
  const users = {};
  const addUser = (key, u) => {
    const r = db
      .prepare(
        `INSERT INTO users (role, name, business_name, business_type, email, phone, password_hash, municipality, pickup_point, is_demo, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,1,?)`,
      )
      .run(u.role, u.name, u.business || null, u.type || null, u.email || null, u.phone, pw, u.muni, u.pickup || null, now - 20 * 24 * H);
    users[key] = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
  };

  addUser('ramiro', { role: 'productor', name: 'Ramiro Hernández', phone: '4430000001', email: 'productor@demo.mx', muni: 'tarimbaro', pickup: 'Entrada del rancho, camino a Cuto del Porvenir (referencia ficticia)' });
  addUser('encinos', { role: 'productor', name: 'Huerta Los Encinos', business: 'Huerta Los Encinos', phone: '4430000002', muni: 'uruapan', pickup: 'Empaque de la huerta, salida a Tancítaro (ficticio)' });
  addUser('carmen', { role: 'productor', name: 'Carmen Ruiz', business: 'Fresas Doña Carmen', phone: '4430000003', muni: 'zamora', pickup: 'Bodega junto a la carretera Zamora–Jacona (ficticio)' });
  addUser('quiroga', { role: 'productor', name: 'Javier Torres', business: 'Distribuidora Torres Quiroga', phone: '4430000004', muni: 'quiroga', pickup: 'Bodega en la entrada de Quiroga (ficticio)' });
  addUser('cuitzeo', { role: 'productor', name: 'Elena Morales', business: 'Hortalizas del Lago', phone: '4430000005', muni: 'cuitzeo', pickup: 'Parcela a orilla de la carretera a Cuitzeo (ficticio)' });
  addUser('zina', { role: 'productor', name: 'Pedro Sánchez', business: 'Guayabas Sánchez', phone: '4430000006', muni: 'zinapecuaro', pickup: 'Huerta en la salida a Maravatío (ficticio)' });
  addUser('patz', { role: 'productor', name: 'Rosa Ayala', business: 'Productores de la Meseta', phone: '4430000007', muni: 'patzcuaro', pickup: 'Patio de acopio, salida a Santa Clara (ficticio)' });
  addUser('lupe', { role: 'comprador', name: 'Guadalupe Martínez', business: 'Fonda Doña Lupe', type: 'fonda', phone: '4430000101', email: 'comprador@demo.mx', muni: 'morelia' });
  addUser('mercadito', { role: 'comprador', name: 'Luis Cárdenas', business: 'Frutería El Mercadito', type: 'fruteria', phone: '4430000102', muni: 'morelia' });
  addUser('juguera', { role: 'comprador', name: 'Ana Villaseñor', business: 'Juguería La Huerta', type: 'jugueria', phone: '4430000103', muni: 'tarimbaro' });
  addUser('comedor', { role: 'comprador', name: 'Martín Ochoa', business: 'Comedor Los Arcos', type: 'comedor', phone: '4430000104', muni: 'morelia' });
  addUser('fletes1', { role: 'transportista', name: 'Raúl Pérez', phone: '4430000201', email: 'transportista@demo.mx', muni: 'morelia' });
  addUser('fletes2', { role: 'transportista', name: 'Sofía Guzmán', phone: '4430000202', muni: 'tarimbaro' });
  db.prepare("UPDATE users SET vehicle='Camioneta 3.5 t', capacity_kg=1500, refrigerated=0, radius_km=60 WHERE phone='4430000201'").run();
  db.prepare("UPDATE users SET vehicle='Camioneta refrigerada', capacity_kg=800, refrigerated=1, radius_km=80 WHERE phone='4430000202'").run();
  for (const k of ['fletes1', 'fletes2']) users[k] = db.prepare('SELECT * FROM users WHERE id = ?').get(users[k].id);
  addUser('admin', { role: 'admin', name: 'Administración Raíz Directa', phone: '4430000999', email: 'admin@demo.mx', muni: 'morelia' });

  const opts = { uploadsDir: uploadsDir || path.join(ROOT, 'data', 'uploads'), isDemo: 1 };
  const lot = (who, at, b) => createLot(db, at, users[who], { declaration: true, ...b }, opts);
  const order = (who, lotId, kg, at, pickupIn = 2) =>
    reserve(db, at, users[who], lotId, { kg, pickup_at: at + pickupIn * H }, { isDemo: 1 });
  const deliver = (folio, producerKey, at) => {
    const code = db.prepare('SELECT delivery_code FROM orders WHERE folio = ?').get(folio).delivery_code;
    transition(db, at, users[producerKey], folio, 'confirmar');
    transition(db, at + 0.5 * H, users[producerKey], folio, 'listo');
    transition(db, at + H, users[producerKey], folio, 'entregar', { code });
  };

  // ---- Historial (días anteriores) para que el dashboard muestre operaciones completas ----
  const d3 = now - 72 * H;
  const old1 = lot('ramiro', d3, { product: 'Jitomate', category: 'verdura', quality: 'maduro', kg: 60, ref_price: 24, rescue_price: 13, hours: 24, min_kg: 5, pickup_window: '7:00 a 11:00', notes: 'Saladette maduro, ideal para salsa.' });
  deliver(order('lupe', old1, 25, d3 + 2 * H), 'ramiro', d3 + 3 * H);
  deliver(order('comedor', old1, 30, d3 + 4 * H), 'ramiro', d3 + 5 * H);

  const d2 = now - 48 * H;
  const old2 = lot('carmen', d2, { product: 'Fresa', category: 'fruta', quality: 'maduro', kg: 40, ref_price: 55, rescue_price: 30, hours: 12, min_kg: 5, notes: 'Fresa madura para aguas y mermelada.' });
  deliver(order('juguera', old2, 20, d2 + H), 'carmen', d2 + 2 * H);
  const c1 = order('mercadito', old2, 10, d2 + 2 * H);
  transition(db, d2 + 3 * H, users.mercadito, c1, 'cancelar', { reason: 'Ya no lo necesito' });

  const d1 = now - 26 * H;
  const old3 = lot('cuitzeo', d1, { product: 'Calabacita', category: 'verdura', quality: 'imperfeccion', kg: 35, ref_price: 18, rescue_price: 10, hours: 20, min_kg: 3 });
  deliver(order('lupe', old3, 15, d1 + H), 'cuitzeo', d1 + 2 * H);
  const old4 = lot('encinos', d1, { product: 'Aguacate', category: 'fruta', quality: 'maduro', kg: 80, ref_price: 48, rescue_price: 30, hours: 22, min_kg: 5 });
  deliver(order('mercadito', old4, 40, d1 + H), 'encinos', d1 + 3 * H);
  // Flete histórico: aguacate de Uruapan llevado a Morelia por el transportista demo
  const fol = order('lupe', old4, 20, d1 + 1.5 * H, 5);
  const oid = db.prepare('SELECT id FROM orders WHERE folio = ?').get(fol).id;
  const did = requestDelivery(db, d1 + 1.6 * H, users.lupe, { folio: fol, address: 'Av. Madero Poniente 1200, Centro (ficticio)', fee: 450, to_muni: 'morelia' });
  db.prepare('UPDATE deliveries SET is_demo = 1 WHERE id = ?').run(did);
  actOnDelivery(db, d1 + 1.7 * H, users.fletes1, did, 'accept');
  transition(db, d1 + 1.8 * H, users.encinos, fol, 'confirmar');
  const pc = db.prepare('SELECT pickup_code FROM deliveries WHERE id = ?').get(did).pickup_code;
  actOnDelivery(db, d1 + 2.5 * H, users.encinos, did, 'handoff', { code: pc });
  const dc = db.prepare('SELECT delivery_code FROM orders WHERE id = ?').get(oid).delivery_code;
  actOnDelivery(db, d1 + 4.5 * H, users.fletes1, did, 'deliver', { code: dc });

  // Lote que venció sin venderse por completo (merma visible en el dashboard)
  lot('zina', now - 30 * H, { product: 'Guayaba', category: 'fruta', quality: 'proximo', kg: 30, ref_price: 20, rescue_price: 10, hours: 26 });

  // ---- Ofertas vigentes ----
  const t = now - 10 * 60e3;
  lot('encinos', t, { product: 'Aguacate', category: 'fruta', quality: 'maduro', kg: 200, min_kg: 10, ref_price: 45, rescue_price: 28, hours: 30, pickup_window: '8:00 a 14:00', producer_transport: true, notes: 'Hass maduro, listo para guacamole del día. Puedo llevarlo a Uruapan centro.' });
  lot('carmen', t, { product: 'Fresa', category: 'fruta', quality: 'maduro', kg: 60, min_kg: 5, ref_price: 50, rescue_price: 30, hours: 5, pickup_window: 'Hoy antes de las 18:00', notes: 'Muy madura: para aguas frescas, licuados y mermelada.' });
  lot('zina', t, { product: 'Guayaba', category: 'fruta', quality: 'imperfeccion', kg: 80, min_kg: 5, ref_price: 22, rescue_price: 12, hours: 20, notes: 'Tamaño irregular, buen sabor.' });
  lot('quiroga', t, { product: 'Limón', category: 'fruta', quality: 'excedente', kg: 120, min_kg: 10, ref_price: 28, rescue_price: 16, hours: 40, pickup_window: '9:00 a 17:00', producer_transport: true });
  lot('quiroga', t, { product: 'Mango', category: 'fruta', quality: 'proximo', kg: 90, min_kg: 10, ref_price: 30, rescue_price: 15, hours: 3, notes: 'Ya maduro, para pulpa o aguas.' });
  lot('cuitzeo', t, { product: 'Calabacita', category: 'verdura', quality: 'imperfeccion', kg: 50, min_kg: 5, ref_price: 18, rescue_price: 9, hours: 26 });
  lot('cuitzeo', t, { product: 'Cebolla', category: 'verdura', quality: 'excedente', kg: 150, min_kg: 10, ref_price: 16, rescue_price: 10, hours: 70 });
  lot('patz', t, { product: 'Papa', category: 'tuberculo', quality: 'imperfeccion', kg: 200, min_kg: 20, ref_price: 20, rescue_price: 13, hours: 96, notes: 'Calibre chico, ideal para guisos.' });
  lot('encinos', t, { product: 'Plátano', category: 'fruta', quality: 'maduro', kg: 70, min_kg: 5, ref_price: 18, rescue_price: 9, hours: 10, notes: 'Pintón a maduro.' });
  // Agotado: se apartó completo
  const sold = lot('zina', t, { product: 'Jitomate', category: 'verdura', quality: 'excedente', kg: 40, min_kg: 5, ref_price: 22, rescue_price: 12, hours: 18 });
  order('comedor', sold, 40, t + 60e3, 3);
  // Pedido activo para el comprador demo
  const papa = db.prepare("SELECT id FROM lots WHERE product='Papa' AND expires_at > ?").get(now).id;
  const papaFolio = order('lupe', papa, 30, t + 2 * 60e3, 4);
  const openDid = requestDelivery(db, t + 3 * 60e3, users.lupe, { folio: papaFolio, address: 'Calle Allende 345, Centro, Morelia (ficticio)', fee: 380, to_muni: 'morelia', notes: 'Entregar por la puerta lateral' });
  db.prepare('UPDATE deliveries SET is_demo = 1 WHERE id = ?').run(openDid);
  // Pedido pendiente de confirmar para un productor (panel con algo que atender)
  const guay = db.prepare("SELECT id FROM lots WHERE product='Guayaba' AND expires_at > ?").get(now).id;
  order('juguera', guay, 15, t + 3 * 60e3, 3);

  db.close();
  return users;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  seed();
  console.log('✔ Base de datos de demostración creada en data/raiz.db (datos ficticios, marcados como demo).');
}
