import { api } from '../api.js';
import { afterLogin } from '../app.js';
import { $, e, toast, muniOptions, fieldErrors } from '../ui.js';


export default async function authView({ app, opts, query }) {
  if (opts.mode === 'login') return login(app);
  return register(app, ['comprador', 'productor', 'transportista'].includes(query.rol) ? query.rol : null);
}

function login(app) {
  app.innerHTML = `
  <div class="wrap page" style="max-width:460px">
    <h1>Entrar</h1>
    <form id="f" class="card" novalidate>
      <div id="regmsg" class="alert error" role="alert" hidden></div>
      <div class="field"><label for="identifier">Teléfono o correo</label>
        <input id="identifier" name="identifier" inputmode="email" autocomplete="username" required placeholder="10 dígitos">
      </div>
      <div class="field"><label for="password">Contraseña</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
      </div>
      <p class="err" id="msg" role="alert"></p>
      <button class="btn big" type="submit">Entrar</button>
      <p class="center small" style="margin-top:12px">¿No tienes cuenta? <a href="#/registro">Regístrate gratis</a></p>
    </form>
  </div>`;
  const f = $('#f');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try {
      const { user } = await api('/api/auth/login', { method: 'POST', body: { identifier: f.identifier.value, password: f.password.value } });
      toast(`Hola, ${user.name.split(' ')[0]}`, 'ok');
      afterLogin(user);
    } catch (err) {
      $('#msg').textContent = err.message;
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });
}

