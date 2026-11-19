// "Mi transporte": el productor da de alta a su propio personal de reparto y ve sus entregas a domicilio.
import { api } from '../api.js';
import { $, e, kg, toast, fieldErrors, fmtDate } from '../ui.js';

const I = (n) => `<svg class="i" aria-hidden="true"><use href="/icons.svg#${n}"/></svg>`;
const ST = { abierta: ['Por asignar', 'warn'], asignada: ['Asignada', 'info'], recogida: ['En camino', 'info'] };

export default async function team({ app }) {
  const [{ drivers }, { deliveries }] = await Promise.all([api('/api/producer/drivers'), api('/api/deliveries')]);
  const active = drivers.filter((d) => d.active);
  app.innerHTML = `
  <div class="wrap page stack" style="max-width:760px">
    <p><a href="#/productor">← Inicio</a></p>
    <div><span class="mono-tag">Mi transporte</span><h1 style="margin:6px 0 0">Entregas y transportistas</h1>
      <p class="muted" style="margin:4px 0 0">Tus transportistas son tu personal: sólo ven las entregas que tú les asignas.</p></div>

    <h2>Entregas a domicilio en curso</h2>
    ${deliveries.length ? deliveries.map((d) => `
      <a class="card row" href="#/pedido/${e(d.folio)}" style="text-decoration:none;color:inherit;flex-wrap:nowrap;gap:12px">
        <div class="grow" style="min-width:0"><div class="row between"><strong>${e(d.product)} · ${kg(d.weight_g)}</strong><span class="pill ${ST[d.status]?.[1] || 'muted'}">${ST[d.status]?.[0] || e(d.status)}</span></div>
          <div class="small muted">${e(d.buyer?.name || '')} · ${e(d.to_name)} · ${fmtDate(d.pickup_at)}</div>
          <div class="small">${d.carrier ? `${I('user')} ${e(d.carrier.name)}` : `${I('alert')} <b>Falta asignar quién lo lleva</b>`}</div></div>
        <span class="btn sm secondary" style="flex:none">${d.status === 'abierta' ? 'Asignar' : 'Ver'}</span>
      </a>`).join('') : '<p class="muted">No hay entregas a domicilio pendientes. Aparecen aquí cuando un comercio pide que se lo lleves.</p>'}

    <h2>Mis transportistas</h2>
    ${drivers.length ? drivers.map((d) => `
      <div class="card row" style="flex-wrap:nowrap;gap:12px;${d.active ? '' : 'opacity:.6'}">
        <div class="grow" style="min-width:0"><strong>${e(d.name)}</strong>${d.active ? '' : ' <span class="pill muted">de baja</span>'}
          <div class="small muted">${I('phone')} ${e(d.phone)} · ${I('truck')} ${e(d.vehicle || '')}${d.capacity_kg ? ` · ${d.capacity_kg} kg` : ''}${d.refrigerated ? ` · ${I('snow')}` : ''}</div>
          <div class="small">${d.active_trips} pendientes · ${d.delivered} entregadas</div></div>
        <button class="btn sm ${d.active ? 'ghost' : 'secondary'}" data-toggle="${d.id}" data-on="${d.active ? 0 : 1}" style="flex:none">${d.active ? 'Dar de baja' : 'Reactivar'}</button>
      </div>`).join('') : '<p class="muted">Aún no registras a nadie.</p>'}

    <details class="card" ${active.length ? '' : 'open'}><summary><strong>${I('plus')} Agregar transportista</strong></summary>
      <form id="add" class="stack" novalidate style="margin-top:10px">
        <div class="field"><label for="name">Nombre</label><input id="name" name="name" required><div class="err" data-for="name"></div></div>
        <div class="field"><label for="phone">Teléfono (con él entra a la app)</label><input id="phone" name="phone" inputmode="tel" placeholder="10 dígitos"><div class="err" data-for="phone"></div></div>
        <div class="two">
          <div class="field"><label for="vehicle">Vehículo</label><input id="vehicle" name="vehicle" placeholder="Ej. Camioneta 3.5 t"></div>
          <div class="field"><label for="capacity_kg">Carga máxima</label><div class="input-unit"><input id="capacity_kg" name="capacity_kg" inputmode="numeric" placeholder="1500"><span>kg</span></div><div class="err" data-for="capacity_kg"></div></div>
        </div>
        <label class="inline-check"><input type="checkbox" name="refrigerated"><span>Tiene refrigeración</span></label>
        <div class="field"><label for="password">Contraseña para su cuenta</label><input id="password" name="password" type="text" autocomplete="off" minlength="8"><div class="hint">Mínimo 8 caracteres. Dásela en persona; podrá entrar con su teléfono y esta contraseña.</div><div class="err" data-for="password"></div></div>
        <button class="btn">${I('plus')} Agregar</button>
      </form>
    </details>
  </div>`;

  $('#add').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const body = Object.fromEntries(new FormData(f));
    body.refrigerated = !!f.refrigerated.checked;
    try {
      await api('/api/producer/drivers', { method: 'POST', body });
      toast(`${body.name} ya puede entrar con su teléfono`, 'ok');
      team({ app });
    } catch (err) {
      fieldErrors(f, err.fields);
      toast(Object.values(err.fields || {})[0] || err.message, 'error');
    }
  });
  app.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await api(`/api/producer/drivers/${b.dataset.toggle}`, { method: 'PATCH', body: { active: b.dataset.on === '1' } });
      team({ app });
    } catch (err) {
      toast(err.message, 'error');
    }
  }));
}
