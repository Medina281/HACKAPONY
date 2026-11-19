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
  { id: 'morelia', name: 'Morelia', state: 'Michoacán', ref_state: 'Michoacán', region: 'Centro', lat: 19.7027, lng: -101.1923 },
  { id: 'tarimbaro', name: 'Tarímbaro', state: 'Michoacán', ref_state: 'Michoacán', region: 'Centro', lat: 19.7942, lng: -101.1784 },
  { id: 'charo', name: 'Charo', state: 'Michoacán', ref_state: 'Michoacán', region: 'Centro', lat: 19.7461, lng: -101.0408 },
  { id: 'cuitzeo', name: 'Cuitzeo', state: 'Michoacán', ref_state: 'Michoacán', region: 'Cuitzeo', lat: 19.9686, lng: -101.1394 },
  { id: 'puruandiro', name: 'Puruándiro', state: 'Michoacán', ref_state: 'Michoacán', region: 'Bajío', lat: 20.0878, lng: -101.5144 },
  { id: 'zinapecuaro', name: 'Zinapécuaro', state: 'Michoacán', ref_state: 'Michoacán', region: 'Oriente', lat: 19.8597, lng: -100.8264 },
  { id: 'hidalgo', inegi_name: 'Hidalgo', name: 'Ciudad Hidalgo', state: 'Michoacán', ref_state: 'Michoacán', region: 'Oriente', lat: 19.6922, lng: -100.5536 },
  { id: 'maravatio', name: 'Maravatío', state: 'Michoacán', ref_state: 'Michoacán', region: 'Oriente', lat: 19.8939, lng: -100.4433 },
  { id: 'zitacuaro', name: 'Zitácuaro', state: 'Michoacán', ref_state: 'Michoacán', region: 'Oriente', lat: 19.4357, lng: -100.357 },
  { id: 'quiroga', name: 'Quiroga', state: 'Michoacán', ref_state: 'Michoacán', region: 'Pátzcuaro-Zirahuén', lat: 19.665, lng: -101.5238 },
  { id: 'patzcuaro', name: 'Pátzcuaro', state: 'Michoacán', ref_state: 'Michoacán', region: 'Pátzcuaro-Zirahuén', lat: 19.5131, lng: -101.6094 },
  { id: 'santa_clara', inegi_name: 'Salvador Escalante', name: 'Salvador Escalante', state: 'Michoacán', ref_state: 'Michoacán', region: 'Pátzcuaro-Zirahuén', lat: 19.4067, lng: -101.64 },
  { id: 'tacambaro', name: 'Tacámbaro', state: 'Michoacán', ref_state: 'Michoacán', region: 'Infiernillo', lat: 19.235, lng: -101.4572 },
  { id: 'uruapan', name: 'Uruapan', state: 'Michoacán', ref_state: 'Michoacán', region: 'Meseta Purépecha', lat: 19.4114, lng: -102.0579 },
  { id: 'paracho', name: 'Paracho', state: 'Michoacán', ref_state: 'Michoacán', region: 'Meseta Purépecha', lat: 19.6458, lng: -102.0464 },
  { id: 'los_reyes', name: 'Los Reyes', state: 'Michoacán', ref_state: 'Michoacán', region: 'Meseta Purépecha', lat: 19.5856, lng: -102.4706 },
  { id: 'zamora', name: 'Zamora', state: 'Michoacán', ref_state: 'Michoacán', region: 'Bajío', lat: 19.9858, lng: -102.2836 },
  { id: 'jacona', name: 'Jacona', state: 'Michoacán', ref_state: 'Michoacán', region: 'Bajío', lat: 19.9553, lng: -102.2933 },
  { id: 'tangancicuaro', name: 'Tangancícuaro', state: 'Michoacán', ref_state: 'Michoacán', region: 'Bajío', lat: 19.8875, lng: -102.2056 },
  { id: 'la_piedad', name: 'La Piedad', state: 'Michoacán', ref_state: 'Michoacán', region: 'Bajío', lat: 20.342, lng: -102.0293 },
  { id: 'sahuayo', name: 'Sahuayo', state: 'Michoacán', ref_state: 'Michoacán', region: 'Ciénega de Chapala', lat: 20.0566, lng: -102.7262 },
  { id: 'apatzingan', name: 'Apatzingán', state: 'Michoacán', ref_state: 'Michoacán', region: 'Tierra Caliente', lat: 19.0886, lng: -102.3506 },
  { id: 'huetamo', name: 'Huetamo', state: 'Michoacán', ref_state: 'Michoacán', region: 'Tierra Caliente', lat: 18.63, lng: -100.897 },
  { id: 'lazaro_cardenas', name: 'Lázaro Cárdenas', state: 'Michoacán', ref_state: 'Michoacán', region: 'Costa', lat: 17.9583, lng: -102.2 },
  // Otras ciudades con central de abasto (coordenadas aproximadas del centro de la ciudad)
  { id: 'cdmx', inegi_name: 'Iztapalapa', name: 'Ciudad de México (Iztapalapa)', state: 'Ciudad de México', ref_state: 'DF', region: 'Centro del país', lat: 19.3574, lng: -99.0906 },
  { id: 'toluca', name: 'Toluca', state: 'Estado de México', ref_state: 'México', region: 'Centro del país', lat: 19.2826, lng: -99.6557 },
  { id: 'ecatepec', name: 'Ecatepec', state: 'Estado de México', ref_state: 'México', region: 'Centro del país', lat: 19.6018, lng: -99.0507 },
  { id: 'cuernavaca', name: 'Cuernavaca', state: 'Morelos', ref_state: 'Morelos', region: 'Centro del país', lat: 18.9242, lng: -99.2216 },
  { id: 'pachuca', name: 'Pachuca', state: 'Hidalgo', ref_state: 'Hidalgo', region: 'Centro del país', lat: 20.1011, lng: -98.7591 },
  { id: 'puebla', name: 'Puebla', state: 'Puebla', ref_state: 'Puebla', region: 'Centro del país', lat: 19.0414, lng: -98.2063 },
  { id: 'tlaxcala', name: 'Tlaxcala', state: 'Tlaxcala', ref_state: 'Tlaxcala', region: 'Centro del país', lat: 19.3139, lng: -98.2404 },
  { id: 'queretaro', name: 'Querétaro', state: 'Querétaro', ref_state: 'Querétaro', region: 'Bajío', lat: 20.5888, lng: -100.3899 },
  { id: 'leon', name: 'León', state: 'Guanajuato', ref_state: 'Guanajuato', region: 'Bajío', lat: 21.125, lng: -101.686 },
  { id: 'celaya', name: 'Celaya', state: 'Guanajuato', ref_state: 'Guanajuato', region: 'Bajío', lat: 20.5235, lng: -100.8157 },
  { id: 'irapuato', name: 'Irapuato', state: 'Guanajuato', ref_state: 'Guanajuato', region: 'Bajío', lat: 20.6767, lng: -101.3563 },
  { id: 'aguascalientes', name: 'Aguascalientes', state: 'Aguascalientes', ref_state: 'Aguascalientes', region: 'Bajío', lat: 21.8853, lng: -102.2916 },
  { id: 'slp', name: 'San Luis Potosí', state: 'San Luis Potosí', ref_state: 'San Luis Potosí', region: 'Norte-centro', lat: 22.1565, lng: -100.9855 },
  { id: 'zacatecas', name: 'Zacatecas', state: 'Zacatecas', ref_state: 'Zacatecas', region: 'Norte-centro', lat: 22.7709, lng: -102.5832 },
  { id: 'guadalajara', name: 'Guadalajara', state: 'Jalisco', ref_state: 'Jalisco', region: 'Occidente', lat: 20.6597, lng: -103.3496 },
  { id: 'colima', name: 'Colima', state: 'Colima', ref_state: 'Colima', region: 'Occidente', lat: 19.2433, lng: -103.725 },
  { id: 'tepic', name: 'Tepic', state: 'Nayarit', ref_state: 'Nayarit', region: 'Occidente', lat: 21.5039, lng: -104.8946 },
  { id: 'monterrey', name: 'Monterrey', state: 'Nuevo León', ref_state: 'Nuevo León', region: 'Noreste', lat: 25.6866, lng: -100.3161 },
  { id: 'reynosa', name: 'Reynosa', state: 'Tamaulipas', ref_state: 'Tamaulipas', region: 'Noreste', lat: 26.0508, lng: -98.2979 },
  { id: 'torreon', name: 'Torreón', state: 'Coahuila', ref_state: 'Coahuila', region: 'Norte', lat: 25.5428, lng: -103.4068 },
  { id: 'chihuahua', name: 'Chihuahua', state: 'Chihuahua', ref_state: 'Chihuahua', region: 'Norte', lat: 28.632, lng: -106.0691 },
  { id: 'durango', name: 'Durango', state: 'Durango', ref_state: 'Durango', region: 'Norte', lat: 24.0277, lng: -104.6532 },
  { id: 'culiacan', name: 'Culiacán', state: 'Sinaloa', ref_state: 'Sinaloa', region: 'Noroeste', lat: 24.8091, lng: -107.394 },
  { id: 'hermosillo', name: 'Hermosillo', state: 'Sonora', ref_state: 'Sonora', region: 'Noroeste', lat: 29.0729, lng: -110.9559 },
  { id: 'tijuana', name: 'Tijuana', state: 'Baja California', ref_state: 'Baja California', region: 'Noroeste', lat: 32.5149, lng: -117.0382 },
  { id: 'la_paz', name: 'La Paz', state: 'Baja California Sur', ref_state: 'Baja California Sur', region: 'Noroeste', lat: 24.1426, lng: -110.3128 },
  { id: 'acapulco', name: 'Acapulco', state: 'Guerrero', ref_state: 'Guerrero', region: 'Sur', lat: 16.8531, lng: -99.8237 },
  { id: 'oaxaca', name: 'Oaxaca', state: 'Oaxaca', ref_state: 'Oaxaca', region: 'Sur', lat: 17.0732, lng: -96.7266 },
  { id: 'tuxtla', name: 'Tuxtla Gutiérrez', state: 'Chiapas', ref_state: 'Chiapas', region: 'Sur', lat: 16.7516, lng: -93.1029 },
  { id: 'xalapa', name: 'Xalapa', state: 'Veracruz', ref_state: 'Veracruz', region: 'Golfo', lat: 19.5438, lng: -96.9102 },
  { id: 'veracruz', name: 'Veracruz (puerto)', state: 'Veracruz', ref_state: 'Veracruz', region: 'Golfo', lat: 19.1738, lng: -96.1342 },
  { id: 'villahermosa', name: 'Villahermosa', state: 'Tabasco', ref_state: 'Tabasco', region: 'Golfo', lat: 17.9892, lng: -92.9475 },
  { id: 'merida', name: 'Mérida', state: 'Yucatán', ref_state: 'Yucatán', region: 'Península', lat: 20.9674, lng: -89.5926 },
  { id: 'campeche', name: 'Campeche', state: 'Campeche', ref_state: 'Campeche', region: 'Península', lat: 19.8301, lng: -90.5349 },
  { id: 'cancun', name: 'Cancún', state: 'Quintana Roo', ref_state: 'Quintana Roo', region: 'Península', lat: 21.1619, lng: -86.8515 },
];
// ---------- Catálogo completo del INEGI (2,478 municipios, 32 estados) ----------
// Se carga de src/data/municipios-inegi.json (scripts/fetch-municipios.js). Los municipios de arriba conservan
// su identificador corto (ej. "morelia") y sustituyen a su equivalente del INEGI para no duplicarse.
const STATE_SHORT = { 'Coahuila de Zaragoza': 'Coahuila', 'Michoacán de Ocampo': 'Michoacán', 'Veracruz de Ignacio de la Llave': 'Veracruz', 'México': 'Estado de México' };
const REF_STATE = { 'Ciudad de México': 'DF', 'Estado de México': 'México' }; // claves del archivo de referencia de precios
const INEGI = new Map();
let STATES = [...new Set(MUNICIPALITIES.map((m) => m.state))];
let geoSource = null;

