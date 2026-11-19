import { api } from '../api.js';
import { e, mxn, kg, media } from '../ui.js';

export default async function landing({ app, state }) {
  const [st, feed] = await Promise.all([
    api('/api/stats').then((r) => r.stats).catch(() => null),
    api('/api/lots?sort=urgencia').then((r) => r.lots.slice(0, 3)).catch(() => []),
  ]);
  const u = state.user;
  const home = u ? { productor: '#/productor', comprador: '#/ofertas', transportista: '#/transportista', admin: '#/admin' }[u.role] : null;

  app.innerHTML = `
  <section class="hero">
    <div class="wrap stack">
      <span class="mono-tag">Rescate de perecederos · Michoacán</span>
      <h1>Del campo a tu negocio, <span class="accent">sin desperdicio.</span></h1>
      <p class="lede">Fruta y verdura buena a la que le quedan horas, no calidad. Se publica en un minuto, se aparta al instante y se recoge cerca.</p>
      ${u ? `<a class="btn big" href="${home}" style="max-width:360px">Ir a mi panel →</a>` : `
      <div class="role-cards">
        <a class="role-card" href="#/registro?rol=productor"><div class="ico">🌱</div><strong>Vendo</strong><span class="small muted">Publica por voz o con foto. Recupera lo que ibas a perder.</span></a>
        <a class="role-card" href="#/ofertas"><div class="ico">🍽️</div><strong>Compro</strong><span class="small muted">Fondas, fruterías y comedores: aparta con descuento.</span></a>
        <a class="role-card" href="#/registro?rol=transportista"><div class="ico">🚚</div><strong>Transporto</strong><span class="small muted">Toma fletes cortos en tu zona y cobra directo.</span></a>
      </div>`}
    </div>
  </section>

  ${feed.length ? `<section class="section" style="padding-top:0"><div class="wrap stack">
    <div class="row between"><h2 style="margin:0">Urgentes ahora</h2><a href="#/ofertas" class="small">Ver todas →</a></div>
    <div class="grid">${feed.map((l) => `<a class="card row" href="#/oferta/${l.id}" style="text-decoration:none;color:inherit;flex-wrap:nowrap;padding:10px">
      <div class="lot-media" style="width:96px;margin:0;flex:none;font-size:2rem">${media(l.photo, l.product)}</div>
      <div class="grow"><strong>${e(l.product)}</strong><div class="small muted">${kg(l.available_g)} · ${e(l.municipality_name)}</div><div><strong>${mxn(l.rescue_price_c)}/kg</strong> <span class="pill warn">−${Math.round(l.discount)}%</span></div></div></a>`).join('')}</div>
  </div></section>` : ''}

  ${st ? `<section class="section" style="padding-top:0"><div class="wrap">
    <div class="row between"><h2 style="margin:0">Impacto medido</h2>${st.demo_records ? '<span class="mono-tag">incluye demo</span>' : ''}</div>
    <div class="kpis" style="margin-top:10px">
      <div class="kpi main"><b>${kg(st.collected_g)}</b><span>rescatados con entrega confirmada</span></div>
      <div class="kpi"><b>${mxn(st.producer_income_c)}</b><span>para productores</span></div>
      <div class="kpi"><b>${mxn(st.buyer_savings_c)}</b><span>ahorro de comercios</span></div>
      <div class="kpi"><b>${kg(st.available_g)}</b><span>disponibles ahora</span></div>
    </div></div></section>` : ''}

  <section class="section band"><div class="wrap stack">
    <span class="mono-tag" style="background:rgba(255,255,255,.1);color:#fff;border-color:transparent">El problema</span>
    <h2>Le faltan horas, no calidad.</h2>
    <p>El Banco Mundial (2017) estimó que en México se pierden y desperdician cerca de <strong>20.4 millones de toneladas de alimentos al año</strong>, alrededor del 34% de lo producido. Michoacán es líder nacional en aguacate, fresa y guayaba.</p>
    <p class="tiny" style="opacity:.75">Fuentes: Banco Mundial, «Pérdidas y desperdicios de alimentos en México» (2017); SADER Michoacán / SIAP. Precios de referencia: SNIIM, Secretaría de Economía.</p>
  </div></section>

  <section class="section"><div class="wrap">
    <h2>Cómo funciona</h2>
    <div class="split how">
      <div class="card"><h3>Publica</h3><p class="muted small">Dicta “100 kilos de jitomate a 12 y 50 de cebolla a 8”, toma una foto y confirma.</p></div>
      <div class="card"><h3>Aparta</h3><p class="muted small">Ves temporizador, ahorro, precio SNIIM y distancia. Apartas sólo lo que necesitas.</p></div>
      <div class="card"><h3>Recoge o te lo llevan</h3><p class="muted small">Pasas tú o un transportista de la zona. La entrega se confirma con un código.</p></div>
    </div>
  </div></section>

  <footer><div class="wrap">
    <strong>Raíz Directa</strong> · Prototipo HackPony 2026 · Reto 03 Campo y Alimentos · Instituto Tecnológico de Morelia.<br>
    Datos de demostración ficticios. <a href="#/privacidad">Privacidad</a> · <a href="#/creditos">Créditos</a>
  </div></footer>`;
}
