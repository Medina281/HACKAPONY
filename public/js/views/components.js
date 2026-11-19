import { e, mxn, kg, media, statePill, timer } from '../ui.js';
import { qualityLabel } from '../shared/catalog.js';
import { ROAD_FACTOR } from '../shared/calc.js';

export function lotCard(l, { owner = false } = {}) {
  const open = ['disponible', 'por_vencer'].includes(l.state);
  const pct = Math.round((l.available_g / l.total_g) * 100);
  const I = (n) => `<svg class="i" aria-hidden="true"><use href="/icons.svg#${n}"/></svg>`;
  const action = owner
    ? `<a class="round-btn" href="#/oferta/${l.id}" aria-label="Administrar ${e(l.product)}">${I('edit')}</a>`
    : open
      ? `<a class="round-btn" href="#/oferta/${l.id}" data-needs-open aria-label="Apartar ${e(l.product)}">${I('plus')}</a>`
      : `<button class="round-btn" disabled aria-label="${l.state === 'agotado' ? 'Agotado' : 'Vencido'}">${I('x')}</button>`;
  return `
  <article class="lot ${open ? '' : 'closed'} ${l.state === 'por_vencer' ? 'urgent' : ''}" data-lot="${l.id}">
    <a href="#/oferta/${l.id}" class="lot-media" style="text-decoration:none" aria-label="Ver ${e(l.product)}">
      ${media(l.photo, l.product)}
      ${statePill(l.state)}
      <span class="disc">−${Math.round(l.discount)}%</span>
    </a>
    <div class="lot-body">
      <div class="lot-title"><h3>${e(l.product)}</h3>${l.is_demo ? '<span class="pill demo" title="Dato de demostración">demo</span>' : ''}</div>
      <div class="sub">${e(l.producer.name)} · ${e(l.municipality_name)}${l.distance_km != null ? ` · ~${l.distance_km} km` : ''}</div>
      <div class="meta"><span>${I('leaf')} ${e(qualityLabel(l.quality))}</span><span>${I('clock')} ${timer(l.expires_at)}</span>${l.producer_transport ? `<span>${I('truck')} Lo lleva</span>` : ''}${l.distance_km > 40 ? `<span title="Distancia en línea recta mayor a 40 km">${I('alert')} lejos</span>` : ''}</div>
      <div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
      <div class="lot-foot">
        <div><div class="price">${mxn(l.rescue_price_c)}<small>/kg</small></div>
          <div class="tiny muted"><s>${mxn(l.ref_price_c)}</s> ${l.ref_source === 'sniim' ? 'SNIIM' : 'precio productor'} · ${kg(l.available_g)} libres</div></div>
        ${action}
      </div>
    </div>
  </article>`;
}

export const refNote = `<p class="tiny muted">Precio del productor: lo declara él; el precio de rescate lo pone la app y baja solo por tramos (−20% al publicar, hasta −50% al final de las horas de frescura). Distancias en línea recta entre cabeceras municipales; por carretera suelen ser ~${Math.round((ROAD_FACTOR - 1) * 100)}% mayores o más.</p>`;
