import { api } from '../api.js';
import { state, renderNav } from '../app.js';
import { $, e, toast, muniOptions, fieldErrors } from '../ui.js';

export default async function profile({ app }) {
  const u = state.user;
  const isProducer = u.role === 'productor';
  app.innerHTML = `
  <div class="wrap page" style="max-width:560px">
    <h1>Mi perfil</h1>
    <p class="muted">${isProducer ? 'Productor / distribuidor' : u.role === 'comprador' ? 'Comercio' : 'Administración'}</p>
    <form id="pf" class="card" novalidate>
      <div class="field"><label for="name">Nombre</label><input id="name" name="name" value="${e(u.name)}"><div class="err" data-for="name"></div></div>
      <div class="field"><label for="business_name">${isProducer ? 'Huerta o negocio' : 'Negocio'}</label><input id="business_name" name="business_name" value="${e(u.business_name || '')}"></div>
      <div class="field"><label for="phone">WhatsApp</label><input id="phone" name="phone" inputmode="tel" value="${e(u.phone || '')}"><div class="hint">Para la demo puedes poner tu propio número y probar los mensajes.</div><div class="err" data-for="phone"></div></div>
      <div class="field"><label for="municipality">Municipio</label><select id="municipality" name="municipality">${muniOptions(u.municipality)}</select><div class="err" data-for="municipality"></div></div>
      ${isProducer ? `<div class="field"><label for="pickup_point">Punto de recolección habitual</label><input id="pickup_point" name="pickup_point" value="${e(u.pickup_point || '')}" placeholder="Ej. Entrada del rancho, junto a la báscula"><div class="hint">Se usa por defecto al publicar. Sólo lo ven compradores con pedido.</div></div>` : ''}
      <button class="btn big">Guardar</button>
    </form>
  </div>`;
  $('#pf').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      const { user } = await api('/api/me', { method: 'PATCH', body: Object.fromEntries(new FormData(ev.target)) });
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
