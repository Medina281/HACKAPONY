import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startApp, client, user, JITOMATE } from './helpers.js';
import { orderTotals, discountPct, netSavings, kgToGrams } from '../public/js/shared/calc.js';
import { parseSpoken } from '../public/js/shared/parse.js';
import { reserve } from '../src/services/orders.js';
import { HttpError } from '../src/http.js';

let app, prod, buyer, buyer2;
before(async () => {
  app = await startApp();
  prod = await user(app.base, 'productor');
  buyer = await user(app.base, 'comprador');
  buyer2 = await user(app.base, 'comprador');
});
after(() => app.close());

const publish = async (over = {}) => {
  const r = await prod.post('/api/lots', { ...JITOMATE, ...over });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.lot;
};
const available = async (id) => (await client(app.base).get(`/api/lots/${id}`)).body.lot.available_g;

describe('1-2. Publicación express', () => {
  test('1. crea una publicación válida con vencimiento persistido', async () => {
    const lot = await publish();
    assert.equal(lot.product, 'Jitomate');
    assert.equal(lot.total_g, 100000);
    assert.equal(lot.available_g, 100000);
    assert.equal(lot.ref_price_c, 2500);
    assert.equal(lot.rescue_price_c, 1200);
    assert.equal(lot.expires_at, app.clock.t + 24 * 3600e3);
    assert.equal(lot.state, 'disponible');
  });

  test('2. rechaza información inválida o contradictoria', async () => {
    const cases = [
      [{ kg: -5 }, 'kg'],
      [{ kg: 0 }, 'kg'],
      [{ rescue_price: 30 }, 'rescue_price'], // rescate mayor que habitual
      [{ rescue_price: 25 }, 'rescue_price'], // igual al habitual
      [{ ref_price: 'abc' }, 'ref_price'],
      [{ hours: 0 }, 'hours'],
      [{ hours: 500 }, 'hours'],
      [{ product: '' }, 'product'],
      [{ min_kg: 200 }, 'min_kg'],
      [{ quality: 'no_apto' }, 'quality'],
      [{ declaration: false }, 'declaration'],
    ];
    for (const [over, field] of cases) {
      const r = await prod.post('/api/lots', { ...JITOMATE, ...over });
      assert.equal(r.status, 400, `debió rechazar ${JSON.stringify(over)}`);
      assert.ok(r.body.fields[field], `campo ${field} marcado para ${JSON.stringify(over)}`);
    }
  });
});

describe('3. Cálculos', () => {
  test('3. descuento, ahorro y escenario oficial de la demo', () => {
    assert.equal(discountPct(2500, 1200), 52);
    assert.equal(discountPct(4500, 2800), 37.8);
    const t = orderTotals(kgToGrams(20), 2500, 1200);
    assert.deepEqual(t, { refTotal: 50000, rescueTotal: 24000, savings: 26000 }); // $500, $240, $260
    // Sin errores de punto flotante: 0.3 kg a $33.33
    assert.equal(orderTotals(300, 3333, 1111).savings, 667);
    const n = netSavings({ savingsCents: 50000, distanceKm: 25, kmPerLiter: 10, pricePerLiterCents: 3000 });
    assert.equal(n.transportCents, 15000); // 50 km / 10 km/l × $30 = $150
    assert.equal(n.netCents, 35000); // ahorro neto $350 (ejemplo del reto)
  });

  test('3b. interpreta la frase dictada del reto', () => {
    const r = parseSpoken('Tengo 100 kilos de jitomate a 12 pesos el kilo, normalmente a 25, y me quedan aproximadamente 24 horas para venderlos');
    assert.deepEqual([r.product, r.kg, r.rescue_price, r.ref_price, r.hours], ['Jitomate', 100, 12, 25, 24]);
  });
});

