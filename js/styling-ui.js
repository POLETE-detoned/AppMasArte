/* ============================================================
   PESTAÑA «ESTILISMOS» (dentro de la app)
   · Nueva solicitud: el formulario, para cuando el cliente lo rellena en tienda.
   · Solicitudes: panel de gestión, solo para administradores autenticados.
   ============================================================ */
(function () {
  'use strict';
  const U = window.MasarteUI, S = window.MasarteStyling;
  const { state, $, $$, esc, icon, toast, errMsg, fmtDT, openSheet, closeSheet, confirmBox } = U;

  const V = { tab: 'form', filter: 'all', q: '', items: [], unsub: null, err: '', loading: false, openId: null };
  const ST = S.STATUS, ORDER = ['pending', 'in_progress', 'done'];
  const pill = k => '<span class="st-pill ' + ST[k].cls + '">' + ST[k].label + '</span>';
  const fmtDay = ms => new Date(ms).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const byId = id => V.items.find(x => x.id === id);

  /* ---------- Sesión de administrador ---------- */
  function startWatch() {
    if (V.unsub || !S.isAdmin()) return;
    V.loading = true; V.err = '';
    V.unsub = S.watch(items => { V.items = items; V.loading = false; V.err = ''; renderBody(); refreshDetail(); }, e => {
      V.loading = false;
      V.err = e && e.code === 'permission-denied'
        ? 'Tu cuenta no tiene permiso para ver las solicitudes. Comprueba que tu correo está en la lista de administradores de las reglas de Firestore (ver README).'
        : 'No se pudieron cargar las solicitudes: ' + errMsg(e);
      renderBody();
    });
  }
  function stopWatch() { if (V.unsub) V.unsub(); V.unsub = null; V.items = []; V.loading = false; }
  S.onAuthChange(() => { if (!S.isAdmin()) stopWatch(); if (state.view === 'styling') render(true); });

  /* ---------- Vista ---------- */
  function shell(root) {
    root.innerHTML =
      '<div class="section-head"><div><h2 class="serif">Estilismos</h2><p class="muted">Solicitudes de clientes que quieren asesoramiento de estilismo</p></div></div>' +
      '<div class="seg" id="stTabs"></div><div id="stBody"></div>';
  }
  function tabs() {
    const pend = V.items.filter(x => x.status === 'pending').length;
    $('#stTabs').innerHTML = [['form', 'Nueva solicitud'], ['panel', 'Solicitudes']].map(t =>
      '<button type="button" class="chip' + (V.tab === t[0] ? ' on' : '') + '" data-st="tab" data-t="' + t[0] + '">' + t[1] + (t[0] === 'panel' && pend ? ' <em>' + pend + '</em>' : '') + '</button>').join('');
  }

  function render(force) {
    const root = $('#view-styling');
    if (!$('#stBody', root)) { shell(root); force = true; }
    tabs();
    if (V.tab === 'form') { if (force || !$('[data-sform]', root)) renderForm(); }
    else renderBody(force);
  }

  function renderForm() {
    const body = $('#stBody');
    const link = location.origin && location.origin !== 'null' ? location.href.replace(/[^/]*$/, '') + 'estilismos.html' : 'estilismos.html';
    body.innerHTML =
      '<div class="st-grid"><div class="panel st-form"><div class="done-hide" id="stFormBox">' + S.formHTML('app') + '</div>' +
        '<div class="done" id="stThanks" hidden><div class="done-ic">' + icon('admin') + '</div><h3 class="serif">¡Solicitud guardada!</h3><p class="muted">La solicitud ya está registrada en el panel de gestión.</p>' +
        '<div class="sheet-actions center"><button class="btn primary" type="button" data-st="again">Registrar otra solicitud</button></div></div></div>' +
      '<aside class="panel st-aside"><h3 class="serif">Enlace para tus clientes</h3>' +
        '<p class="muted small">Comparte este enlace (o un código QR) para que el cliente rellene la solicitud desde su móvil, sin acceder al resto de la app.</p>' +
        '<div class="copybox"><input type="text" readonly value="' + esc(link) + '" id="stLink"><button class="btn soft" type="button" data-st="copy">Copiar</button></div>' +
        '<p class="muted small">Los datos se guardan en la base de datos con acceso restringido. Solo los administradores autorizados pueden consultarlos desde la pestaña <b>Solicitudes</b>.</p></aside></div>';
    S.bindForm($('[data-sform]', body), { source: 'tienda', onDone: () => { $('#stFormBox').hidden = true; $('#stThanks').hidden = false; toast('Solicitud de estilismo guardada', { type: 'ok' }); } });
  }

  /* ---------- Panel de solicitudes ---------- */
  function gateHTML() {
    if (S.mode === 'local') {
      return '<div class="panel st-gate"><div class="done-ic">' + icon('admin') + '</div><h3 class="serif">Acceso restringido</h3><p class="muted">Solo el personal autorizado puede ver las solicitudes. En modo de prueba se usa el PIN de administrador.</p>' +
        '<button class="btn primary" type="button" data-st="pin">Introducir PIN de administrador</button></div>';
    }
    return '<div class="panel st-gate"><div class="done-ic">' + icon('admin') + '</div><h3 class="serif">Acceso restringido</h3>' +
      '<p class="muted">Inicia sesión con tu cuenta autorizada para ver y gestionar las solicitudes. Contienen datos personales de clientes.</p>' +
      '<form id="stLogin" novalidate><label class="field"><span>Correo electrónico</span><input id="stMail" type="email" autocomplete="username" inputmode="email" required></label>' +
      '<label class="field"><span>Contraseña</span><input id="stPass" type="password" autocomplete="current-password" required></label>' +
      '<p class="form-error" id="stLoginErr" role="alert"></p><button class="btn primary xl" type="submit">Iniciar sesión</button></form></div>';
  }

  function renderBody(force) {
    if (V.tab !== 'panel') { tabs(); return; }
    const body = $('#stBody'); if (!body) return;
    tabs();
    if (!S.isAdmin()) {
      if (force || !$('.st-gate', body)) { body.innerHTML = gateHTML(); bindGate(); }
      return;
    }
    startWatch();
    const counts = { all: V.items.length, pending: 0, in_progress: 0, done: 0 };
    V.items.forEach(x => { if (counts[x.status] != null) counts[x.status]++; });
    const q = V.q.trim().toLowerCase();
    const list = V.items.filter(x => (V.filter === 'all' || x.status === V.filter) &&
      (!q || (x.name + ' ' + x.email + ' ' + x.phone + ' ' + x.description).toLowerCase().includes(q)));
    if (!$('#stList', body)) {
      body.innerHTML =
        '<div class="kpis st-kpis" id="stKpis"></div>' +
        '<div class="toolbar"><label class="search">' + icon('search') + '<input id="stQ" type="search" placeholder="Buscar por nombre, correo, teléfono o texto…" autocomplete="off" value="' + esc(V.q) + '"></label>' +
          '<button class="btn ghost" type="button" data-st="logout">Cerrar sesión' + (S.adminEmail() ? ' (' + esc(S.adminEmail()) + ')' : '') + '</button></div>' +
        '<div class="chips" id="stFilters"></div><p class="form-error" id="stErr" role="alert"></p><div class="st-list" id="stList"></div>';
      $('#stQ').addEventListener('input', e => { V.q = e.target.value; renderBody(); });
    }
    $('#stKpis').innerHTML =
      '<div class="kpi k-low"><span class="kpi-l">Pendientes</span><b class="kpi-v">' + counts.pending + '</b><span class="kpi-s">por atender</span></div>' +
      '<div class="kpi k-info"><span class="kpi-l">En proceso</span><b class="kpi-v">' + counts.in_progress + '</b><span class="kpi-s">en seguimiento</span></div>' +
      '<div class="kpi k-sage"><span class="kpi-l">Finalizadas</span><b class="kpi-v">' + counts.done + '</b><span class="kpi-s">completadas</span></div>';
    $('#stFilters').innerHTML = [['all', 'Todas'], ['pending', 'Pendientes'], ['in_progress', 'En proceso'], ['done', 'Finalizadas']].map(f =>
      '<button type="button" class="chip' + (V.filter === f[0] ? ' on' : '') + '" data-st="filter" data-f="' + f[0] + '">' + f[1] + ' <em>' + counts[f[0]] + '</em></button>').join('');
    $('#stErr').textContent = V.err;
    $('#stList').innerHTML = V.loading ? '<div class="empty"><div class="spinner"></div><p>Cargando solicitudes…</p></div>'
      : !list.length ? '<div class="empty small">' + icon('tag', 'big') + '<p class="muted">' + (V.items.length ? 'No hay solicitudes con ese filtro.' : 'Todavía no hay solicitudes.') + '</p></div>'
      : list.map(x => '<article class="sr' + (x.status === 'pending' ? ' new' : '') + '" data-id="' + esc(x.id) + '" tabindex="0" role="button" aria-label="Abrir solicitud de ' + esc(x.name) + '">' +
          '<div class="sr-head"><span class="avatar sm">' + esc((x.name || '?').charAt(0).toUpperCase()) + '</span><div class="sr-who"><b>' + esc(x.name) + '</b><span class="muted">' + fmtDT(x.createdAt) + (x.source === 'web' ? ' · formulario web' : ' · en tienda') + '</span></div>' + pill(x.status) + '</div>' +
          '<p class="sr-desc">' + esc(x.description) + '</p>' +
          '<div class="sr-foot"><span class="ct">' + icon('mail') + esc(x.email) + '</span><span class="ct">' + icon('phone') + esc(x.phone) + '</span>' + ((x.history || []).length ? '<span class="ct muted">' + x.history.length + (x.history.length === 1 ? ' anotación' : ' anotaciones') + '</span>' : '') + '</div></article>').join('');
  }

  function bindGate() {
    const f = $('#stLogin');
    if (!f) return;
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('button[type=submit]', f); btn.disabled = true; $('#stLoginErr').textContent = '';
      try { await S.signIn($('#stMail').value, $('#stPass').value); renderBody(true); toast('Sesión iniciada', { type: 'ok' }); }
      catch (err) { $('#stLoginErr').textContent = errMsg(err); btn.disabled = false; $('#stPass').value = ''; }
    });
  }

  /* ---------- Detalle de una solicitud ---------- */
  const HIST_IC = { note: 'edit', status: 'tag', edit: 'edit' };
  function histHTML(x) {
    const h = (x.history || []).slice().sort((a, b) => b.at - a.at);
    const created = '<li class="tl"><span class="tl-dot"></span><div><b>Solicitud recibida</b><span class="muted">' + fmtDT(x.createdAt) + (x.consentAt ? ' · consentimiento registrado' : '') + '</span></div></li>';
    return '<ul class="timeline">' + h.map(e => '<li class="tl ' + esc(e.type || '') + '"><span class="tl-dot"></span><div><b>' + (e.type === 'note' ? 'Nota' : e.type === 'status' ? 'Cambio de estado' : 'Datos editados') + '</b>' +
      (e.text ? '<p>' + esc(e.text) + '</p>' : '') + '<span class="muted">' + esc(e.by || '') + ' · ' + fmtDT(e.at) + '</span></div></li>').join('') + created + '</ul>';
  }

  function openDetail(id) {
    const x = byId(id); if (!x) return;
    V.openId = id;
    const s = openSheet(
      '<div class="sheet-head"><h3 class="serif" id="dName">' + esc(x.name) + '</h3><button class="icon-btn" data-close type="button" aria-label="Cerrar">' + icon('close') + '</button></div>' +
      '<div class="d-top"><span class="muted">Recibida el ' + fmtDT(x.createdAt) + ' · ' + (x.source === 'web' ? 'formulario web' : 'en tienda') + '</span>' +
        '<div class="d-quick"><a class="btn soft" href="tel:' + esc(x.phone.replace(/[^\d+]/g, '')) + '">' + icon('phone') + 'Llamar</a><a class="btn soft" href="mailto:' + esc(x.email) + '">' + icon('mail') + 'Escribir</a></div></div>' +
      '<div class="d-status" id="dStatus"></div>' +
      '<form id="dForm" novalidate><label class="field"><span>Nombre y apellidos</span><input name="name" type="text" maxlength="120" value="' + esc(x.name) + '"><small class="ferr" data-err="name"></small></label>' +
      '<div class="row2"><label class="field"><span>Correo electrónico</span><input name="email" type="email" maxlength="120" value="' + esc(x.email) + '"><small class="ferr" data-err="email"></small></label>' +
      '<label class="field"><span>Teléfono</span><input name="phone" type="tel" maxlength="30" value="' + esc(x.phone) + '"><small class="ferr" data-err="phone"></small></label></div>' +
      '<label class="field"><span>Qué necesita el cliente</span><textarea name="description" rows="8" maxlength="3000">' + esc(x.description) + '</textarea><small class="ferr" data-err="description"></small></label>' +
      '<p class="form-error" id="dErr" role="alert"></p><div class="sheet-actions"><button class="btn primary" type="submit">Guardar cambios</button></div></form>' +
      '<h4 class="serif d-h">Seguimiento</h4><form id="dNote" novalidate><label class="field"><span>Añadir nota interna</span><textarea name="text" rows="3" maxlength="1000" placeholder="Llamada realizada, propuesta enviada, medidas tomadas…"></textarea></label>' +
      '<div class="sheet-actions"><button class="btn soft" type="submit">Añadir nota</button></div></form><div id="dHist"></div>' +
      '<div class="d-danger"><button class="btn danger-ghost" type="button" data-st="del">Eliminar solicitud y datos personales</button></div>', 'sheet-lg');
    drawStatus(x); $('#dHist', s).innerHTML = histHTML(x);

    s.addEventListener('click', async e => {
      if (e.target.closest('[data-close]')) { V.openId = null; return closeSheet(); }
      const st = e.target.closest('[data-dst]');
      if (st) return changeStatus(id, st.dataset.dst);
      if (e.target.closest('[data-st="del"]')) {
        const it = byId(id);
        if (await confirmBox({ title: '¿Eliminar esta solicitud?', text: 'Se borrarán de forma <b>definitiva</b> los datos personales de <b>' + esc(it ? it.name : '') + '</b> (nombre, correo, teléfono y su historial). Esta acción no se puede deshacer.', ok: 'Eliminar definitivamente', danger: true })) {
          try { await S.remove(id); V.openId = null; closeSheet(); toast('Solicitud eliminada', { type: 'ok' }); } catch (err) { toast(errMsg(err), { type: 'err' }); }
        }
      }
    });
    $('#dForm', s).addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, it = byId(id); if (!it) return;
      const vals = {}, changed = [];
      ['name', 'email', 'phone', 'description'].forEach(k => { vals[k] = f.elements[k].value; });
      const c = S.clean(vals);
      ['name', 'email', 'phone', 'description'].forEach(k => { if (c[k] !== it[k]) changed.push(k); });
      $$('[data-err]', f).forEach(el => { el.textContent = ''; });
      if (!changed.length) { toast('No hay cambios que guardar'); return; }
      const names = { name: 'nombre', email: 'correo', phone: 'teléfono', description: 'descripción' };
      const btn = $('button[type=submit]', f); btn.disabled = true;
      try {
        const patch = {}; changed.forEach(k => { patch[k] = c[k]; });
        await S.update(id, patch, state.user, [{ type: 'edit', text: 'Modificado: ' + changed.map(k => names[k]).join(', ') }]);
        toast('Cambios guardados', { type: 'ok' });
      } catch (err) {
        if (err.fields) Object.keys(err.fields).forEach(k => { const el = $('[data-err="' + k + '"]', f); if (el) el.textContent = err.fields[k]; });
        $('#dErr', s).textContent = err.fields ? '' : errMsg(err);
      } finally { btn.disabled = false; }
    });
    $('#dNote', s).addEventListener('submit', async e => {
      e.preventDefault();
      const ta = e.target.elements.text, text = ta.value.trim(); if (!text) return;
      try { await S.update(id, {}, state.user, [{ type: 'note', text }]); ta.value = ''; toast('Nota añadida', { type: 'ok' }); } catch (err) { toast(errMsg(err), { type: 'err' }); }
    });
  }
  function drawStatus(x) {
    $('#dStatus').innerHTML = '<span class="muted">Estado</span><div class="stbtns" role="radiogroup" aria-label="Estado de la solicitud">' +
      ORDER.map(k => '<button type="button" role="radio" aria-checked="' + (x.status === k) + '" class="stbtn ' + ST[k].cls + (x.status === k ? ' on' : '') + '" data-dst="' + k + '">' + ST[k].label + '</button>').join('') + '</div>';
  }
  async function changeStatus(id, to) {
    const x = byId(id); if (!x || x.status === to) return;
    try {
      await S.update(id, { status: to }, state.user, [{ type: 'status', text: ST[x.status].label + ' → ' + ST[to].label }]);
      toast('Estado: ' + ST[to].label, { type: 'ok' });
    } catch (err) { toast(errMsg(err), { type: 'err' }); }
  }
  // Los datos llegan en tiempo real: refresca estado y seguimiento si hay una ficha abierta
  function refreshDetail() {
    if (!V.openId || $('#sheetRoot').hidden) return;
    const x = byId(V.openId); if (!x) return;
    if ($('#dStatus')) drawStatus(x);
    if ($('#dHist')) $('#dHist').innerHTML = histHTML(x);
  }

  /* ---------- Eventos ---------- */
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-st]'); if (el && $('#view-styling').contains(el)) {
      const a = el.dataset.st;
      if (a === 'tab') { V.tab = el.dataset.t; render(true); }
      else if (a === 'filter') { V.filter = el.dataset.f; renderBody(); }
      else if (a === 'again') renderForm();
      else if (a === 'copy') { const i = $('#stLink'); try { await navigator.clipboard.writeText(i.value); } catch (er) { i.select(); document.execCommand('copy'); } toast('Enlace copiado', { type: 'ok' }); }
      else if (a === 'logout') { stopWatch(); await S.signOut(); renderBody(true); toast('Sesión cerrada'); }
      else if (a === 'pin') { if (await U.guardAdmin()) renderBody(true); }
      return;
    }
    const card = e.target.closest('.sr'); if (card && $('#view-styling').contains(card)) openDetail(card.dataset.id);
  });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('sr')) { e.preventDefault(); openDetail(e.target.dataset.id); } });

  U.views.styling = { render: () => render(false) };
})();
