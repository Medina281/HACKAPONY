import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client, user, JITOMATE } from './helpers.js';
import { parseMulti } from '../public/js/shared/parse.js';
import { parseSniimHtml, pickPrice, sniimUrl } from '../src/services/market.js';

let app, prod, prod2, buyer, carrier, carrier2;
before(async () => {
  app = await startApp();
  prod = await user(app.base, 'productor');
  prod2 = await user(app.base, 'productor');
  buyer = await user(app.base, 'comprador');
  // El productor da de alta a su propio transportista
  const r = await prod.post('/api/producer/drivers', { name: 'Chofer Uno', phone: '4437770001', password: 'secreta123', vehicle: 'Camioneta', capacity_kg: 1500 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  carrier = client(app.base);
  await carrier.post('/api/auth/login', { identifier: '4437770001', password: 'secreta123' });
  carrier.id = r.body.id;
  const r2 = await prod2.post('/api/producer/drivers', { name: 'Chofer Otro', phone: '4437770002', password: 'secreta123', vehicle: 'Pickup', capacity_kg: 500 });
  carrier2 = client(app.base);
  await carrier2.post('/api/auth/login', { identifier: '4437770002', password: 'secreta123' });
  carrier2.id = r2.body.id;
  // Cada proveedor fija su tarifa de envío
  for (const p of [prod, prod2]) assert.equal((await p.post('/api/producer/delivery-tariff', { base: 25, per_km: 4 })).status, 200);
});
after(() => app.close());

const DELIVERS = { ...JITOMATE, producer_transport: true };
async function orderWithDelivery(kg = 20, extra = {}) {
  const { body: { lot } } = await prod.post('/api/lots', DELIVERS);
  const { body: o } = await buyer.post(`/api/lots/${lot.id}/reserve`, { kg });
  const r = await buyer.post('/api/deliveries', { folio: o.folio, address: 'Calle Falsa 123, Centro', ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { folio: o.folio, code: o.order.delivery_code, id: r.body.delivery.id, lot };
}

describe('Transportista del productor', () => {
  test('el transportista crea su propia cuenta sólo con el código de equipo de su proveedor', async () => {
    const sin = await client(app.base).post('/api/auth/register', { role: 'transportista', name: 'Libre', phone: '4438887777', password: 'secreta123', municipality: 'morelia' });
    assert.equal(sin.status, 400);
    assert.ok(sin.body.fields.team_code);
    const mal = await client(app.base).post('/api/auth/register', { role: 'transportista', name: 'Libre', phone: '4438887777', password: 'secreta123', municipality: 'morelia', team_code: 'ZZZZZZ' });
    assert.equal(mal.status, 400);
    const { team_code } = (await prod.get('/api/producer/drivers')).body;
    assert.match(team_code, /^[A-Z2-9]{6}$/);
    const nuevo = client(app.base);
    const ok = await nuevo.post('/api/auth/register', { role: 'transportista', name: 'Chofer Propio', phone: '4438887777', password: 'secreta123', municipality: 'morelia', team_code: team_code.toLowerCase() });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const me = (await nuevo.get('/api/carrier/summary')).body;
    assert.ok(me.employer, 'queda ligado a su proveedor');
    assert.ok((await prod.get('/api/producer/drivers')).body.drivers.some((d) => d.name === 'Chofer Propio'), 'el proveedor lo ve en su equipo');
    assert.equal((await nuevo.get('/api/deliveries')).body.deliveries.length, 0, 'no ve entregas que no le asignaron');
    // Cambiar el código invalida el anterior
    await prod.post('/api/producer/team-code');
    const viejo = await client(app.base).post('/api/auth/register', { role: 'transportista', name: 'Otro', phone: '4438887778', password: 'secreta123', municipality: 'morelia', team_code });
    assert.equal(viejo.status, 400);
    assert.equal((await buyer.post('/api/producer/drivers', { name: 'X', phone: '4437770009', password: 'secreta123', capacity_kg: 100 })).status, 403);
  });

  test('el proveedor ve su flota en vivo', async () => {
    const f = await orderWithDelivery(5);
    await prod.post(`/api/deliveries/${f.id}/assign`, { carrier_id: carrier.id });
    await prod.post(`/api/orders/${f.folio}/confirmar`);
    await carrier.post(`/api/deliveries/${f.id}/pickup`);
    await carrier.post(`/api/deliveries/${f.id}/position`, { lat: 19.75, lng: -101.18, acc: 10 });
    const fleet = (await prod.get('/api/producer/fleet')).body.fleet;
    const mine = fleet.find((x) => x.id === f.id);
    assert.ok(mine.position && mine.eta_min > 0);
    assert.equal((await prod2.get('/api/producer/fleet')).body.fleet.some((x) => x.id === f.id), false, 'otro proveedor no la ve');
    assert.equal((await buyer.get('/api/producer/fleet')).status, 403);
    const orders = (await buyer.get('/api/orders')).body.orders;
    assert.equal(orders.find((o) => o.folio === f.folio).delivery_status, 'recogida', 'el cliente ve que va en camino en su lista');
    await carrier.post(`/api/deliveries/${f.id}/deliver`, { code: f.code });
  });

  test('flujo: comercio pide entrega → productor asigna a SU transportista → carga → entrega con código', async () => {
    const f = await orderWithDelivery();
    assert.equal((await carrier.get('/api/deliveries')).body.deliveries.some((d) => d.id === f.id), false, 'no ve entregas sin asignar');
    // No puede asignarla a un transportista de otro productor
    assert.equal((await prod.post(`/api/deliveries/${f.id}/assign`, { carrier_id: carrier2.id })).status, 400);
    // Otro productor no puede asignar
    assert.equal((await prod2.post(`/api/deliveries/${f.id}/assign`, { carrier_id: carrier2.id })).status, 403);
    const a = await prod.post(`/api/deliveries/${f.id}/assign`, { carrier_id: carrier.id });
    assert.equal(a.body.delivery.status, 'asignada');
    const mine = (await carrier.get('/api/deliveries')).body.deliveries.find((d) => d.id === f.id);
    assert.ok(mine.buyer.address, 've la dirección de entrega');
    assert.equal((await carrier2.get(`/api/deliveries/${f.id}`)).status, 403, 'otro transportista no la ve');
    // No puede cargar hasta que el productor confirme
    assert.equal((await carrier.post(`/api/deliveries/${f.id}/pickup`)).status, 409);
    await prod.post(`/api/orders/${f.folio}/confirmar`);
    assert.equal((await prod.post(`/api/orders/${f.folio}/entregar`, { code: f.code })).status, 409, 'lo entrega su transportista');
    assert.equal((await carrier.post(`/api/deliveries/${f.id}/pickup`)).body.delivery.status, 'recogida');
    assert.equal((await buyer.post(`/api/orders/${f.folio}/cancelar`, { reason: 'x' })).status, 409, 'ya va en camino');
    assert.equal((await carrier.post(`/api/deliveries/${f.id}/deliver`, { code: '111111' })).status, 400);
    const done = await carrier.post(`/api/deliveries/${f.id}/deliver`, { code: f.code });
    assert.equal(done.body.delivery.status, 'entregada');
    assert.equal((await buyer.get(`/api/orders/${f.folio}`)).body.order.status, 'recolectado');
    const s = (await carrier.get('/api/carrier/summary')).body.summary;
    assert.ok(s.delivered >= 1);
  });

  test('toda oferta nueva admite envío a domicilio; capacidad del vehículo se respeta', async () => {
    const { body: { lot } } = await prod.post('/api/lots', { ...JITOMATE, producer_transport: false });
    assert.equal(lot.producer_transport, true, 'siempre con envío a domicilio');
    const { body: o } = await buyer.post(`/api/lots/${lot.id}/reserve`, { kg: 10 });
    assert.equal((await prod.post('/api/deliveries', { folio: o.folio, address: 'Calle 1 #2' })).status, 403);
    assert.equal((await buyer.post('/api/deliveries', { folio: o.folio, address: 'Calle 1 #2' })).status, 201);
    const big = await prod2.post('/api/lots', { ...DELIVERS, kg: 900 });
    const { body: o2 } = await buyer.post(`/api/lots/${big.body.lot.id}/reserve`, { kg: 800 });
    const d = await buyer.post('/api/deliveries', { folio: o2.folio, address: 'Calle 1 #2' });
    assert.equal((await prod2.post(`/api/deliveries/${d.body.delivery.id}/assign`, { carrier_id: carrier2.id })).status, 400, 'supera 500 kg');
  });

  test('dar de baja a un transportista con entregas en curso no se permite; cancelar pedido cancela la entrega', async () => {
    const f = await orderWithDelivery(5);
    await prod.post(`/api/deliveries/${f.id}/assign`, { carrier_id: carrier.id });
    assert.equal((await prod.patch(`/api/producer/drivers/${carrier.id}`, { active: false })).status, 409);
    await buyer.post(`/api/orders/${f.folio}/cancelar`, { reason: 'Ya no lo necesito' });
    assert.equal((await buyer.get(`/api/orders/${f.folio}`)).body.order.delivery.status, 'cancelada');
  });
});

describe('Envío a domicilio con la tarifa del proveedor', () => {
  test('el comercio elige "que me lo traigan" al apartar: costo calculado por el servidor y fijo', async () => {
    assert.equal((await buyer.post('/api/producer/delivery-tariff', { base: 1, per_km: 1 })).status, 403, 'el comercio no fija tarifas');
    assert.equal((await prod.post('/api/producer/delivery-tariff', { base: -5, per_km: 4 })).status, 400);
    const { body: { lot } } = await prod.post('/api/lots', DELIVERS);
    const q = (await buyer.get(`/api/lots/${lot.id}/delivery-quote`)).body.quote;
    assert.ok(q.available && q.road_km >= 1);
    assert.equal(q.fee_c, Math.round((2500 + 400 * q.road_km) / 100) * 100);
    // Falta dirección → no se aparta nada
    const before = (await buyer.get(`/api/lots/${lot.id}`)).body.lot.available_g;
    assert.equal((await buyer.post(`/api/lots/${lot.id}/reserve`, { kg: 10, delivery: { address: 'x' } })).status, 400);
    assert.equal((await buyer.get(`/api/lots/${lot.id}`)).body.lot.available_g, before, 'sin apartado a medias');
    // Un fee enviado por el cliente se ignora
    const r = await buyer.post(`/api/lots/${lot.id}/reserve`, { kg: 10, fee_c: 1, delivery: { address: 'Av. Madero 100, Centro', fee_c: 1 } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.order.delivery.fee_c, q.fee_c);
    assert.equal(r.body.order.delivery.status, 'abierta', 'con varios transportistas, el proveedor elige');
    // Cambiar la tarifa después no altera un pedido ya hecho
    await prod.post('/api/producer/delivery-tariff', { base: 99, per_km: 9 });
    assert.equal((await buyer.get(`/api/orders/${r.body.folio}`)).body.order.delivery.fee_c, q.fee_c);
    await prod.post('/api/producer/delivery-tariff', { base: 25, per_km: 4 });
  });

  test('con un solo transportista, el pedido le llega directo como "nuevo pedido"', async () => {
    const solo = await user(app.base, 'productor');
    await solo.post('/api/producer/delivery-tariff', { base: 30, per_km: 5 });
    const r = await solo.post('/api/producer/drivers', { name: 'Único', phone: '4437770055', password: 'secreta123', vehicle: 'Pickup' });
    const chofer = client(app.base);
    await chofer.post('/api/auth/login', { identifier: '4437770055', password: 'secreta123' });
    const { body: { lot } } = await solo.post('/api/lots', DELIVERS);
    const o = await buyer.post(`/api/lots/${lot.id}/reserve`, { kg: 10, delivery: { address: 'Calle Real 5, Centro' } });
    assert.equal(o.body.order.delivery.status, 'asignada');
    const mine = (await chofer.get('/api/deliveries')).body.deliveries;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].fee_c, o.body.order.delivery.fee_c);
    assert.equal(mine[0].total_rescue_c, o.body.order.total_rescue_c, 've cuánto cobrar');
    const n = (await chofer.get('/api/notifications')).body;
    assert.ok(JSON.stringify(n).includes('Nuevo pedido'), 'le llega aviso de nuevo pedido');
    assert.ok(r.body.id);
  });

  test('un proveedor nuevo arranca con la tarifa inicial y puede dejar el envío gratis', async () => {
    const nuevo = await user(app.base, 'productor');
    assert.deepEqual((await nuevo.get('/api/producer/drivers')).body.tariff, { base_c: 2500, per_km_c: 400 });
    const { body: { lot } } = await nuevo.post('/api/lots', JITOMATE);
    assert.equal((await buyer.get(`/api/lots/${lot.id}/delivery-quote`)).body.quote.available, true);
    await nuevo.post('/api/producer/delivery-tariff', { base: 0, per_km: 0 });
    assert.equal((await buyer.get(`/api/lots/${lot.id}/delivery-quote`)).body.quote.fee_c, 0);
  });

  test('el proveedor rechaza un pedido y el comercio cancela otro; cada quien recibe el motivo', async () => {
    const { body: { lot } } = await prod.post('/api/lots', JITOMATE);
    const a = (await buyer.post(`/api/lots/${lot.id}/reserve`, { kg: 10, delivery: { address: 'Calle Real 5, Centro' } })).body;
    assert.equal((await prod.post(`/api/orders/${a.folio}/cancelar`, { reason: 'No tengo suficiente producto' })).status, 200);
    const o = (await buyer.get(`/api/orders/${a.folio}`)).body.order;
    assert.equal(o.status, 'cancelado');
    assert.equal(o.delivery.status, 'cancelada');
    assert.ok(JSON.stringify((await buyer.get('/api/notifications')).body).includes('rechazó tu pedido'));
    const b = (await buyer.post(`/api/lots/${lot.id}/reserve`, { kg: 10 })).body;
    assert.equal((await buyer.post(`/api/orders/${b.folio}/cancelar`, { reason: 'Ya no lo necesito' })).status, 200);
    assert.ok(JSON.stringify((await prod.get('/api/notifications')).body).includes('El comercio canceló'));
    assert.equal((await buyer.get(`/api/lots/${lot.id}`)).body.lot.available_g, lot.available_g, 'los kilos regresan');
  });
});

describe('Seguimiento en vivo', () => {
  test('el transportista comparte ubicación sólo en camino; comercio y productor ven tiempo estimado; nadie más', async () => {
    const f = await orderWithDelivery(10, { dest_lat: 19.7027, dest_lng: -101.1923 });
    await prod.post(`/api/deliveries/${f.id}/assign`, { carrier_id: carrier.id });
    await prod.post(`/api/orders/${f.folio}/confirmar`);
    const pos = { lat: 19.7942, lng: -101.1784, acc: 12 }; // Tarímbaro
    assert.equal((await carrier.post(`/api/deliveries/${f.id}/position`, pos)).status, 409, 'antes de salir no comparte');
    let t = (await buyer.get(`/api/deliveries/${f.id}/track`)).body.track;
    assert.equal(t.position, null);
    await carrier.post(`/api/deliveries/${f.id}/pickup`);
    assert.equal((await carrier2.post(`/api/deliveries/${f.id}/position`, pos)).status, 403, 'otro transportista no');
    assert.equal((await carrier.post(`/api/deliveries/${f.id}/position`, { lat: 40.7, lng: -74 })).status, 400, 'fuera de México');
    const r = await carrier.post(`/api/deliveries/${f.id}/position`, pos);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    t = (await buyer.get(`/api/deliveries/${f.id}/track`)).body.track;
    assert.deepEqual([t.position.lat, t.position.lng], [pos.lat, pos.lng]);
    assert.equal(t.dest.exact, true);
    // ~10.3 km en línea recta × 1.3 = 13.4 km a 35 km/h ≈ 23 min
    assert.equal(t.remaining_km, 13.4);
    assert.equal(t.eta_min, 23);
    assert.ok((await prod.get(`/api/deliveries/${f.id}/track`)).body.track.position, 'el productor también lo ve');
    const intruso = await user(app.base, 'comprador');
    assert.equal((await intruso.get(`/api/deliveries/${f.id}/track`)).status, 403);
    // Al entregar se deja de mostrar la ubicación
    await carrier.post(`/api/deliveries/${f.id}/deliver`, { code: f.code });
    t = (await buyer.get(`/api/deliveries/${f.id}/track`)).body.track;
    assert.equal(t.status, 'entregada');
    assert.equal(t.position, null);
    assert.equal((await carrier.post(`/api/deliveries/${f.id}/position`, pos)).status, 409);
  });
});

describe('Varios productos en un dictado', () => {
  test('divide jitomate y cebolla en dos productos con sus datos', () => {
    const r = parseMulti('Tengo cien kilos de jitomate a doce, normalmente a veinticinco, y cincuenta kilos de cebolla a ocho pesos, antes a quince, a los dos les quedan veinticuatro horas');
    assert.equal(r.length, 2);
    assert.deepEqual([r[0].product, r[0].kg, r[0].rescue_price, r[0].ref_price, r[0].hours], ['Jitomate', 100, 12, 25, 24]);
    assert.deepEqual([r[1].product, r[1].kg, r[1].rescue_price, r[1].ref_price, r[1].hours], ['Cebolla', 50, 8, 15, 24]);
  });
  test('sin "los dos", las horas no se copian a otro producto', () => {
    const r = parseMulti('100 kilos de jitomate a 12 normalmente 25 con 24 horas y 50 kilos de cebolla a 8 normalmente 15');
    assert.equal(r[0].hours, 24);
    assert.equal(r[1].hours, null);
  });
  test('publicación en lote: todo o nada', async () => {
    const ok = await prod.post('/api/lots/batch', { lots: [JITOMATE, { ...JITOMATE, product: 'Cebolla', kg: 50 }] });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.lots.length, 2);
    const bad = await prod.post('/api/lots/batch', { lots: [JITOMATE, { ...JITOMATE, product: 'Cebolla', kg: -1 }] });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /Producto 2/);
  });
});

describe('Reportes llegan a la administración', () => {
  test('el admin recibe aviso y quien reporta recibe la resolución', async () => {
    const { body: { lot } } = await prod.post('/api/lots', JITOMATE);
    // crear un admin directamente en la base (no se puede registrar como admin)
    const { hashPassword } = await import('../src/auth.js');
    app.db.prepare("INSERT INTO users (role, name, phone, password_hash, municipality, created_at) VALUES ('admin','Admin','4430009998',?, 'morelia', 0)").run(hashPassword('secreta123'));
    const adm = client(app.base);
    await adm.post('/api/auth/login', { identifier: '4430009998', password: 'secreta123' });
    const rep = await buyer.post('/api/reports', { lot_id: lot.id, reason: 'no_corresponde', details: 'No era jitomate maduro' });
    assert.equal(rep.status, 201);
    const n = (await adm.get('/api/notifications')).body.notifications;
    assert.ok(n.some((x) => x.text.includes(`#${rep.body.id}`)), 'aviso al admin');
    await adm.post(`/api/admin/reports/${rep.body.id}`, { status: 'resuelto', resolution: 'Revisado', pause_lot: true });
    assert.equal((await client(app.base).get(`/api/lots/${lot.id}`)).status, 404, 'oferta pausada ya no es pública');
    const mine = (await buyer.get('/api/reports/mine')).body.reports.find((r) => r.id === rep.body.id);
    assert.equal(mine.status, 'resuelto');
    assert.match(mine.resolution, /oferta pausada/);
    assert.ok((await buyer.get('/api/notifications')).body.notifications.some((x) => x.text.includes('fue resuelto')));
  });
});

describe('SNIIM', () => {
  const FIXTURE = `<table><tr><th>Fecha</th><th>Presentación</th><th>Origen</th><th>Destino</th><th>Precio Mín</th><th>Precio Max</th><th>Precio Frec</th><th>Obs.</th></tr>
    <tr><td>17/11/2026</td><td>Kilogramo</td><td>Michoacán</td><td>Michoacán: Mercado de Abasto de Morelia</td><td>14.00</td><td>18.00</td><td>16.00</td><td></td></tr>
    <tr><td>18/11/2026</td><td>Kilogramo</td><td>Sinaloa</td><td>DF: Central de Abasto de Iztapalapa DF</td><td>20.00</td><td>24.00</td><td>22.00</td><td></td></tr>
    <tr><td>18/11/2026</td><td>Kilogramo</td><td>Michoacán</td><td>Jalisco: Mercado de Abasto de Guadalajara</td><td>18.00</td><td>21.00</td><td>19.50</td><td></td></tr></table>`;
  test('lee la tabla (fixture con el formato esperado) y elige el dato más reciente', () => {
    const rows = parseSniimHtml(FIXTURE);
    assert.equal(rows.length, 3);
    const p = pickPrice(rows);
    assert.equal(p.scope, 'nacional', 'Morelia no reportó el día más reciente');
    assert.equal(p.freq_c, 2075);
    assert.equal(p.date, '18/11/2026');
    const mor = pickPrice(rows.filter((r) => r.date === '17/11/2026'));
    assert.equal(mor.scope, 'morelia');
    assert.equal(mor.freq_c, 1600);
  });
  test('la URL usa el ProductoId y el rango de 7 días', () => {
    const u = sniimUrl(839, Date.UTC(2026, 10, 19, 18));
    assert.match(u, /ProductoId=839/);
    assert.match(u, /fechaInicio=12%2F11%2F2026/);
  });
  test('sin conexión no inventa precio; con respuesta guarda y marca la referencia SNIIM', async () => {
    const app2 = await startApp();
    const mod = await import('../src/services/market.js');
    let r = mod.getMarketPrice(app2.db, 'Jitomate', { now: app2.clock.t, fetchImpl: async () => { throw new Error('sin red'); } });
    await mod.waitForRefresh();
    r = mod.getMarketPrice(app2.db, 'Jitomate', { now: app2.clock.t });
    assert.equal(r.available, false);
    assert.match(r.reason, /sin red/);
    await mod.refreshPrice(app2.db, 'Jitomate', { now: app2.clock.t, fetchImpl: async () => ({ ok: true, text: async () => FIXTURE }) });
    r = mod.getMarketPrice(app2.db, 'Jitomate', { now: app2.clock.t });
    assert.equal(r.available, true);
    assert.equal(r.freq_c, 2075);
    const p = await user(app2.base, 'productor');
    const lot = (await p.post('/api/lots', { ...JITOMATE, ref_price: 20.75, ref_source: 'sniim' })).body.lot;
    assert.equal(lot.ref_source, 'sniim');
    const fake = (await p.post('/api/lots', { ...JITOMATE, ref_price: 40, ref_source: 'sniim' })).body.lot;
    assert.equal(fake.ref_source, 'declarado', 'no se puede marcar SNIIM con un precio distinto');
    await app2.close();
  });
});