describe('4-6. Reservas e inventario', () => {
  test('4-5. reserva parcial y actualiza inventario (100 → 80 → 50)', async () => {
    const lot = await publish();
    const r1 = await buyer.post(`/api/lots/${lot.id}/reserve`, { kg: 20 });
    assert.equal(r1.status, 201, JSON.stringify(r1.body));
    assert.match(r1.body.folio, /^RD-\d{4}$/);
    assert.equal(r1.body.order.total_ref_c, 50000);
    assert.equal(r1.body.order.total_rescue_c, 24000);
    assert.equal(r1.body.order.savings_c, 26000);
    assert.equal(r1.body.order.status, 'apartado');
    assert.match(r1.body.order.delivery_code, /^\d{6}$/);
    assert.equal(await available(lot.id), 80000);
    const r2 = await buyer2.post(`/api/lots/${lot.id}/reserve`, { kg: 30 });
    assert.equal(r2.status, 201);
    assert.equal(await available(lot.id), 50000);
  });

  test('6. evita sobreventas con apartados simultáneos (HTTP)', async () => {
    const lot = await publish({ kg: 10, min_kg: 1 });
    const results = await Promise.all([
      buyer.post(`/api/lots/${lot.id}/reserve`, { kg: 10 }),
      buyer2.post(`/api/lots/${lot.id}/reserve`, { kg: 10 }),
      buyer.post(`/api/lots/${lot.id}/reserve`, { kg: 6 }),
      buyer2.post(`/api/lots/${lot.id}/reserve`, { kg: 6 }),
    ]);
    const okKg = results.filter((r) => r.status === 201).reduce((s, r) => s + r.body.order.qty_g, 0);
    assert.ok(okKg <= 10000, `se apartaron ${okKg} g de 10000`);
    assert.ok(results.some((r) => r.status === 409));
    assert.equal(await available(lot.id), 10000 - okKg);
    const over = await buyer.post(`/api/lots/${lot.id}/reserve`, { kg: 999 });
    assert.ok([400, 409].includes(over.status));
  });

  test('6b. evita sobreventas entre dos conexiones independientes a la base', async () => {
    const lot = await publish({ kg: 5, min_kg: 1 });
    const file = path.join(app.tmp, 'test.db');
    const c1 = new DatabaseSync(file);
    const c2 = new DatabaseSync(file);
    for (const c of [c1, c2]) c.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    const b1 = c1.prepare('SELECT * FROM users WHERE id = ?').get(buyer.user.id);
    const b2 = c2.prepare('SELECT * FROM users WHERE id = ?').get(buyer2.user.id);
    reserve(c1, app.clock.t, b1, lot.id, { kg: 5 });
    assert.throws(() => reserve(c2, app.clock.t, b2, lot.id, { kg: 5 }), (e) => e instanceof HttpError && e.status === 409);
    c1.close();
    c2.close();
    assert.equal(await available(lot.id), 0);
  });

  test('7. impide apartar lotes vencidos aunque la vista esté abierta', async () => {
    const lot = await publish({ hours: 2 });
    app.advance(2.01);
    const r = await buyer.post(`/api/lots/${lot.id}/reserve`, { kg: 5 });
    assert.equal(r.status, 409);
    assert.match(r.body.error, /venci/);
    assert.equal((await client(app.base).get(`/api/lots/${lot.id}`)).body.lot.state, 'vencido');
    const feed = await client(app.base).get('/api/lots');
    assert.ok(!feed.body.lots.some((l) => l.id === lot.id), 'no aparece como disponible en el feed');
  });

  test('8. cancelar libera inventario; apartado no recogido vence y también lo libera', async () => {
    const lot = await publish({ kg: 50, hours: 48 });
    const { body } = await buyer.post(`/api/lots/${lot.id}/reserve`, { kg: 20 });
    assert.equal(await available(lot.id), 30000);
    const noReason = await buyer.post(`/api/orders/${body.folio}/cancelar`, {});
    assert.equal(noReason.status, 400);
    const c = await buyer.post(`/api/orders/${body.folio}/cancelar`, { reason: 'Ya no lo necesito' });
    assert.equal(c.body.order.status, 'cancelado');
    assert.equal(await available(lot.id), 50000);
    const again = await buyer.post(`/api/orders/${body.folio}/cancelar`, { reason: 'x' });
    assert.equal(again.status, 409, 'no se puede cancelar dos veces');

    const r2 = await buyer.post(`/api/lots/${lot.id}/reserve`, { kg: 10, pickup_at: app.clock.t + 3600e3 });
    assert.equal(await available(lot.id), 40000);
    app.advance(4.5); // hora acordada + 3 h de tolerancia
    assert.equal(await available(lot.id), 50000);
    assert.equal((await buyer.get(`/api/orders/${r2.body.folio}`)).body.order.status, 'vencido');
  });
});

