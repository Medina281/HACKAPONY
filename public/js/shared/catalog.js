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
  { name: 'Jitomate', category: 'verdura', icon: 'fruit', alias: ['jitomates', 'tomate rojo', 'tomates', 'tomate saladet', 'tomate saladette', 'tomate bola', 'jitomate bola', 'tomate grande'] },
  { name: 'Aguacate', category: 'fruta', icon: 'fruit', alias: ['aguacates', 'aguacate has', 'aguacate hass', 'oro verde', 'aguacate criollo', 'aguacate negro'] },
  { name: 'Fresa', category: 'fruta', icon: 'fruit', alias: ['fresas', 'fresa de zamora', 'fresa fresca'] },
  { name: 'Guayaba', category: 'fruta', icon: 'fruit', alias: ['guayabas', 'guayaba de zitacuaro'] },
  { name: 'Limón', category: 'fruta', icon: 'fruit', alias: ['limon', 'limones', 'limon con semilla', 'limon colima', 'limon michoacan', 'limon sin semilla', 'limon persa'] },
  { name: 'Mango', category: 'fruta', icon: 'fruit', alias: ['mangos', 'mango ataulfo', 'mango amarillo'] },
  { name: 'Calabacita', category: 'verdura', icon: 'carrot', alias: ['calabacitas', 'calabaza', 'calabacita italiana'] },
  { name: 'Cebolla', category: 'verdura', icon: 'tuber', alias: ['cebollas', 'cebolla blanca', 'cebolla bola', 'cebolla morada', 'cebollas moradas'] },
  { name: 'Papa', category: 'tuberculo', icon: 'tuber', alias: ['papas', 'papa blanca', 'papa alfa'] },
  { name: 'Plátano', category: 'fruta', icon: 'fruit', alias: ['platano', 'platanos', 'plátanos', 'platano tabasco', 'guineo', 'platano macho', 'platanos machos'] },
  { name: 'Chile', category: 'verdura', icon: 'carrot', alias: ['chiles', 'chile serrano', 'chile jalapeño', 'chile poblano', 'chiles poblanos', 'jalapeño', 'jalapeños', 'chile cuaresmeno', 'serrano', 'serranos', 'chile verde', 'poblano', 'poblanos', 'chile para rellenar'] },
  { name: 'Zanahoria', category: 'tuberculo', icon: 'carrot', alias: ['zanahorias'] },
  { name: 'Elote', category: 'verdura', icon: 'carrot', alias: ['elotes'] },
  { name: 'Brócoli', category: 'hortaliza', icon: 'lettuce', alias: ['brocoli'] },
  { name: 'Lechuga', category: 'hortaliza', icon: 'lettuce', alias: ['lechugas', 'lechuga romana', 'romanita'] },
  { name: 'Naranja', category: 'fruta', icon: 'fruit', alias: ['naranjas', 'naranja para jugo'] },
  // Más frutas
  { name: 'Zarzamora', category: 'fruta', icon: 'fruit', alias: ['zarzamoras', 'mora', 'moras'] },
  { name: 'Frambuesa', category: 'fruta', icon: 'fruit', alias: ['frambuesas'] },
  { name: 'Arándano', category: 'fruta', icon: 'fruit', alias: ['arandano', 'arándanos', 'arandanos', 'blueberry', 'blueberries'] },
  { name: 'Durazno', category: 'fruta', icon: 'fruit', alias: ['duraznos'] },
  { name: 'Pera', category: 'fruta', icon: 'fruit', alias: ['peras'] },
  { name: 'Manzana', category: 'fruta', icon: 'fruit', alias: ['manzanas', 'manzana amarilla', 'manzana golden'] },
  { name: 'Toronja', category: 'fruta', icon: 'fruit', alias: ['toronjas'] },
  { name: 'Mandarina', category: 'fruta', icon: 'fruit', alias: ['mandarinas'] },
  { name: 'Uva', category: 'fruta', icon: 'fruit', alias: ['uvas'] },
  { name: 'Sandía', category: 'fruta', icon: 'fruit', alias: ['sandia', 'sandías', 'sandias', 'sandia rayada'] },
  { name: 'Melón', category: 'fruta', icon: 'fruit', alias: ['melon', 'melones', 'melon chino'] },
  { name: 'Papaya', category: 'fruta', icon: 'fruit', alias: ['papayas', 'papaya maradol'] },
  { name: 'Piña', category: 'fruta', icon: 'fruit', alias: ['pina', 'piñas', 'pinas'] },
  { name: 'Tuna', category: 'fruta', icon: 'fruit', alias: ['tunas'] },
  // Más verduras
  { name: 'Tomate verde', category: 'verdura', icon: 'fruit', alias: ['tomates verdes', 'tomatillo', 'tomatillos', 'tomate de cascara', 'tomate de cáscara'] },
  { name: 'Pepino', category: 'verdura', icon: 'carrot', alias: ['pepinos'] },
  { name: 'Chayote', category: 'verdura', icon: 'carrot', alias: ['chayotes', 'chayote sin espinas'] },
  { name: 'Ejote', category: 'verdura', icon: 'carrot', alias: ['ejotes'] },
  { name: 'Nopal', category: 'verdura', icon: 'lettuce', alias: ['nopales', 'nopal limpio'] },
  { name: 'Pimiento', category: 'verdura', icon: 'carrot', alias: ['pimientos', 'pimiento morrón', 'morron', 'morrón'] },
  { name: 'Champiñón', category: 'otro', icon: 'basket', alias: ['champinon', 'champiñones', 'champinones', 'hongos'] },
  // Más hojas
  { name: 'Espinaca', category: 'hortaliza', icon: 'lettuce', alias: ['espinacas'] },
  { name: 'Cilantro', category: 'hortaliza', icon: 'lettuce', alias: ['manojo de cilantro', 'cilantros'] },
  { name: 'Col', category: 'hortaliza', icon: 'lettuce', alias: ['coles', 'repollo', 'repollos'] },
  { name: 'Coliflor', category: 'hortaliza', icon: 'lettuce', alias: ['coliflores'] },
  { name: 'Acelga', category: 'hortaliza', icon: 'lettuce', alias: ['acelgas'] },
  { name: 'Apio', category: 'hortaliza', icon: 'lettuce', alias: [] },
  // Más tubérculos y raíces
  { name: 'Camote', category: 'tuberculo', icon: 'tuber', alias: ['camotes'] },
  { name: 'Betabel', category: 'tuberculo', icon: 'tuber', alias: ['betabeles', 'remolacha'] },
  { name: 'Rábano', category: 'tuberculo', icon: 'tuber', alias: ['rabano', 'rábanos', 'rabanos'] },
  { name: 'Jícama', category: 'tuberculo', icon: 'tuber', alias: ['jicama', 'jícamas', 'jicamas'] },
  { name: 'Ajo', category: 'tuberculo', icon: 'tuber', alias: ['ajos'] },
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
