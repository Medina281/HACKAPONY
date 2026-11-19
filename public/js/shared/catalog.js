// Catálogo compartido entre servidor y cliente (una sola fuente de verdad).

export const CATEGORIES = [
  { id: 'verdura', label: 'Verdura' },
  { id: 'fruta', label: 'Fruta' },
  { id: 'hortaliza', label: 'Hortaliza / hoja' },
  { id: 'tuberculo', label: 'Tubérculo' },
  { id: 'otro', label: 'Otro' },
];

// Íconos de línea por tipo de producto (sin emojis).
export const PRODUCTS = [
  { name: 'Jitomate', category: 'verdura', icon: 'fruit', alias: ['jitomates', 'tomate rojo', 'tomates'] },
  { name: 'Aguacate', category: 'fruta', icon: 'fruit', alias: ['aguacates'] },
  { name: 'Fresa', category: 'fruta', icon: 'fruit', alias: ['fresas'] },
  { name: 'Guayaba', category: 'fruta', icon: 'fruit', alias: ['guayabas'] },
  { name: 'Limón', category: 'fruta', icon: 'fruit', alias: ['limon', 'limones'] },
  { name: 'Mango', category: 'fruta', icon: 'fruit', alias: ['mangos'] },
  { name: 'Calabacita', category: 'verdura', icon: 'carrot', alias: ['calabacitas', 'calabaza'] },
  { name: 'Cebolla', category: 'verdura', icon: 'tuber', alias: ['cebollas'] },
  { name: 'Papa', category: 'tuberculo', icon: 'tuber', alias: ['papas'] },
  { name: 'Plátano', category: 'fruta', icon: 'fruit', alias: ['platano', 'platanos', 'plátanos'] },
  { name: 'Chile', category: 'verdura', icon: 'carrot', alias: ['chiles', 'chile serrano', 'chile jalapeño'] },
  { name: 'Zanahoria', category: 'tuberculo', icon: 'carrot', alias: ['zanahorias'] },
  { name: 'Elote', category: 'verdura', icon: 'carrot', alias: ['elotes'] },
  { name: 'Brócoli', category: 'hortaliza', icon: 'lettuce', alias: ['brocoli'] },
  { name: 'Lechuga', category: 'hortaliza', icon: 'lettuce', alias: ['lechugas'] },
  { name: 'Naranja', category: 'fruta', icon: 'fruit', alias: ['naranjas'] },
];

export const productIconName = (name) => {
  const n = normalize(name || '');
  const p = PRODUCTS.find((x) => normalize(x.name) === n || x.alias.some((a) => normalize(a) === n));
  return p ? p.icon : 'basket';
};
/** Ícono de línea según el tipo de producto (sprite /icons.svg). */
export const productIcon = (name) => `<svg class="i prod" aria-hidden="true"><use href="/icons.svg#${productIconName(name)}"/></svg>`;

// Cabeceras municipales (coordenadas aproximadas del centro de la cabecera; sirven
// sólo para distancias en línea recta y para no exponer la ubicación exacta del productor).
export const MUNICIPALITIES = [
  { id: 'morelia', name: 'Morelia', lat: 19.7027, lng: -101.1923 },
  { id: 'tarimbaro', name: 'Tarímbaro', lat: 19.7942, lng: -101.1784 },
  { id: 'cuitzeo', name: 'Cuitzeo', lat: 19.9686, lng: -101.1394 },
  { id: 'zinapecuaro', name: 'Zinapécuaro', lat: 19.8597, lng: -100.8264 },
  { id: 'quiroga', name: 'Quiroga', lat: 19.665, lng: -101.5238 },
  { id: 'patzcuaro', name: 'Pátzcuaro', lat: 19.5131, lng: -101.6094 },
  { id: 'uruapan', name: 'Uruapan', lat: 19.4114, lng: -102.0579 },
  { id: 'zamora', name: 'Zamora', lat: 19.9858, lng: -102.2836 },
];
export const municipality = (id) => MUNICIPALITIES.find((m) => m.id === id);