export function setMunicipios(data) {
  if (!data?.municipios?.length) return;
  INEGI.clear();
  const ent = Object.fromEntries((data.estados || []).map((e) => [e.cve, STATE_SHORT[e.nombre] || e.nombre]));
  const curatedBy = new Map(MUNICIPALITIES.map((m) => [`${m.state}|${normalize(m.inegi_name || m.name.replace(/\s*\(.*\)/, ''))}`, m]));
  for (const [cvegeo, nombre, lat, lng, pob] of data.municipios) {
    const state = ent[cvegeo.slice(0, 2)];
    const cur = curatedBy.get(`${state}|${normalize(nombre)}`);
    if (cur) { Object.assign(cur, { inegi: cvegeo, pob, lat, lng }); continue; } // coordenadas reales de la cabecera
    INEGI.set(cvegeo, { id: cvegeo, inegi: cvegeo, name: nombre, state, ref_state: REF_STATE[state] || state, region: state, lat, lng, pob });
  }
  STATES = Object.values(ent).sort((a, b) => a.localeCompare(b, 'es'));
  geoSource = data.fuente || 'INEGI';
}
export const geoLoaded = () => INEGI.size > 0;
export const geoFuente = () => geoSource;
export const municipality = (id) => MUNICIPALITIES.find((m) => m.id === id) || INEGI.get(id);
export const allStates = () => STATES;
export const STATES_ORDER = STATES;
/** Municipios de un estado (los curados primero no: todo por orden alfabético). */
export function municipalitiesOf(state) {
  return [...MUNICIPALITIES.filter((m) => m.state === state), ...[...INEGI.values()].filter((m) => m.state === state)]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

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
