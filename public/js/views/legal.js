import { e } from '../ui.js';
import { PRODUCTS, stockPhoto } from '../shared/catalog.js';

export default async function legal({ app, opts }) {
  if (opts.page === 'creditos') {
    app.innerHTML = `<div class="wrap page stack" style="max-width:760px">
      <span class="mono-tag">Créditos</span><h1>Fotos, datos y tipografía</h1>
      <p class="muted">Las fotos que suben los productores son suyas. Cuando una oferta no tiene foto, mostramos una foto real de referencia de Wikimedia Commons, marcada como “referencia”.</p>
      <div class="card"><table><thead><tr><th>Producto</th><th>Archivo</th><th>Autor</th><th>Licencia</th></tr></thead><tbody>
        ${PRODUCTS.map((p) => [p.name, stockPhoto(p.name)]).filter(([, s]) => s).map(([n, s]) => `<tr><td>${e(n)}</td><td><a href="${e(s.page)}" target="_blank" rel="noopener">${e(s.file)}</a></td><td>${e(s.author)}</td><td>${e(s.license)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="card stack">
        <p><strong>Precios de mercado:</strong> Sistema Nacional de Información e Integración de Mercados (SNIIM), Secretaría de Economía.</p>
        <p><strong>Clima:</strong> Open-Meteo.com, datos bajo CC BY 4.0 (uso no comercial gratuito).</p>
        <p><strong>Mapas:</strong> © colaboradores de OpenStreetMap; Leaflet.</p>
        <p style="margin:0"><strong>Tipografía:</strong> DM Sans, SIL Open Font License (<a href="/fonts/OFL-DMSans.txt">licencia</a>).</p>
      </div></div>`;
    return;
  }
  app.innerHTML = `<div class="wrap page stack" style="max-width:760px">
    <span class="mono-tag">Borrador para revisión legal</span>
    <h1>Aviso de privacidad (simplificado)</h1>
    <p class="muted">Prototipo de HackPony 2026. Antes de operar con usuarios reales, este texto debe revisarlo un abogado conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares vigente (publicada en el DOF el 20 de marzo de 2025).</p>
    <div class="card stack">
      <h3>¿Qué datos pedimos?</h3>
      <ul>
        <li><strong>Obligatorios:</strong> nombre, teléfono (WhatsApp), municipio y contraseña (se guarda cifrada con <em>scrypt</em>; nadie puede leerla).</li>
        <li><strong>Opcionales:</strong> correo electrónico, nombre del negocio, punto de recolección, dirección de entrega de un flete, datos del vehículo (transportistas) y fotos de productos.</li>
        <li><strong>No pedimos datos sensibles</strong> (salud, origen étnico, creencias, preferencias, datos bancarios). El correo y el teléfono son datos personales, no sensibles; aun así los protegemos y el correo es opcional.</li>
      </ul>
      <h3>¿Para qué los usamos?</h3>
      <ul><li>Crear tu cuenta, publicar y apartar productos, coordinar recolecciones y fletes, avisarte de tus pedidos y atender reportes.</li><li>No vendemos ni compartimos tus datos con fines publicitarios.</li></ul>
      <h3>¿Quién ve qué?</h3>
      <ul>
        <li>En el tablero sólo se ve el <strong>municipio</strong>, nunca tu ubicación exacta.</li>
        <li>Tu teléfono y punto exacto sólo los ve quien tiene un pedido o flete contigo.</li>
        <li>Los comercios registrados pueden ver el WhatsApp del productor para preguntar disponibilidad.</li>
        <li>La administración ve los datos necesarios para moderar y atender reportes.</li>
      </ul>
      <h3>Voz, cámara y clima</h3>
      <ul>
        <li>El dictado lo hace tu navegador (en Chrome se procesa en servidores de Google). No grabamos ni guardamos audio ni transcripciones.</li>
        <li>La cámara sólo se usa cuando tú la abres; la foto se reduce en tu teléfono y sólo se guarda si publicas.</li>
        <li>El clima se consulta con las coordenadas de la cabecera municipal, no con tu ubicación.</li>
      </ul>
      <h3>Reportes</h3>
      <p>Los reportes llegan al panel de administración; cada administrador recibe un aviso. Cuando se resuelven, quien reportó recibe una notificación con la resolución. Puedes ver tus reportes en tu perfil.</p>
      <h3>Tus derechos</h3>
      <p style="margin:0">Puedes pedir acceso, rectificación, cancelación u oposición (derechos ARCO) sobre tus datos. En el piloto se atenderán por el canal de contacto del equipo; falta definir el responsable formal y el medio de contacto oficial.</p>
    </div></div>`;
}
