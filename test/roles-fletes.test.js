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
  test('nadie se registra solo como transportista; lo da de alta su productor', async () => {
    const r = await client(app.base).post('/api/auth/register', { role: 'transportista', name: 'Libre', phone: '4438887777', password: 'secreta123', municipality: 'morelia', capacity_kg: 900 });
    assert.equal(r.status, 400);
    assert.ok(r.body.fields.role);
    const me = (await carrier.get('/api/carrier/summary')).body;
    assert.ok(me.employer, 'sabe para qué productor trabaja');
    assert.equal((await buyer.post('/api/producer/drivers', { name: 'X', phone: '4437770009', password: 'secreta123', capacity_kg: 100 })).status, 403);
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
    assert.equal(s.delivered, 1);
  });

  test('sólo se pide entrega si el productor la ofrece; capacidad del vehículo se respeta', async () => {
    const { body: { lot } } = await prod.post('/api/lots', JITOMATE); // sin entrega a domicilio
    const { body: o } = await buyer.post(`/api/lots/${lot.id}/reserve`, { kg: 10 });
    assert.equal((await buyer.post('/api/deliveries', { folio: o.folio, address: 'Calle 1 #2' })).status, 409);
    assert.equal((await prod.post('/api/deliveries', { folio: o.folio, address: 'Calle 1 #2' })).status, 403);
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