// Estado declarado del producto. "No apto" NO existe como opción publicable.
export const QUALITY = [
  { id: 'excedente', label: 'Excedente en buen estado', hint: 'No se alcanzó a vender por el canal de siempre.' },
  { id: 'imperfeccion', label: 'Imperfección estética', hint: 'Forma, tamaño o color fuera de estándar; buen sabor.' },
  { id: 'maduro', label: 'Maduro, para usar pronto', hint: 'Ideal para salsas, aguas, licuados o cocina del día.' },
  { id: 'proximo', label: 'Próximo a perder valor comercial', hint: 'Aún apto para consumo, pero ya no aguanta anaquel.' },
];
export const qualityLabel = (id) => (QUALITY.find((q) => q.id === id) || {}).label || id;

export const ORDER_STATUS = {
  apartado: { label: 'Apartado', tone: 'warn' },
  confirmado: { label: 'Confirmado por productor', tone: 'info' },
  listo: { label: 'Listo para recolección', tone: 'ok' },
  recolectado: { label: 'Recolectado', tone: 'done' },
  cancelado: { label: 'Cancelado', tone: 'muted' },
  vencido: { label: 'Vencido (no se recogió)', tone: 'muted' },
};

export const REPORT_REASONS = [
  { id: 'no_corresponde', label: 'El producto no corresponde a lo publicado' },
  { id: 'no_apto', label: 'Producto no apto para consumo' },
  { id: 'precio_falso', label: 'Precio de referencia engañoso' },
  { id: 'no_se_presento', label: 'La otra parte no se presentó' },
  { id: 'publicacion_falsa', label: 'Publicación falsa o sospechosa' },
  { id: 'otro', label: 'Otro' },
];

export function normalize(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Fotos REALES de referencia (Wikimedia Commons, licencias libres). Se muestran sólo cuando el productor
// no subió su propia foto y siempre con la etiqueta "referencia". Créditos en #/creditos.
export const STOCK_PHOTOS = {
  Jitomate: { file: 'Tomatoes.jpg', author: 'Wilfredor', license: 'CC0 1.0' },
  Aguacate: { file: 'Avocado Hass - single and halved.jpg', author: 'Ivar Leidus (Iifar)', license: 'CC BY-SA (ver ficha)' },
  Fresa: { file: 'Garden strawberry (Fragaria × ananassa) single2.jpg', author: 'Ivar Leidus (Iifar)', license: 'CC BY-SA 4.0' },
  Guayaba: { file: 'Psidium guajava fruit.jpg', author: 'A-giâu', license: 'CC BY-SA 3.0' },
  Limón: { file: 'Lime - whole and halved.jpg', author: 'Ivar Leidus (Iifar)', license: 'CC BY-SA (ver ficha)' },
  Mango: { file: 'Mangos - single and halved.jpg', author: 'Ivar Leidus (Iifar)', license: 'CC BY-SA (ver ficha)' },
  Cebolla: { file: 'YellowOnions.jpg', author: 'Jon Sullivan', license: 'Dominio público' },
  Naranja: { file: 'Oranges - whole-halved-segment.jpg', author: 'ver ficha en Commons', license: 'ver ficha en Commons' },
};
const commons = (file, w) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=${w}`;
// Fotos descargadas al proyecto con `npm run fotos` (public/img/productos/creditos.json): funcionan sin internet.
let LOCAL = {};
export const setLocalPhotos = (m) => { LOCAL = m && typeof m === 'object' ? m : {}; };
export const localPhotos = () => LOCAL;
export const stockPhoto = (product, w = 480) => {
  const p = PRODUCTS.find((x) => normalize(x.name) === normalize(product || '') || x.alias.some((a) => normalize(a) === normalize(product || '')));
  if (!p) return null;
  const loc = LOCAL[normalize(p.name)];
  if (loc) return { url: `/img/productos/${loc.file}`, file: loc.source_file, author: loc.author, license: loc.license, page: loc.page, local: true };
  const s = STOCK_PHOTOS[p.name];
  return s ? { url: commons(s.file, w), ...s, page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(s.file.replace(/ /g, '_'))}` } : null;
};
