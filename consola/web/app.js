// Vigía SSH · consola (JavaScript sin dependencias)
'use strict';

const $ = (s) => document.querySelector(s);
// Los usuarios y textos vienen de los logs, es decir, los escribe el atacante: SIEMPRE escapar.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SEV = { media: 'Media', alta: 'Alta', critica: 'Crítica' };
const st = { resumen: null, alertas: [], eventos: [], noLeidas: 0, formCargado: false };

// ---------------------------------------------------------------- API
async function api(ruta, opciones = {}) {
  const r = await fetch(ruta, { headers: { 'Content-Type': 'application/json' }, ...opciones });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}

// ---------------------------------------------------------------- formato
const ahora = () => Date.now() / 1000;
const hora = (t) => new Date(t * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
function hace(t) {
  const s = Math.max(0, Math.round(ahora() - t));
  if (s < 60) return 'hace unos segundos';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return new Date(t * 1000).toLocaleDateString('es-ES');
}
const minutos = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

// ---------------------------------------------------------------- toasts
function toast(titulo, texto, clase = '') {
  const el = document.createElement('div');
  el.className = `toast ${clase}`;
  el.innerHTML = `<b>${esc(titulo)}</b>${esc(texto)}`;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 5500);
}

// ---------------------------------------------------------------- render: cabecera y avisos
function renderResumen() {
  const r = st.resumen;
  if (!r) return;
  const sim = r.config.fuente === 'simulacion';
  const simActivo = !!r.simulador?.activo;  // tolera un servidor antiguo sin simulador
  $('#host').textContent = r.host;
  $('#ssh').textContent = r.ssh ? 'activo' : 'parado';
  $('#fuente').textContent = sim ? 'simulación' : 'registro real';
  $('#insigniaSim').hidden = !sim;

  const btnSim = $('#btnSim');
  btnSim.disabled = !sim;
  btnSim.textContent = simActivo ? 'Detener simulación' : 'Lanzar simulación';
  $('#simAyuda').textContent = !sim ? 'Elige «Simulación» como fuente y guarda.'
    : simActivo ? 'En curso: mira la actividad en directo.' : 'Lista para lanzar.';

  const m = r.motor;
  const pill = $('#estadoMotor');
  pill.classList.toggle('activo', m.activo);
  pill.querySelector('span').textContent = m.activo ? 'Vigilando' : 'Detenido';
  const btn = $('#btnMotor');
  btn.textContent = m.activo ? 'Detener' : 'Iniciar vigilancia';
  btn.classList.toggle('btn-sec', m.activo);

  const avisos = [];
  if (!('simulador' in r)) avisos.push('La consola en marcha es una versión antigua. Párala con <code>Ctrl+C</code> en su terminal y vuelve a lanzar <code>./consola.sh</code>.');
  if (!r.ssh && !sim) avisos.push('El servicio SSH está parado, así que no hay nada que vigilar. Arráncalo con <code>sudo systemctl start ssh</code>.');
  if (m.externos > 0) avisos.push(`Hay ${plural(m.externos, 'copia', 'copias')} de <code>vigia_ssh.sh</code> ejecutándose fuera de la consola. Sus alertas no aparecerán aquí salvo que apunten a este webhook; ciérralas para evitar duplicados.`);
  $('#avisos').innerHTML = avisos.map((a) => `<div class="aviso">${a}</div>`).join('');

  renderAjustes();
}