function register(app, role) {
  role = role || 'comprador';
  app.innerHTML = `
  <div class="wrap page" style="max-width:520px">
    <h1>Crear cuenta</h1>
    <p class="muted">Sólo lo necesario. Puedes completar tu perfil después.</p>
    <form id="f" class="card" novalidate>
      <div id="regmsg" class="alert error" role="alert" hidden></div>
      <div class="field"><label>¿Qué vas a hacer?</label>
        <div class="seg" role="radiogroup">
          <button type="button" data-role="productor" class="${role === 'productor' ? 'on' : ''}"><svg class="i" aria-hidden="true"><use href="/icons.svg#sprout"/></svg> Vendo</button>
          <button type="button" data-role="comprador" class="${role === 'comprador' ? 'on' : ''}"><svg class="i" aria-hidden="true"><use href="/icons.svg#utensils"/></svg> Compro</button>
          <button type="button" data-role="transportista" class="${role === 'transportista' ? 'on' : ''}"><svg class="i" aria-hidden="true"><use href="/icons.svg#truck"/></svg> Transporto</button>
        </div>
        <div class="err" data-for="role"></div>
      </div>
      <div class="field"><label for="name">Tu nombre</label><input id="name" name="name" autocomplete="name" required><div class="err" data-for="name"></div></div>
      <div class="field" id="biz" ${role === 'comprador' ? '' : 'hidden'}>
        <label for="business_name">Nombre del negocio <span class="muted">(opcional)</span></label><input id="business_name" name="business_name" placeholder="Ej. Fonda Doña Lupe">
        <div class="err" data-for="business_name"></div>
        <label for="business_type" style="margin-top:10px">Tipo de negocio</label>
        <select id="business_type" name="business_type">
          ${['fonda', 'restaurante', 'fruteria', 'jugueria', 'comedor', 'mercado', 'hotel', 'otro'].map((t) => `<option value="${t}">${t[0].toUpperCase() + t.slice(1).replace('fruteria', 'frutería').replace('jugueria', 'juguería')}</option>`).join('')}
        </select>
      </div>
      <div class="field" id="bizp" ${role === 'productor' ? '' : 'hidden'}>
        <label for="business_name_p">Nombre de tu huerta o negocio <span class="muted">(opcional)</span></label><input id="business_name_p" placeholder="Ej. Huerta Los Encinos">
      </div>
      <div class="field" id="team" ${role === 'transportista' ? '' : 'hidden'}>
        <label for="team_code">Código de tu proveedor</label><input id="team_code" name="team_code" autocapitalize="characters" autocomplete="off" placeholder="Ej. K7P2QX" style="text-transform:uppercase;letter-spacing:.15em">
        <div class="hint">Te lo da el proveedor para el que entregas (lo ve en su panel, en “Mi transporte”). Así sólo verás las entregas de ese proveedor.</div><div class="err" data-for="team_code"></div>
      </div>
      <div class="field" id="veh" ${role === 'transportista' ? '' : 'hidden'}>
        <label for="vehicle">Vehículo</label><input id="vehicle" name="vehicle" placeholder="Ej. Camioneta 3.5 t">
        <div class="two" style="margin-top:10px"><div><label for="capacity_kg">Carga máxima <span class="muted">(opcional)</span></label><div class="input-unit"><input id="capacity_kg" name="capacity_kg" inputmode="numeric" placeholder="1500"><span>kg</span></div><div class="err" data-for="capacity_kg"></div></div>
        <label class="inline-check" style="align-self:end"><input type="checkbox" name="refrigerated"><span>Tengo refrigeración</span></label></div>
      </div>
      <div class="field"><label for="phone">Teléfono (WhatsApp)</label><input id="phone" name="phone" inputmode="tel" autocomplete="tel" placeholder="10 dígitos" required>
        <div class="hint">Con él entras y te contactan por WhatsApp. Sólo se comparte con quien tenga un pedido contigo.</div><div class="err" data-for="phone"></div></div>
      <div class="field" id="muniField" ${role === 'transportista' ? 'hidden' : ''}><label for="municipality">Municipio</label><select id="municipality" name="municipality">${muniOptions('morelia')}</select><div class="err" data-for="municipality"></div></div>
      <div class="field"><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required><div class="hint">Mínimo 8 caracteres.</div><div class="err" data-for="password"></div></div>
      <div class="field"><label for="email">Correo <span class="muted">(opcional)</span></label><input id="email" name="email" type="email" autocomplete="email"><div class="err" data-for="email"></div></div>
      <p class="tiny muted">Tus datos de contacto sólo se usan para coordinar pedidos. Lee el <a href="#/privacidad">aviso de privacidad</a>. El correo es opcional.</p>
      <button class="btn big" type="submit">Crear cuenta</button>
      <p class="center small" style="margin-top:12px">¿Ya tienes cuenta? <a href="#/entrar">Entra</a></p>
    </form>
  </div>`;
  const f = $('#f');
  let chosen = role;
  f.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-role]');
    if (!b) return;
    chosen = b.dataset.role;
    f.querySelectorAll('[data-role]').forEach((x) => x.classList.toggle('on', x === b));
    $('#biz').hidden = chosen !== 'comprador';
    $('#bizp').hidden = chosen !== 'productor';
    $('#veh').hidden = chosen !== 'transportista';
    $('#team').hidden = chosen !== 'transportista';
    $('#muniField').hidden = chosen === 'transportista';
  });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const body = Object.fromEntries(new FormData(f));
    body.role = chosen;
    if (chosen !== 'comprador') delete body.business_type;
    if (chosen === 'productor') body.business_name = $('#business_name_p').value;
    if (chosen === 'transportista') { body.business_name = ''; body.refrigerated = !!f.refrigerated.checked; }
    else { delete body.vehicle; delete body.capacity_kg; delete body.refrigerated; delete body.team_code; }
    const btn = f.querySelector('[type=submit]');
    const box = $('#regmsg');
    box.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Creando cuenta…';
    try {
      const { user } = await api('/api/auth/register', { method: 'POST', body });
      toast('¡Cuenta creada! <svg class="i" aria-hidden="true"><use href="/icons.svg#sprout"/></svg>', 'ok');
      afterLogin(user);
    } catch (err) {
      fieldErrors(f, err.fields);
      const list = Object.values(err.fields || {});
      box.innerHTML = `<b>${e(err.message || 'No se pudo crear la cuenta')}</b>${list.length ? `<ul>${list.map((m) => `<li>${e(m)}</li>`).join('')}</ul>` : ''}`;
      box.hidden = false;
      if (!list.length) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast(list[0] || err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Crear cuenta';
    }
  });
}
