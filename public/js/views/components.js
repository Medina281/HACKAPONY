import { e, mxn, kg, media, statePill, timer } from '../ui.js';
import { qualityLabel } from '../shared/catalog.js';
import { ROAD_FACTOR } from '../shared/calc.js';

export function lotCard(l, { owner = false } = {}) {
  const open = ['disponible', 'por_vencer'].includes(l.state);
  const pct = Math.round((l.available_g / l.total_g) * 100);
  const dist = l.distance_km != null
    ? `<span title="Distancia en línea recta entre cabeceras municipales"><svg class="i" aria-hidden="true"><use href="/icons.svg#pin"/></svg> ~${l.distance_km} km línea recta${l.distance_km > 40 ? ' <svg class="i" aria-hidden="true"><use href="/icons.svg#alert"/></svg>' : ''}</span>`
    : '';
  return `
  <article class="lot ${open ? '' : 'closed'} ${l.state === 'por_vencer' ? 'urgent' : ''}" data-lot="${l.id}">
    <a href="#/oferta/${l.id}" class="lot-media" style="text-decoration:none" aria-label="Ver ${e(l.product)}">
      ${media(l.photo, l.product)}
      ${statePill(l.state)}
      <span class="disc">−${Math.round(l.discount)}%</span>
    </a>
    <div class="lot-body">
      <div class="lot-title"><h3>${e(l.product)}</h3>${l.is_demo ? '<span class="pill demo" title="Dato de demostración">demo</span>' : ''}</div>
      <div class="price">${mxn(l.rescue_price_c)}<span class="small muted" style="font-family:var(--sans);font-weight:500">/kg</span><s>${mxn(l.ref_price_c)} ${l.ref_source === 'sniim' ? 'SNIIM' : 'habitual*'}</s></div>
      <div class="meta"><span><svg class="i" aria-hidden="true"><use href="/icons.svg#sprout"/></svg> ${e(l.producer.name)}</span><span><svg class="i" aria-hidden="true"><use href="/icons.svg#pin"/></svg> ${e(l.municipality_name)}</span>${dist}</div>
      <div class="meta"><span><svg class="i" aria-hidden="true"><use href="/icons.svg#leaf"/></svg> ${e(qualityLabel(l.quality))}</span>${l.producer_transport ? '<span><svg class="i" aria-hidden="true"><use href="/icons.svg#truck"/></svg> Productor puede llevarlo</span>' : ''}</div>
      <div class="row between small"><span><strong>${kg(l.available_g)}</strong> de ${kg(l.total_g)} disponibles</span><span><svg class="i" aria-hidden="true"><use href="/icons.svg#clock"/></svg> ${timer(l.expires_at)}</span></div>
      <div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
      <div class="lot-foot">
        ${owner
          ? `<a class="btn secondary" href="#/oferta/${l.id}">Administrar</a>`
          : open
            ? `<a class="btn" href="#/oferta/${l.id}" data-needs-open>Apartar</a>`
            : `<button class="btn" disabled>${l.state === 'agotado' ? 'Agotado' : 'Vencido'}</button>`}
      </div>
    </div>
  </article>`;
}

export const refNote = `<p class="tiny muted">* Precio habitual declarado por el productor como referencia; no proviene de una fuente de mercado verificada. Distancias en línea recta entre cabeceras municipales; por carretera suelen ser ~${Math.round((ROAD_FACTOR - 1) * 100)}% mayores o más.</p>`;