// ---------------------------------------------------------------- render: KPIs
function renderKpis() {
  const desde = ahora() - 3600;
  const recientes = st.eventos.filter((e) => e.t >= desde);
  const fallos = recientes.filter((e) => e.tipo === 'fallo');
  const accesos = recientes.filter((e) => e.tipo === 'acceso');
  const ipsFallo = new Set(fallos.map((e) => e.ip));
  const sospechosos = accesos.filter((e) => ipsFallo.has(e.ip));

  $('#kpiFallos').textContent = fallos.length;
  $('#kpiIps').textContent = ipsFallo.size;
  $('#kpiAccesos').textContent = accesos.length;
  $('#kpiAccesos').classList.toggle('critico', sospechosos.length > 0);
  $('#kpiAccesosPie').textContent = sospechosos.length
    ? `${plural(sospechosos.length, 'desde una IP', 'desde IPs')} con fallos previos`
    : 'última hora';

  const dia = st.alertas.filter((a) => a.recibida >= ahora() - 86400 && !a.alerta.prueba);
  $('#kpiAlertas').textContent = dia.length;
  const cuenta = (s) => dia.filter((a) => a.alerta.severidad === s).length;
  const partes = [['critica', 'crítica', 'críticas'], ['alta', 'alta', 'altas'], ['media', 'media', 'medias']]
    .map(([s, uno, varios]) => (cuenta(s) ? plural(cuenta(s), uno, varios) : null)).filter(Boolean);
  $('#kpiAlertasPie').textContent = partes.length ? partes.join(' · ') : 'últimas 24 h';
}

