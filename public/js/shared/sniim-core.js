// Núcleo para usar precios REALES extraídos del SNIIM (archivo sniim_real_verificado.json del scraper).
// Funciona igual en el navegador, en Node y en React: recibe los datos ya cargados.
// Nunca inventa precios: si un estado no cotizó, usa el promedio de los estados que SÍ cotizaron y lo dice.
import { PRODUCTS, normalize } from './catalog.js';

// Sinónimos fonéticos de México → nombre oficial SNIIM preferido (para voz a texto)
export const SINONIMOS_SNIIM = {
  jitomate: 'Tomate Saladette - Primera', jitomates: 'Tomate Saladette - Primera', 'tomate rojo': 'Tomate Saladette - Primera', saladet: 'Tomate Saladette - Primera',
  'jitomate bola': 'Tomate Bola - Primera', tomatillo: 'Tomate Verde - Primera', 'tomate de cascara': 'Tomate Verde - Primera', 'tomate verde': 'Tomate Verde - Primera',
  aguacate: 'Aguacate Hass - Primera', 'aguacate has': 'Aguacate Hass - Primera', 'oro verde': 'Aguacate Hass - Primera',
  limon: 'Limón c/semilla - Primera', 'limon persa': 'Limón s/semilla - Primera', 'limon sin semilla': 'Limón s/semilla - Primera',
  jalapeno: 'Chile Jalapeño - Primera', cuaresmeno: 'Chile Jalapeño - Primera', serrano: 'Chile Serrano - Primera', poblano: 'Chile Poblano - Primera',
  platano: 'Plátano Tabasco - Primera', guineo: 'Plátano Tabasco - Primera', 'platano macho': 'Plátano Macho - Primera',
  papa: 'Papa Alpha - Primera', 'papa alfa': 'Papa Alpha - Primera', cebolla: 'Cebolla Bola - Primera', 'cebolla morada': 'Cebolla Morada - Primera',
};

const media = (a) => Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 100) / 100;

/** Producto de la app al que corresponde un nombre oficial del SNIIM (por el alias más largo contenido). */
export function productoApp(nombreSniim) {
  const n = normalize(nombreSniim);
  let best = null;
  let len = 0;
  for (const p of PRODUCTS) for (const a of [p.name, ...p.alias]) {
    const k = normalize(a);
    if (k.length > len && new RegExp(`\\b${k}\\b`).test(n)) { best = p.name; len = k.length; }
  }
  return best;
}

export function crearServicioSNIIM(datos) {
  const mercados = (datos?.mercados || []).filter((m) => m.productos?.length);
  const meta = { fuente: datos?.fuente, generado_en: datos?.generado_en, verificacion: datos?.verificacion };

  // Catálogo único de productos reales que aparecieron en el servidor
  const porNombre = new Map();
  for (const m of mercados) for (const p of m.productos) {
    const id = normalize(p.producto).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!porNombre.has(id)) porNombre.set(id, { id, nombre: p.producto, producto_app: productoApp(p.producto), sinonimos_voz: [] });
  }
  for (const [voz, oficial] of Object.entries(SINONIMOS_SNIIM)) {
    const item = [...porNombre.values()].find((x) => x.nombre === oficial);
    if (item) item.sinonimos_voz.push(voz);
  }
  const catalogo = [...porNombre.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  /** Busca por id del catálogo, nombre oficial, sinónimo de voz o producto de la app. */
  function resolver(q) {
    const n = normalize(q || '');
    const exactos = catalogo.filter((x) => x.id === n || normalize(x.nombre) === n || x.sinonimos_voz.includes(n));
    if (exactos.length) return exactos;
    const deApp = catalogo.filter((x) => normalize(x.producto_app || '') === n);
    // Si el producto de la app tiene varias variedades, se usa la que tiene sinónimo de voz (la más común)
    const preferida = deApp.filter((x) => x.sinonimos_voz.includes(n));
    return preferida.length ? preferida : deApp.slice(0, 1);
  }

  /** Precio frecuente real por kg en un estado, o promedio nacional real de los estados que sí cotizaron. */
  function obtenerPrecioRealSNIIM(productoId, estado) {
    const items = resolver(productoId);
    if (!items.length) return { disponible: false, motivo: 'El producto no aparece en la última extracción del SNIIM.' };
    const nombres = new Set(items.map((x) => x.nombre));
    const filas = [];
    for (const m of mercados) for (const p of m.productos) if (nombres.has(p.producto)) filas.push({ ...p, estado: m.estado, mercado: m.mercado, fecha: m.fecha_corte_sniim, url: m.url_consulta });
    if (!filas.length) return { disponible: false, motivo: 'Sin cotización en la extracción.' };
    const delEstado = estado ? filas.filter((f) => normalize(f.estado) === normalize(estado)) : [];
    const usadas = delEstado.length ? delEstado : filas;
    return {
      disponible: true,
      producto: items[0].nombre,
      alcance: delEstado.length ? 'estado' : 'nacional',
      estado: delEstado.length ? delEstado[0].estado : null,
      precio_frecuente_kg: media(usadas.map((f) => f.precio_frecuente_kg)),
      precio_min_kg: Math.min(...usadas.map((f) => f.precio_min_kg ?? f.precio_frecuente_kg)),
      precio_max_kg: Math.max(...usadas.map((f) => f.precio_max_kg ?? f.precio_frecuente_kg)),
      mercados: usadas.map((f) => ({ mercado: f.mercado, estado: f.estado, precio_frecuente_kg: f.precio_frecuente_kg, fecha_corte_sniim: f.fecha, url_consulta: f.url })),
      fecha_corte_sniim: usadas.map((f) => f.fecha).sort().pop(),
      fuente: meta.fuente || 'SNIIM, Secretaría de Economía',
      nota: delEstado.length ? null : `El estado no cotizó este producto; es el promedio real de ${new Set(usadas.map((f) => f.estado)).size} estados que sí cotizaron.`,
    };
  }

  return { meta, catalogo, resolver, obtenerPrecioRealSNIIM, hayDatos: mercados.length > 0 };
}
