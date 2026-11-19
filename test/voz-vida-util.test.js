import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { parseSpoken, wordsToNumbers, resolvePacks } from '../public/js/shared/parse.js';
import { estimateShelfLife, relativeLife, perishClass } from '../public/js/shared/shelf.js';
import { startApp, user, JITOMATE } from './helpers.js';

describe('Asistente de voz: intérprete', () => {
  test('números escritos con palabras', () => {
    assert.equal(wordsToNumbers('ciento veinticinco'), '125');
    assert.equal(wordsToNumbers('treinta y cinco'), '35');
    assert.equal(wordsToNumbers('dos mil quinientos'), '2500');
    assert.equal(wordsToNumbers('un productor'), 'un productor', 'el artículo "un" no se vuelve número');
  });

  test('frase completa con palabras y expresiones mexicanas', () => {
    const r = parseSpoken('Tengo cien kilos de jitomate a doce varos el kilo, normalmente a veinticinco, me quedan veinticuatro horas');
    assert.deepEqual([r.product, r.kg, r.rescue_price, r.ref_price, r.hours], ['Jitomate', 100, 12, 25, 24]);
    assert.deepEqual(r.missing, ['quality'], 'el estado no se inventa');
  });

  test('convierte empaques a kg y precio por caja a precio por kg', () => {
    const r = parseSpoken('tengo diez cajas de aguacate de veinte kilos cada una, la caja la doy en trescientos pesos, en la central me la pagan a quinientos, aguanta dos días, estoy en Uruapan');
    assert.equal(r.kg, 200);
    assert.equal(r.rescue_price, 15);
    assert.equal(r.ref_price, 25);
    assert.equal(r.hours, 48);
    assert.equal(r.municipality, 'uruapan');
  });

  test('si falta el peso por caja lo pide en lugar de suponerlo', () => {
    const r = parseSpoken('son 30 cajas de fresa a 200 la caja, normalmente 350 la caja');
    assert.equal(r.kg, null);
    assert.ok(r.missing.includes('pack_kg'));
    assert.equal(r.rescue_price, null);
    const conv = resolvePacks({ packs: 30, pack_kg: 8, pending_prices: r.pending_prices });
    assert.deepEqual(conv, { kg: 240, rescue_price: 25, ref_price: 43.75 });
  });

  test('tiempos vagos se preguntan; toneladas, mínimos y transporte se detectan', () => {
    const a = parseSpoken('treinta y cinco kilos de mango maduro a 15, antes a 30, hasta mañana');
    assert.equal(a.hours, null);
    assert.equal(a.hours_vague, 'manana');
    assert.equal(a.quality, 'maduro');
    const b = parseSpoken('media tonelada de papa chiquita a $13, normalmente $20, una semana, mínimo 20 kilos, yo lo llevo');
    assert.deepEqual([b.kg, b.hours, b.min_kg, b.producer_transport, b.quality], [500, 168, 20, true, 'imperfeccion']);
  });

  test('respuestas cortas se interpretan según la pregunta', () => {
    assert.equal(parseSpoken('cien', { context: 'kg' }).kg, 100);
    assert.equal(parseSpoken('veinticinco pesos', { context: 'ref_price' }).ref_price, 25);
    assert.equal(parseSpoken('veinticinco pesos', { context: 'ref_price' }).rescue_price, null);
    assert.equal(parseSpoken('dos días', { context: 'hours' }).hours, 48);
    assert.equal(parseSpoken('nopales', { context: 'product' }).product, 'Nopales');
  });

  test('detecta producto no apto', () => {
    assert.equal(parseSpoken('tengo fresa podrida').unsafe, true);
  });
});

describe('Vida útil por clima', () => {
  test('tabla Q10: más calor, menos vida útil', () => {
    assert.ok(relativeLife(30) < relativeLife(20) && relativeLife(20) < relativeLife(10));
    assert.equal(Math.round(relativeLife(20)), 13);
  });
  test('clasificación de perecibilidad', () => {
    assert.equal(perishClass('Fresa').cls, 'alta');
    assert.equal(perishClass('Cebolla').cls, 'baja');
    assert.equal(perishClass('Guayaba').assumed, true);
  });
  test('la estimación baja con calor y con producto maduro', () => {
    const fresco = estimateShelfLife({ product: 'Jitomate', quality: 'excedente', temps: Array(168).fill(15) });
    const calor = estimateShelfLife({ product: 'Jitomate', quality: 'excedente', temps: Array(168).fill(30) });
    const maduro = estimateShelfLife({ product: 'Jitomate', quality: 'maduro', temps: Array(168).fill(30) });
    assert.ok(fresco.hours > calor.hours && calor.hours > maduro.hours);
    assert.ok(calor.notes.some((n) => n.includes('30 °C')));
    assert.ok(calor.low < calor.hours && calor.hours < calor.high);
    assert.equal(estimateShelfLife({ product: 'Jitomate', quality: undefined, temps: [20] }), null, 'sin estado no se estima');
  });
});

describe('Publicación: método, vida útil y estado obligatorio', () => {
  let app, prod;
  before(async () => { app = await startApp(); prod = await user(app.base, 'productor'); });
  after(() => app.close());

  test('guarda el método de captura y la estimación de vida útil', async () => {
    const shelf = { ...estimateShelfLife({ product: 'Jitomate', quality: 'maduro', temps: Array(72).fill(26) }), source: 'open-meteo' };
    const r = await prod.post('/api/lots', { ...JITOMATE, input_method: 'voz', shelf });
    assert.equal(r.status, 201);
    assert.equal(r.body.lot.input_method, 'voz');
    assert.equal(r.body.lot.shelf.hours, shelf.hours);
    assert.equal(r.body.lot.shelf.source, 'open-meteo');
    const bad = await prod.post('/api/lots', { ...JITOMATE, input_method: 'hack', shelf: { hours: 9999, source: 'x', method: 'q10-v1' } });
    assert.equal(bad.body.lot.input_method, 'formulario');
    assert.equal(bad.body.lot.shelf, null, 'datos fuera de rango no se guardan');
  });

  test('el estado del producto es obligatorio (no se asume)', async () => {
    const { quality, ...sinEstado } = JITOMATE;
    const r = await prod.post('/api/lots', sinEstado);
    assert.equal(r.status, 400);
    assert.ok(r.body.fields.quality);
  });

  test('la ubicación dicha por voz reemplaza la del perfil', async () => {
    const r = await prod.post('/api/lots', { ...JITOMATE, municipality: 'uruapan' });
    assert.equal(r.body.lot.municipality, 'uruapan');
  });
});