// ---------------------------------------------------------------- render: gráfico (SVG a mano)
function renderGrafico() {
  const N = 60, W = 600, H = 190, izq = 28, abajo = 20, arriba = 8;
  const fin = Math.floor(ahora() / 60) * 60 + 60; // final del minuto actual
  const ini = fin - N * 60;
  const fallos = new Array(N).fill(0), accesos = new Array(N).fill(0);
  for (const e of st.eventos) {
    const i = Math.floor((e.t - ini) / 60);
    if (i < 0 || i >= N) continue;
    (e.tipo === 'fallo' ? fallos : accesos)[i]++;
  }
  const max = Math.max(4, ...fallos);
  const paso = Math.ceil(max / 4);
  const tope = paso * 4;
  const alto = H - abajo - arriba, ancho = (W - izq) / N;
  const y = (v) => arriba + alto - (v / tope) * alto;

  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Intentos fallidos por minuto en la última hora">`;
  for (let v = 0; v <= tope; v += paso) {
    svg += `<line class="rejilla-linea" x1="${izq}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text class="eje" x="${izq - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
  }
  fallos.forEach((v, i) => {
    const x = izq + i * ancho + 1;
    const etiqueta = `${hora(ini + i * 60).slice(0, 5)} · ${plural(v, 'fallo', 'fallos')}${accesos[i] ? ` · ${plural(accesos[i], 'acceso', 'accesos')}` : ''}`;
    if (v) svg += `<rect class="barra-fallo" x="${x}" y="${y(v)}" width="${ancho - 2}" height="${y(0) - y(v)}" rx="1.5"><title>${etiqueta}</title></rect>`;
    if (accesos[i]) svg += `<rect class="marca-acceso" x="${x}" y="${y(0) + 3}" width="${ancho - 2}" height="3" rx="1"><title>${etiqueta}</title></rect>`;
  });
  [60, 45, 30, 15, 0].forEach((m) => {
    const x = izq + (N - m) * ancho - (m === 0 ? 0 : ancho / 2);
    svg += `<text class="eje" x="${Math.min(x, W - 2)}" y="${H - 4}" text-anchor="${m === 0 ? 'end' : 'middle'}">${m === 0 ? 'ahora' : `−${m} min`}</text>`;
  });
  svg += '</svg>';
  $('#grafico').innerHTML = svg +
    '<div class="leyenda"><span><i style="background:var(--acento)"></i>Intentos fallidos</span><span><i style="background:var(--ok)"></i>Accesos correctos</span></div>';
}

// ---------------------------------------------------------------- render: top orígenes
function renderTop() {
  const desde = ahora() - 3600;
  const porIp = new Map();
  for (const e of st.eventos) {
    if (e.t < desde || e.tipo !== 'fallo') continue;
    const x = porIp.get(e.ip) || { ip: e.ip, n: 0, usuarios: new Set(), ultimo: 0 };
    x.n++; x.usuarios.add(e.usuario); x.ultimo = Math.max(x.ultimo, e.t);
    porIp.set(e.ip, x);
  }
  const top = [...porIp.values()].sort((a, b) => b.n - a.n).slice(0, 6);
  if (!top.length) { $('#top').innerHTML = '<li class="vacio">Sin intentos fallidos en la última hora.</li>'; return; }
  const max = top[0].n;
  const blanca = new Set(st.resumen?.lista_blanca || []);
  $('#top').innerHTML = top.map((x) => `
    <li>
      <div class="fila"><span class="mono">${esc(x.ip)}${blanca.has(x.ip) ? '<span class="etiqueta">lista blanca</span>' : ''}</span>
        <span class="num">${x.n}</span></div>
      <div class="pista"><div class="relleno" style="width:${(x.n / max) * 100}%"></div></div>
      <div class="detalle">${plural(x.usuarios.size, 'usuario', 'usuarios')} · último ${esc(hace(x.ultimo))}</div>
    </li>`).join('');
}

// ---------------------------------------------------------------- render: alertas
function renderAlertas(idNueva) {
  const lista = st.alertas.slice(0, 100);
  $('#alertasSub').textContent = st.alertas.length ? `${st.alertas.length} en el historial` : '';
  if (!lista.length) {
    $('#alertas').innerHTML = '<tr><td colspan="7" class="vacio">Sin alertas. Todo tranquilo.</td></tr>';
    return;
  }
  const blanca = new Set(st.resumen?.lista_blanca || []);
  $('#alertas').innerHTML = lista.map((reg) => {
    const a = reg.alerta;
    const usuarios = a.usuarios || [];
    const chips = usuarios.slice(0, 5).map((u) => `<span class="chip">${esc(u)}</span>`).join('') +
      (usuarios.length > 5 ? `<span class="chip">+${usuarios.length - 5}</span>` : '');
    const canal = { ok: ['Consola + webhook', ''], error: ['Webhook falló', 'error'], no: ['Consola', ''] }[reg.reenvio] || ['Consola', ''];
    const sev = SEV[a.severidad] ? a.severidad : 'media';
    return `<tr class="${reg.id === idNueva ? 'nueva' : ''}">
      <td>${esc(hora(reg.recibida))}<small>${esc(hace(reg.recibida))}</small></td>
      <td class="mono">${esc(a.ip)}${a.prueba ? '<span class="etiqueta">prueba</span>' : ''}</td>
      <td class="num">${Number(a.intentos) || 0}<small>en ${Number(a.ventana_min) || 0} min</small></td>
      <td><div class="chips">${chips}</div></td>
      <td><span class="sev sev-${sev}">${SEV[sev]}</span></td>
      <td><span class="canal ${canal[1]}">${canal[0]}</span></td>
      <td class="acciones">
        <button class="btn btn-sec btn-mini" data-blanca="${esc(a.ip)}" ${blanca.has(a.ip) || a.prueba ? 'disabled' : ''}>Ignorar IP</button>
        <button class="btn btn-sec btn-mini" disabled title="Disponible en la fase de defensa">Bloquear</button>
      </td></tr>`;
  }).join('');
}

// ---------------------------------------------------------------- render: feed
function renderFeed(nuevo) {
  const ultimos = st.eventos.slice(-60).reverse();
  if (!ultimos.length) { $('#feed').innerHTML = '<li class="vacio" style="display:block">Esperando intentos de acceso…</li>'; return; }
  const ipsFallo = new Set(st.eventos.filter((e) => e.tipo === 'fallo' && e.t >= ahora() - 3600).map((e) => e.ip));
  $('#feed').innerHTML = ultimos.map((e, i) => {
    const peligro = e.tipo === 'acceso' && ipsFallo.has(e.ip);
    return `<li class="${i === 0 && nuevo ? 'entra' : ''}">
      <span class="hora">${esc(hora(e.t))}</span>
      <span class="tipo ${e.tipo} ${peligro ? 'peligro' : ''}">${e.tipo === 'fallo' ? 'Fallo' : 'Acceso'}</span>
      <span class="mono">${esc(e.usuario)}</span>
      <span class="ip">${esc(e.ip)}</span></li>`;
  }).join('');
}

// ---------------------------------------------------------------- render: ajustes
function renderAjustes() {
  const r = st.resumen;
  const f = $('#formConfig');
  if (!st.formCargado) { // no pisar lo que el usuario está escribiendo
    f.fuente.value = r.config.fuente || 'journal';
    f.umbral.value = r.config.umbral;
    f.ventana.value = r.config.ventana;
    f.webhook_externo.value = r.config.webhook_externo || '';
    f.autoarranque.checked = !!r.config.autoarranque;
    st.formCargado = true;
  }
  $('#blanca').innerHTML = r.lista_blanca.length
    ? r.lista_blanca.map((ip) => `<span class="chip">${esc(ip)}<button data-quitar="${esc(ip)}" aria-label="Quitar ${esc(ip)}">×</button></span>`).join('')
    : '<span class="ayuda">Vacía</span>';
  $('#silencioAyuda').textContent = `no repite alertas de una IP durante ${r.silencio_seg / 60} min`;
  $('#silenciadas').innerHTML = r.silenciadas.length
    ? r.silenciadas.map((s) => `<li><span class="mono">${esc(s.ip)}</span><span class="ayuda">en silencio ${minutos(s.restante)}</span></li>`).join('')
    : '<li class="ayuda">Ninguna IP en silencio ahora mismo.</li>';
}

// ---------------------------------------------------------------- refresco
let pendiente = false;
function programarRender(nuevo = false) {
  if (pendiente) return;
  pendiente = true;
  requestAnimationFrame(() => {
    pendiente = false;
    renderKpis(); renderGrafico(); renderTop(); renderFeed(nuevo);
  });
}

async function cargarResumen() {
  try { st.resumen = await api('/api/resumen'); renderResumen(); } catch (e) { /* se reintenta */ }
}

// Cada parte se carga por su cuenta: la consulta al journal es la más lenta y no debe bloquear al resto.
function cargarTodo() {
  cargarResumen().then(renderAlertas);
  api('/api/alertas').then((a) => { st.alertas = a; renderAlertas(); renderKpis(); }).catch(() => {});
  api('/api/actividad').then((e) => { st.eventos = e; programarRender(); }).catch(() => {});
}

// ---------------------------------------------------------------- tiempo real (SSE)
function conectar() {
  const es = new EventSource('/api/flujo');
  es.onopen = () => { $('#conexion').textContent = 'en directo'; cargarTodo(); };
  es.onerror = () => { $('#conexion').textContent = 'reconectando…'; };
  es.addEventListener('intento', (m) => {
    st.eventos.push(JSON.parse(m.data));
    if (st.eventos.length > 6000) st.eventos.splice(0, st.eventos.length - 5000);
    programarRender(true);
  });
  es.addEventListener('alerta', (m) => {
    const reg = JSON.parse(m.data);
    st.alertas.unshift(reg);
    renderAlertas(reg.id); renderKpis();
    const a = reg.alerta;
    toast(`Alerta ${SEV[a.severidad] || ''}${a.prueba ? ' (prueba)' : ''}`,
      `${a.ip} · ${plural(a.intentos, 'intento', 'intentos')} · ${(a.usuarios || []).join(', ')}`, a.severidad);
    if (document.hidden) { st.noLeidas++; document.title = `(${st.noLeidas}) Vigía SSH`; }
    cargarResumen();
  });
  es.addEventListener('motor', cargarResumen);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { st.noLeidas = 0; document.title = 'Vigía SSH'; }
});

// ---------------------------------------------------------------- acciones
async function accion(fn, ok) {
  try { const r = await fn(); if (ok) toast(ok[0], ok[1]); return r; }
  catch (e) { toast('No se pudo completar', e.message, 'error'); }
}

$('#btnMotor').addEventListener('click', async () => {
  const activo = st.resumen?.motor.activo;
  $('#btnMotor').disabled = true;
  await accion(() => api(`/api/motor/${activo ? 'detener' : 'iniciar'}`, { method: 'POST' }),
    activo ? ['Vigilancia detenida', 'El motor ya no analiza el registro SSH.'] : ['Vigilancia iniciada', 'Analizando el registro SSH en tiempo real.']);
  $('#btnMotor').disabled = false;
  cargarResumen();
});

$('#formConfig').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const cambiaFuente = f.fuente.value !== st.resumen.config.fuente;
  const r = await accion(() => api('/api/config', {
    method: 'PUT',
    body: JSON.stringify({ fuente: f.fuente.value, umbral: +f.umbral.value, ventana: +f.ventana.value, webhook_externo: f.webhook_externo.value.trim(), autoarranque: f.autoarranque.checked }),
  }), ['Ajustes guardados', cambiaFuente ? `Fuente: ${f.fuente.value === 'simulacion' ? 'simulación' : 'registro SSH real'}.` : 'El motor usa ya los nuevos valores.']);
  if (r) {
    st.resumen = r; renderResumen();
    if (cambiaFuente) { st.eventos = []; programarRender(); cargarTodo(); }
  }
});

$('#btnSim').addEventListener('click', async () => {
  const activo = st.resumen?.simulador?.activo;
  const r = await accion(() => api(`/api/simulacion/${activo ? 'detener' : 'iniciar'}`, { method: 'POST' }),
    activo ? ['Simulación detenida', ''] : ['Simulación en marcha', 'Los ataques empiezan en unos segundos.']);
  if (r) { st.resumen = r; renderResumen(); }
});

async function guardarBlanca(ips, mensaje) {
  const r = await accion(() => api('/api/lista_blanca', { method: 'PUT', body: JSON.stringify({ ips }) }), mensaje);
  if (r) { st.resumen = r; renderResumen(); renderAlertas(); renderTop(); }
  return r;
}

$('#formBlanca').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const ip = ev.target.ip.value.trim();
  if (await guardarBlanca([...st.resumen.lista_blanca, ip], ['Lista blanca actualizada', `${ip} ya no generará alertas.`])) ev.target.reset();
});

document.addEventListener('click', (ev) => {
  const quitar = ev.target.closest('[data-quitar]');
  if (quitar) {
    const ip = quitar.dataset.quitar;
    guardarBlanca(st.resumen.lista_blanca.filter((x) => x !== ip), ['Lista blanca actualizada', `${ip} vuelve a vigilarse.`]);
  }
  const blanca = ev.target.closest('[data-blanca]');
  if (blanca) {
    const ip = blanca.dataset.blanca;
    if (confirm(`¿Ignorar a partir de ahora la IP ${ip}? No volverá a generar alertas.`))
      guardarBlanca([...st.resumen.lista_blanca, ip], ['IP ignorada', `${ip} añadida a la lista blanca.`]);
  }
});

$('#btnPrueba').addEventListener('click', () =>
  accion(() => api('/api/prueba', { method: 'POST' })));

$('#btnVaciar').addEventListener('click', async () => {
  if (!confirm('¿Vaciar el historial de alertas? No afecta a la detección.')) return;
  if (await accion(() => api('/api/alertas', { method: 'DELETE' }), ['Historial vaciado', ''])) {
    st.alertas = []; renderAlertas(); renderKpis();
  }
});

$('#btnSilencio').addEventListener('click', async () => {
  const r = await accion(() => api('/api/silencio/reiniciar', { method: 'POST' }),
    ['Memoria reiniciada', 'Las IPs pueden volver a alertar de inmediato.']);
  if (r) { st.resumen = r; renderResumen(); }
});

$('#btnTema').addEventListener('click', () => {
  const oscuro = document.documentElement.classList.toggle('oscuro');
  try { localStorage.setItem('vigia-tema', oscuro ? 'oscuro' : 'claro'); } catch (e) {}
});

// ---------------------------------------------------------------- arranque
renderGrafico();
renderFeed();
renderTop();
renderAlertas();
conectar();
setInterval(cargarResumen, 10000);                                           // estado del motor y silencios
setInterval(() => { programarRender(); renderAlertas(); }, 30000);           // la ventana de 60 min avanza
