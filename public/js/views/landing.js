import { api } from '../api.js';
import { e, mxn, kg } from '../ui.js';

export default async function landing({ app, state }) {
  let s = null;
  try {
    s = (await api('/api/stats')).stats;
  } catch { /* la landing funciona sin estadísticas */ }

  const cta = state.user
    ? state.user.role === 'productor'
      ? `<a class="btn big" href="#/publicar">➕ Publicar producto</a><a class="btn big secondary" href="#/productor">Ir a mi panel</a>`
      : `<a class="btn big" href="#/ofertas">Ver ofertas de hoy</a><a class="btn big secondary" href="#/comprador">Mis pedidos</a>`
    : `<a class="btn big" href="#/registro?rol=productor">🌱 Vendo producto</a><a class="btn big secondary" href="#/ofertas">🍽️ Compro para mi negocio</a>`;

  app.innerHTML = `
  <section class="hero">
    <div class="wrap hero-grid">
      <div class="stack">
        <div class="eyebrow">Rescate de perecederos · Michoacán</div>
        <h1>Del campo a tu negocio, sin desperdicio.</h1>
        <p class="lede">Cuando un lote de fruta o verdura no salió por el canal de siempre, publícalo en menos de un minuto con precio de rescate.
        Fondas, fruterías y comedores cercanos lo apartan al instante y pasan por él.</p>
        <div class="two" style="max-width:520px">${cta}</div>
        <p class="small muted">Sin comisiones en el piloto · El pago se acuerda directo (efectivo o transferencia) · Sigue usando tu WhatsApp</p>
      </div>
      <div class="hero-card" aria-label="Ejemplo de cálculo">
        <div class="row between"><span class="pill warn">Por vencer · 23:59:10</span><span class="small">Tarímbaro</span></div>
        <h3 style="margin-top:12px">🍅 Jitomate maduro · 100 kg</h3>
        <div class="price" style="color:#fff">$12/kg <s style="color:#cfdcc6">$25 habitual</s></div>
        <dl class="kv" style="margin-top:12px;color:#e8efe3">
          <dt style="color:#cfdcc6">Una fonda aparta</dt><dd>20 kg</dd>
          <dt style="color:#cfdcc6">Paga</dt><dd>$240</dd>
          <dt style="color:#cfdcc6">Ahorra</dt><dd>$260 (52%)</dd>
          <dt style="color:#cfdcc6">El productor recupera</dt><dd>$240 que iba a perder</dd>
        </dl>
        <p class="tiny" style="margin-top:10px;color:#cfdcc6">Ejemplo ilustrativo con el escenario de la demo.</p>
      </div>
    </div>
  </section>

  ${s ? `
  <section class="section" style="padding-top:0">
    <div class="wrap">
      <div class="row between"><h2>Lo que ha pasado en la plataforma</h2>${s.demo_records ? '<span class="pill demo">Incluye datos de demostración</span>' : ''}</div>
      <div class="kpis">
        <div class="kpi main"><b>${kg(s.collected_g)}</b><span>rescatados con entrega confirmada</span></div>
        <div class="kpi"><b>${mxn(s.producer_income_c)}</b><span>recuperados por productores</span></div>
        <div class="kpi"><b>${mxn(s.buyer_savings_c)}</b><span>ahorro de comercios</span></div>
        <div class="kpi"><b>${kg(s.available_g)}</b><span>disponibles ahora</span></div>
      </div>
      <p class="small" style="margin-top:8px"><a href="#/impacto">Ver indicadores completos →</a></p>
    </div>
  </section>` : ''}

  <section class="section band">
    <div class="wrap stack">
      <h2>El problema es de tiempo, no de calidad</h2>
      <p>Un estudio del Banco Mundial (2017) estimó que en México se pierden y desperdician alrededor de <strong>20.4 millones de toneladas de alimentos al año</strong>, cerca del 34% de lo producido para consumo humano, con un costo estimado de 491 mil millones de pesos.</p>
      <p>Michoacán es líder nacional en aguacate, fresa y guayaba. Cuando un lote se retrasa o el comprador habitual no llega, el producto sigue siendo bueno pero ya no aguanta la espera: le faltan <em>horas</em>, no calidad.</p>
      <p class="tiny" style="opacity:.8">Fuentes: Banco Mundial, «Pérdidas y desperdicios de alimentos en México» (2017, muestra de 79 productos); SADER Michoacán / SIAP. La cifra nacional es una estimación de 2017, no una medición de este proyecto.</p>
    </div>
  </section>

  <section class="section">
    <div class="wrap">
      <h2>Cómo funciona</h2>
      <div class="split how">
        <div class="card"><h3>El productor publica</h3><p class="muted">Producto, kilos, precio habitual, precio de rescate y horas de frescura. También puede dictarlo como lo diría por WhatsApp.</p></div>
        <div class="card"><h3>El comercio aparta</h3><p class="muted">Ve el temporizador, el ahorro y la distancia aproximada. Aparta sólo los kilos que necesita; el inventario se descuenta al instante.</p></div>
        <div class="card"><h3>Se recoge y se confirma</h3><p class="muted">Coordinan por WhatsApp. Al entregar, el productor captura el código de 6 dígitos del comprador. Sólo entonces cuenta como rescatado.</p></div>
      </div>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <div class="wrap split">
      <div class="card"><h3>✅ Lo que sí hace</h3><p class="muted small">Da una salida rápida a excedentes aptos para consumo, sin sustituir a tus compradores de siempre ni a la central de abasto.</p></div>
      <div class="card"><h3>🚫 Lo que no hace</h3><p class="muted small">No cobra pagos, no ofrece transporte propio y no certifica la inocuidad: el tiempo de frescura es una estimación declarada por el productor.</p></div>
      <div class="card"><h3>🔒 Tu ubicación</h3><p class="muted small">En las ofertas sólo se ve el municipio. El punto exacto de recolección se comparte únicamente con quien aparta.</p></div>
    </div>
  </section>

  <footer><div class="wrap">
    <strong>Raíz Directa</strong> · Prototipo para HackPony 2026, Reto 03 Campo y Alimentos · Instituto Tecnológico de Morelia.<br>
    Los productores, comercios, teléfonos y precios de la demostración son ficticios y no representan alianzas reales.
  </div></footer>`;
}
