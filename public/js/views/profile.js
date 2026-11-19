import { api } from '../api.js';
import { state, renderNav } from '../app.js';
import { $, e, toast, muniOptions, fieldErrors } from '../ui.js';

export default async function profile({ app }) {
  const u = state.user;
  const isProducer = u.role === 'productor';
  app.innerHTML = `
  <div class="wrap page" style="max-width:560px">
    <h1>Mi perfil</h1>
    <p class="muted">${isProducer ? 'Productor / distribuidor' : u.role === 'comprador' ? 'Comercio' : u.role === 'transportista' ? 'Transportista independiente' : 'Administración'}</p>
    <form id="pf" class="card" novalidate>
      <div class="field"><label for="name">Nombre</label><input id="name" name="name" value="${e(u.name)}"><div class="err" data-for="name"></div></div>
      <div class="field"><label for="business_name">${isProducer ? 'Huerta o negocio' : 'Negocio'}</label><input id="business_name" name="business_name" value="${e(u.business_name || '')}"></div>
      <div class="field"><label for="phone">WhatsApp</label><input id="phone" name="phone" inputmode="tel" value="${e(u.phone || '')}"><div class="hint">Para la demo puedes poner tu propio número y probar los mensajes.</div><div class="err" data-for="phone"></div></div>
      <div class="field"><label for="municipality">Municipio</label><select id="municipality" name="municipality">${muniOptions(u.municipality)}</select><div class="err" data-for="municipality"></div></div>
      ${isProducer ? `<div class="field"><label for="pickup_point">Punto de recolección habitual</label><input id="pickup_point" name="pickup_point" value="${e(u.pickup_point || '')}" placeholder="Ej. Entrada del rancho, junto a la báscula"><div class="hint">Se usa por defecto al publicar. Sólo lo ven compradores con pedido.</div></div>` : ''}
      ${u.role === 'transportista' ? `<div class="field"><label for="vehicle">Vehículo</label><input id="vehicle" name="vehicle" value="${e(u.vehicle || '')}"></div>
      <div class="two"><div class="field"><label for="capacity_kg">Carga máxima (kg)</label><input id="capacity_kg" name="capacity_kg" inputmode="numeric" value="${e(u.capacity_kg || '')}"><div class="err" data-for="capacity_kg"></div></div>
      <div class="field"><label for="radius_km">Radio de trabajo (km)</label><input id="radius_km" name="radius_km" inputmode="numeric" value="${e(u.radius_km || 40)}"><div class="err" data-for="radius_km"></div></div></div>
      <div class="field"><label class="inline-check"><input type="checkbox" name="refrigerated" ${u.refrigerated ? 'checked' : ''}><span>Tengo refrigeración</span></label></div>` : ''}
      <button class="btn big">Guardar</button>
    </form>
    <div class="card stack" style="margin-top:14px"><h3>Mis reportes</h3><div id="myReports" class="small muted">Cargando…</div></div>
    <p class="small" style="margin-top:14px"><a href="#/privacidad">Aviso de privacidad</a> · <a href="#/creditos">Créditos de fotos y datos</a></p>
  </div>`;
  api('/api/reports/mine').then(({ reports }) => {
    $('#myReports').innerHTML = reports.length
      ? reports.map((r) => `<div style="padding:6px 0;border-top:1px solid var(--line)"><strong>#${r.id}</strong> · ${e(r.product || r.folio || '')} · <span class="pill ${r.status === 'abierto' ? 'warn' : 'muted'}">${e(r.status)}</span>${r.resolution ? `<div>${e(r.resolution)}</div>` : ''}</div>`).join('')
      : 'No has enviado reportes. Si algo sale mal con un pedido, usa “Reportar un problema”; llega directo a la administración.';
  }).catch(() => { $('#myReports').textContent = 'Sin conexión.'; });
  $('#pf').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(ev.target));
      if (u.role === 'transportista') body.refrigerated = !!ev.target.refrigerated.checked;
      const { user } = await api('/api/me', { method: 'PATCH', body });
      state.user = user;
      localStorage.setItem('rd_user', JSON.stringify(user));
      renderNav();
      toast('Perfil actualizado', 'ok');
    } catch (err) {
      fieldErrors(ev.target, err.fields);
      toast(err.message, 'error');
    }
  });
}