describe('9-10. Entrega e impacto', () => {
  test('9-10. confirma entrega con código y actualiza indicadores', async () => {
    const before = (await client(app.base).get('/api/stats')).body.stats;
    const lot = await publish();
    const { body } = await buyer.post(`/api/lots/${lot.id}/reserve`, { kg: 20 });
    const folio = body.folio;
    const code = body.order.delivery_code;
    let s = (await client(app.base).get('/api/stats')).body.stats;
    assert.equal(s.collected_g, before.collected_g, 'apartar NO cuenta como rescatado');
    assert.equal(s.reserved_g, before.reserved_g + 20000);

    assert.equal((await prod.post(`/api/orders/${folio}/entregar`, { code })).status, 409, 'no se entrega sin confirmar');
    assert.equal((await prod.post(`/api/orders/${folio}/confirmar`)).body.order.status, 'confirmado');
    assert.equal((await prod.post(`/api/orders/${folio}/listo`)).body.order.status, 'listo');
    const prodView = (await prod.get(`/api/orders/${folio}`)).body.order;
    assert.equal(prodView.delivery_code, undefined, 'el productor no ve el código');
    assert.equal((await prod.post(`/api/orders/${folio}/entregar`, { code: '000000' })).status, 400);
    const ok = await prod.post(`/api/orders/${folio}/entregar`, { code });
    assert.equal(ok.body.order.status, 'recolectado');

    s = (await client(app.base).get('/api/stats')).body.stats;
    assert.equal(s.collected_g - before.collected_g, 20000);
    assert.equal(s.producer_income_c - before.producer_income_c, 24000);
    assert.equal(s.buyer_savings_c - before.buyer_savings_c, 26000);
    assert.equal(s.completed_orders - before.completed_orders, 1);
    assert.equal((await buyer.post(`/api/orders/${folio}/cancelar`, { reason: 'x' })).status, 409, 'no se cancela lo entregado');
  });
});

describe('11. Permisos en servidor', () => {
  test('11. impide acciones de usuarios sin permiso', async () => {
    const anon = client(app.base);
    const otherProd = await user(app.base, 'productor');
    const lot = await publish();
    assert.equal((await anon.post('/api/lots', JITOMATE)).status, 401);
    assert.equal((await buyer.post('/api/lots', JITOMATE)).status, 403, 'comprador no publica');
    assert.equal((await anon.post(`/api/lots/${lot.id}/reserve`, { kg: 5 })).status, 401);
    assert.equal((await prod.post(`/api/lots/${lot.id}/reserve`, { kg: 5 })).status, 403, 'productor no aparta');
    assert.equal((await otherProd.patch(`/api/lots/${lot.id}/price`, { rescue_price: 5 })).status, 403, 'precio ajeno');
    assert.equal((await otherProd.post(`/api/lots/${lot.id}/status`, { status: 'retirado' })).status, 403);
    const { body } = await buyer.post(`/api/lots/${lot.id}/reserve`, { kg: 5 });
    assert.equal((await otherProd.post(`/api/orders/${body.folio}/confirmar`)).status, 403, 'pedido ajeno');
    assert.equal((await buyer.post(`/api/orders/${body.folio}/confirmar`)).status, 403, 'comprador no confirma');
    assert.equal((await buyer2.get(`/api/orders/${body.folio}`)).status, 403, 'no ve pedidos ajenos');
    assert.equal((await buyer.get('/api/admin/overview')).status, 403);
    assert.equal((await anon.get('/api/admin/overview')).status, 401);
    // Datos privados: el feed público no expone punto de recolección ni teléfono
    const pub = (await anon.get(`/api/lots/${lot.id}`)).body.lot;
    assert.equal(pub.pickup_point, undefined);
    assert.equal(pub.producer.phone, undefined);
    // Registro no permite autoasignarse administrador
    const adm = await client(app.base).post('/api/auth/register', { role: 'admin', name: 'X', phone: '4431112222', password: 'secreta123', municipality: 'morelia' });
    assert.equal(adm.status, 400);
  });
});

describe('12. Persistencia', () => {
  test('12. la información persiste al reiniciar el servidor (temporizador incluido)', async () => {
    const lot = await publish({ product: 'Aguacate', kg: 42 });
    const { body } = await buyer.post(`/api/lots/${lot.id}/reserve`, { kg: 2 });
    const dir = app.tmp;
    const t = app.clock.t;
    await app.close();
    app = await startApp({ dir });
    app.clock.t = t + 60e3; // "recargar" un minuto después
    const fresh = client(app.base);
    const again = (await fresh.get(`/api/lots/${lot.id}`)).body.lot;
    assert.equal(again.expires_at, lot.expires_at, 'el vencimiento no se reinicia');
    assert.equal(again.available_g, 40000);
    const login = await fresh.post('/api/auth/login', { identifier: buyer.user.phone, password: 'secreta123' });
    assert.equal(login.status, 200);
    assert.equal((await fresh.get(`/api/orders/${body.folio}`)).body.order.qty_g, 2000);
    assert.equal((await fresh.post('/api/auth/login', { identifier: buyer.user.phone, password: 'mala' })).status, 401);
  });
});
