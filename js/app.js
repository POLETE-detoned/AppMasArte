(function () {
  'use strict';
  const MasarteUI = window.MasarteUI = { views: {} };

  /* =========================================================
     UTILIDADES
     ========================================================= */
  const cfg = window.MASARTE_CONFIG || {};
  const store = window.MasarteStore;
  const LOW = cfg.lowStock != null ? cfg.lowStock : 2;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const money = n => new Intl.NumberFormat('es-ES', { style: 'currency', currency: cfg.currency || 'EUR' }).format(n || 0);
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignorar */ } };
  const lsDel = k => { try { localStorage.removeItem(k); } catch (e) { /* ignorar */ } };

  function fmtDT(ms) {
    if (!ms) return '—';
    const d = new Date(ms), now = new Date();
    const date = d.toLocaleDateString('es-ES', d.getFullYear() === now.getFullYear()
      ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
    return date + ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }
  const fmtDay = ms => new Date(ms).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const listJoin = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1]);
  const startOfDay = (d) => { const x = new Date(d || Date.now()); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const ymd = ms => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  /* =========================================================
     CATEGORÍAS E ICONOS
     ========================================================= */
  const CATS = [
    { id: 'Textil', key: 'textil' },
    { id: 'Aromas', key: 'aromas' },
    { id: 'Iluminación', key: 'luz' },
    { id: 'Jarrones', key: 'jarron' },
    { id: 'Menaje', key: 'menaje' },
    { id: 'Decoración', key: 'deco' }
  ];
  const catKey = id => (CATS.find(c => c.id === id) || { key: 'deco' }).key;

  const ICONS = {
    todas: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
    textil: '<path d="M5.5 6.5c4-2 9-2 13 0 1.4 3.7 1.4 7.3 0 11-4 2-9 2-13 0-1.4-3.7-1.4-7.3 0-11z"/><path d="M5.5 6.5c1.2 1.4 1.2 3 0 4.4M18.5 6.5c-1.2 1.4-1.2 3 0 4.4M9 12h6"/>',
    aromas: '<path d="M12 2.8c2.3 2.6 2.4 4.4 0 6.2-2.4-1.8-2.3-3.6 0-6.2z"/><rect x="6.5" y="11" width="11" height="9.5" rx="2.2"/><path d="M12 9v2M6.5 15h11"/>',
    luz: '<path d="M8.2 4h7.6l3 9.2H5.2z"/><path d="M12 13.2V19M8.8 20h6.4"/>',
    jarron: '<path d="M9.2 3h5.6M10 3v3.2c0 2.2-3.8 3.1-3.8 7.8a5.8 5.8 0 0 0 11.6 0c0-4.7-3.8-5.6-3.8-7.8V3"/><path d="M8 13.6c2.6 1 5.4 1 8 0"/>',
    menaje: '<path d="M4.8 10h11v3.4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M15.8 11h1.7a2.1 2.1 0 0 1 0 4.2h-1.7M8 4.6c0 .9 1 1.2 1 2.1M12 4.6c0 .9 1 1.2 1 2.1M4 21h13"/>',
    deco: '<rect x="4" y="5" width="16" height="14" rx="2.2"/><path d="M4 16l4.2-4.2 3.6 3 3-3L20 17"/><circle cx="9" cy="9.5" r="1.2"/>',
    shop: '<path d="M4 9l1.2-4.5h13.6L20 9"/><path d="M4 9h16v1.5a2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0z"/><path d="M5.5 12.5V20h13v-7.5M10 20v-4h4v4"/>',
    cart: '<circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/><path d="M3 4h2.4l2 10.5h10.2L19.5 8H6.2"/>',
    admin: '<path d="M12 3l7 3v5.5c0 4.2-2.8 7.4-7 9-4.2-1.6-7-4.8-7-9V6z"/><path d="M9.2 12l2 2 3.8-4"/>',
    phone: '<path d="M5 4.5h3.5l1.7 4.2-2.2 1.4a11 11 0 0 0 5.9 5.9l1.4-2.2 4.2 1.7V19a1.5 1.5 0 0 1-1.6 1.5C10.9 20 4 13.1 3.5 6.1A1.5 1.5 0 0 1 5 4.5z"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.2"/><path d="M4 7.5l8 6 8-6"/>',
    style: '<path d="M12 3.5l1.8 4.6 4.7.4-3.6 3.1 1.1 4.6L12 13.7 8 16.2l1.1-4.6L5.5 8.5l4.7-.4z"/><path d="M5 19.5h14"/>',
    tag: '<path d="M3.5 12.2V4.5h7.7l9 9a1.6 1.6 0 0 1 0 2.3l-5.4 5.4a1.6 1.6 0 0 1-2.3 0z"/><circle cx="8" cy="9" r="1.3"/>',
    inv: '<path d="M4 8.5L12 4l8 4.5v7L12 20l-8-4.5z"/><path d="M4 8.5l8 4.5 8-4.5M12 13v7"/>',
    ventas: '<path d="M6 4h12v16l-2.2-1.5L13.6 20 12 18.5 10.4 20l-2.2-1.5L6 20z"/><path d="M9 8.5h6M9 12h6"/>',
    resumen: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
    search: '<circle cx="11" cy="11" r="6.2"/><path d="M20 20l-4.4-4.4"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8 19z"/>',
    camera: '<path d="M4 8.5h3l1.5-2.5h7L17 8.5h3V19H4z"/><circle cx="12" cy="13.5" r="3.4"/>',
    download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    bag: '<path d="M5.5 8.5h13l-1 11h-11z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
    box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M12 12v8M4 8l8 4 8-4"/>',
    swap: '<path d="M5 8h13l-3.5-3.5M19 16H6l3.5 3.5"/>',
    user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.2 7-5.2s6.2 1.6 7 5.2"/>'
  };
  const icon = (k, cls) => '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[k] || '') + '</svg>';

  const TYPES = {
    sale: { label: 'Venta', cls: 'sale' }, restock: { label: 'Compra / reposición', cls: 'restock' },
    adjust: { label: 'Ajuste', cls: 'adjust' }, undo: { label: 'Venta deshecha', cls: 'undo' },
    create: { label: 'Alta', cls: 'create' }, edit: { label: 'Edición', cls: 'edit' }, delete: { label: 'Baja', cls: 'delete' }
  };

  /* =========================================================
     ESTADO
     ========================================================= */
  const state = {
    user: lsGet('masarte.user', ''),
    view: 'inventory',
    cat: 'all', q: '', status: 'all',
    products: [], movements: [], loaded: false, truncated: false,
    customers: [], carts: [], orders: [], promos: [],
    customerId: lsGet('masarte.customer', ''), admin: false,
    sf: { user: '', cat: '', type: '', from: '', to: '', limit: 80 },
    range: 'today',
    animate: true, changed: new Set(), online: true
  };
  const busy = new Set();
  const truncHTML = () => (state.truncated
    ? '<div class="notice"><span>Se muestran solo los últimos <b>' + state.movements.length + '</b> movimientos. El resumen, los filtros y la exportación cuentan solo esos.</span><button type="button" class="btn soft" data-loadmore>Cargar más</button></div>' : '');
  let prevMap = new Map();

  const P = window.MasartePricing;
  const avail = p => P.available(p, Date.now());
  const customerById = id => state.customers.find(c => c.id === id) || null;
  const cartOf = id => state.carts.find(c => c.id === id) || null;
  const promoById = id => state.promos.find(x => x.id === id) || null;
  const productsMap = () => { const m = {}; state.products.forEach(p => { m[p.id] = p; }); return m; };
  // Teléfono y correo de una cuenta de cliente (HTML con iconos)
  function contactHTML(customerId) {
    const c = customerById(customerId); if (!c) return '';
    const parts = [];
    if (c.phone) parts.push('<span class="ct">' + icon('phone') + esc(c.phone) + '</span>');
    if (c.email) parts.push('<span class="ct">' + icon('mail') + esc(c.email) + '</span>');
    return parts.join('');
  }
  const cartUnits = id => { const c = cartOf(id); return c ? (c.items || []).reduce((a, i) => a + i.qty, 0) : 0; };
  const units = m => (m.qty > 0 ? m.qty : 1);
  const statusOf = p => ((p.stock || 0) <= 0 ? 'out' : p.stock <= LOW ? 'low' : 'ok');
  const byId = id => state.products.find(p => p.id === id);
  const realSales = () => state.movements.filter(m => m.type === 'sale' && !m.undone);

  /* =========================================================
     TOASTS / FX
     ========================================================= */
  function toast(msg, opt) {
    opt = opt || {};
    const el = document.createElement('div');
    el.className = 'toast ' + (opt.type || '');
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (opt.action ? '<button type="button">' + esc(opt.action.label) + '</button>' : '');
    $('#toasts').appendChild(el);
    const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 320); };
    if (opt.action) $('button', el).addEventListener('click', () => { kill(); opt.action.fn(); });
    setTimeout(kill, opt.ms || 4200);
    while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
  }
  const errMsg = e => (e && e.message) ? e.message : 'Algo salió mal. Inténtalo de nuevo.';

  function floatText(card, text, cls) {
    if (!card || reduceMotion) return;
    const f = document.createElement('span');
    f.className = 'float-fx ' + (cls || '');
    f.textContent = text;
    card.appendChild(f);
    setTimeout(() => f.remove(), 1000);
  }
  function countUp(el, to, fmt) {
    fmt = fmt || (v => String(Math.round(v)));
    const from = Number(el.dataset.v || 0);
    el.dataset.v = to;
    if (reduceMotion || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 700;
    (function tick(t) {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(tick);
    })(t0);
  }

  /* =========================================================
     OVERLAYS (hojas modales)
     ========================================================= */
  const cssEsc = v => (window.CSS && CSS.escape ? CSS.escape(v) : v);
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  let sheetGuard = null, sheetReturn = null, confirmReturn = null;

  // Recuerda qué elemento tenía el foco para devolvérselo al cerrar (las tarjetas se repintan, así que se guarda un selector)
  function focusMemo() {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const card = el.closest && el.closest('.card'), act = el.dataset && el.dataset.act;
    return { el, sel: card && act ? '.card[data-id="' + cssEsc(card.dataset.id) + '"] [data-act="' + act + '"]' : null };
  }
  function focusBack(m) {
    if (!m) return;
    const t = m.el.isConnected ? m.el : (m.sel && $(m.sel));
    if (t && t.focus) t.focus({ preventScroll: true });
  }
  // Mantiene el tabulador dentro de la hoja abierta
  function trapTab(root, e) {
    const f = $$(FOCUSABLE, root).filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1], cur = document.activeElement;
    if (!root.contains(cur)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && cur === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
  }

  function openSheet(html, cls) {
    const root = $('#sheetRoot');
    sheetReturn = focusMemo(); sheetGuard = null;
    root.innerHTML = '<div class="sheet ' + (cls || '') + '" role="dialog" aria-modal="true">' + html + '</div>';
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add('open'));
    document.body.classList.add('noscroll');
    return $('.sheet', root);
  }
  function closeSheet() {
    const root = $('#sheetRoot'), back = sheetReturn;
    sheetGuard = null; sheetReturn = null;
    root.classList.remove('open');
    document.body.classList.remove('noscroll');
    setTimeout(() => { if (!root.classList.contains('open')) { root.hidden = true; root.innerHTML = ''; } }, 260);
    focusBack(back);
  }
  // Cierre "del usuario" (fuera, Escape, Cancelar): pide confirmación si hay cambios sin guardar
  async function tryCloseSheet() {
    if (sheetGuard && sheetGuard()) {
      const ok = await confirmBox({ title: '¿Descartar los cambios?', text: 'Has modificado el producto y todavía no lo has guardado.', ok: 'Descartar', danger: true });
      if (!ok) return;
    }
    closeSheet();
  }
  $('#sheetRoot').addEventListener('mousedown', e => { if (e.target.id === 'sheetRoot') tryCloseSheet(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!$('#confirmRoot').hidden) closeConfirm(false); else if (!$('#sheetRoot').hidden) tryCloseSheet(); }
    else if (e.key === 'Tab') {
      if (!$('#confirmRoot').hidden) trapTab($('#confirmRoot'), e);
      else if (!$('#sheetRoot').hidden) trapTab($('#sheetRoot'), e);
    }
  });

  let confirmResolve = null;
  function closeConfirm(v) {
    const root = $('#confirmRoot'), back = confirmReturn;
    confirmReturn = null;
    root.classList.remove('open');
    setTimeout(() => { root.hidden = true; root.innerHTML = ''; }, 220);
    if (confirmResolve) { const r = confirmResolve; confirmResolve = null; r(v); }
    focusBack(back);
  }
  function confirmBox(o) {
    return new Promise(res => {
      confirmResolve = res;
      confirmReturn = focusMemo();
      const root = $('#confirmRoot');
      root.innerHTML = '<div class="sheet sheet-sm" role="alertdialog" aria-modal="true"><h3 class="serif">' + esc(o.title) + '</h3><p class="muted">' + o.text + '</p>' +
        '<div class="sheet-actions"><button class="btn ghost" data-v="0" type="button">Cancelar</button><button class="btn ' + (o.danger ? 'danger' : 'primary') + '" data-v="1" type="button">' + esc(o.ok || 'Aceptar') + '</button></div></div>';
      root.hidden = false;
      requestAnimationFrame(() => root.classList.add('open'));
      $$('button', root).forEach(b => b.addEventListener('click', () => closeConfirm(b.dataset.v === '1')));
      $('button[data-v="1"]', root).focus();
    });
  }

  /* =========================================================
     ACCESO
     ========================================================= */
  function showLogin(msg) {
    const root = $('#login');
    $('#app').hidden = true;
    root.hidden = false;
    const recents = JSON.parse(lsGet('masarte.recents', '[]'));
    const names = Array.from(new Set([].concat(cfg.staff || [], recents))).slice(0, 8);
    root.innerHTML =
      '<div class="login-card">' +
        '<img class="login-logo" src="img/logo.png" alt="Logo ' + esc(cfg.storeName || '+Arte Home') + '" width="120" height="120">' +
        '<h1 class="serif">' + esc(cfg.storeName || '+Arte Home') + '</h1>' +
        '<p class="muted">' + (cfg.tagline ? esc(cfg.tagline) + ' · ' : '') + 'Control de stock y ventas</p>' +
        '<form id="loginForm" autocomplete="off" novalidate>' +
          (names.length ? '<div class="chips quick" id="quickNames">' + names.map(n => '<button type="button" class="chip">' + esc(n) + '</button>').join('') + '</div>' : '') +
          '<label class="field"><span>¿Quién eres?</span><input id="loginName" type="text" placeholder="Tu nombre" maxlength="30" autocapitalize="words" required></label>' +
          (cfg.shopPin ? '<label class="field"><span>PIN de la tienda</span><input id="loginPin" type="password" inputmode="numeric" placeholder="••••" maxlength="12"></label>' : '') +
          '<p class="form-error" id="loginErr" role="alert">' + esc(msg || '') + '</p>' +
          '<button class="btn primary xl" type="submit">Entrar</button>' +
        '</form>' +
      '</div>';
    const name = $('#loginName');
    $$('#quickNames .chip').forEach(b => b.addEventListener('click', () => { name.value = b.textContent; const pin = $('#loginPin'); (pin || name).focus(); }));
    $('#loginForm').addEventListener('submit', e => {
      e.preventDefault();
      const n = name.value.trim().replace(/\s+/g, ' ');
      const pin = $('#loginPin');
      const err = $('#loginErr');
      if (n.length < 2) { err.textContent = 'Escribe tu nombre.'; name.focus(); return; }
      if (cfg.shopPin && (!pin || pin.value !== String(cfg.shopPin))) { err.textContent = 'PIN incorrecto.'; pin.value = ''; pin.focus(); shake($('.login-card')); return; }
      loginAs(n);
    });
    setTimeout(() => name.focus(), 50);
  }
  function shake(el) { if (el && !reduceMotion) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); } }

  function loginAs(n) {
    state.user = n;
    lsSet('masarte.user', n);
    const r = JSON.parse(lsGet('masarte.recents', '[]')).filter(x => x !== n);
    r.unshift(n); lsSet('masarte.recents', JSON.stringify(r.slice(0, 8)));
    $('#login').hidden = true;
    $('#app').hidden = false;
    renderHeader();
    state.animate = true;
    renderAll();
    if (!booted) boot();
  }
  function logout() {
    lsDel('masarte.user');
    state.user = '';
    showLogin();
  }

  /* =========================================================
     CABECERA Y NAVEGACIÓN
     ========================================================= */
  const VIEWS = [
    { id: 'inventory', label: 'Inventario', short: 'Stock', ic: 'inv' },
    { id: 'shop', label: 'Tienda', ic: 'shop' },
    { id: 'cart', label: 'Carrito', ic: 'cart', badge: true },
    { id: 'sales', label: 'Ventas', ic: 'ventas' },
    { id: 'summary', label: 'Resumen', ic: 'resumen' },
    { id: 'styling', label: 'Estilismos', ic: 'style' },
    { id: 'admin', label: 'Admin', ic: 'admin' }
  ];
  function renderHeader() {
    $('#brandName').textContent = cfg.storeName || '+Arte Home';
    $('#brandTag').textContent = cfg.tagline || '';
    const initial = (state.user || '?').trim().charAt(0).toUpperCase();
    $('#userChip').innerHTML = '<span class="avatar">' + esc(initial) + '</span><span class="u-name">' + esc(state.user) + '</span><span class="u-change">Cambiar</span>';
    const tabsHTML = short => VIEWS.map(v => '<button type="button" class="tab' + (state.view === v.id ? ' active' : '') + '" data-view="' + v.id + '" title="' + v.label + '">' + icon(v.ic) + '<span>' + (short && v.short || v.label) + '</span>' + (v.badge && cartUnits(state.customerId) ? '<em class="tab-n">' + cartUnits(state.customerId) + '</em>' : '') + '</button>').join('');
    $('#tabsTop').innerHTML = tabsHTML(false);
    $('#tabsBottom').innerHTML = tabsHTML(true);
    $('#fab').hidden = state.view !== 'inventory';
  }
  async function setView(v) {
    const ext = MasarteUI.views[v];
    if (ext && ext.guard && !(await ext.guard())) return;
    state.view = v; state.animate = true;
    VIEWS.forEach(x => { $('#view-' + x.id).hidden = x.id !== v; });
    renderHeader(); renderAll();
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-view]');
    if (t) setView(t.dataset.view);
    if (e.target.closest('[data-loadmore]') && store.loadMoreMovements) { store.loadMoreMovements(); toast('Cargando más movimientos…'); }
  });
  $('#userChip').addEventListener('click', logout);
  $('#fab').addEventListener('click', () => openProductForm(null));

  function setLive(s) {
    const pill = $('#livePill');
    if (store.mode === 'local') { pill.className = 'live local'; $('span', pill).textContent = 'Modo local'; pill.title = 'Datos guardados solo en este navegador. Configura Firebase para compartirlos.'; return; }
    pill.className = 'live' + (state.online ? '' : ' off');
    $('span', pill).textContent = state.online ? 'En vivo' : 'Sin conexión';
  }
  window.addEventListener('online', () => { state.online = true; setLive(); });
  window.addEventListener('offline', () => { state.online = false; setLive(); });

  function banner(msg) {
    const b = $('#banner');
    b.hidden = !msg; b.textContent = msg || '';
  }

  /* =========================================================
     INVENTARIO
     ========================================================= */
  function filteredProducts() {
    const q = state.q.trim().toLowerCase();
    return state.products.filter(p => {
      if (state.cat !== 'all' && p.category !== state.cat) return false;
      if (state.status !== 'all' && statusOf(p) !== state.status) return false;
      if (q && !(String(p.name).toLowerCase().includes(q) || String(p.code).toLowerCase().includes(q) || String(p.variant || '').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => String(a.name).localeCompare(String(b.name), 'es') || String(a.variant).localeCompare(String(b.variant), 'es'));
  }

  function renderInventoryShell() {
    const root = $('#view-inventory');
    if ($('#catStrip', root)) return;
    root.innerHTML =
      '<div class="cat-strip" id="catStrip" role="tablist" aria-label="Categorías"></div>' +
      '<div class="toolbar">' +
        '<label class="search">' + icon('search') + '<input id="q" type="search" placeholder="Buscar por nombre o código…" autocomplete="off"></label>' +
        '<div class="chips" id="statusChips">' +
          '<button type="button" class="chip on" data-status="all">Todos</button>' +
          '<button type="button" class="chip s-ok" data-status="ok"><i></i>Disponible</button>' +
          '<button type="button" class="chip s-low" data-status="low"><i></i>Últimas unidades</button>' +
          '<button type="button" class="chip s-out" data-status="out"><i></i>Agotado</button>' +
        '</div>' +
      '</div>' +
      '<div class="result-line" id="resultLine"></div>' +
      '<div class="grid" id="grid"></div>';
    $('#q').addEventListener('input', e => { state.q = e.target.value; state.animate = true; renderGrid(); });
    $('#statusChips').addEventListener('click', e => {
      const b = e.target.closest('[data-status]'); if (!b) return;
      state.status = b.dataset.status; state.animate = true;
      $$('#statusChips .chip').forEach(c => c.classList.toggle('on', c === b));
      renderGrid();
    });
    $('#catStrip').addEventListener('click', e => {
      const b = e.target.closest('[data-cat]'); if (!b) return;
      state.cat = b.dataset.cat; state.animate = true;
      renderCats(); renderGrid();
    });
    $('#grid').addEventListener('click', onGridClick);
  }

  function renderCats() {
    const strip = $('#catStrip'); if (!strip) return;
    const counts = {}; state.products.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
    const items = [{ id: 'all', key: 'todas', label: 'Todas', n: state.products.length }]
      .concat(CATS.map(c => ({ id: c.id, key: c.key, label: c.id, n: counts[c.id] || 0 })));
    strip.innerHTML = items.map(c =>
      '<button type="button" role="tab" aria-selected="' + (state.cat === c.id) + '" class="cat' + (state.cat === c.id ? ' active' : '') + '" data-cat="' + esc(c.id) + '">' +
        '<span class="cat-ic">' + icon(c.key) + '</span><span class="cat-name">' + esc(c.label) + '</span><span class="cat-n">' + c.n + '</span></button>').join('');
  }

  function cardHTML(p, i) {
    const st = statusOf(p), key = catKey(p.category);
    const photo = p.photo ? '<img src="' + esc(p.photo) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async">' : '<div class="ph ph-' + key + '">' + icon(key) + '</div>';
    const badge = st === 'out' ? '<span class="badge out">AGOTADO</span>'
      : st === 'low' ? '<span class="badge low"><i></i>Últimas unidades</span>'
      : '<span class="badge ok"><i></i>Disponible</span>';
    const ls = p.lastSale, rsv = P.reservedUnits(p, Date.now()), blocked = st === 'out' || avail(p) <= 0;
    const last = ls ? 'Última venta: <b>' + esc(ls.user) + '</b> · ' + fmtDT(ls.at) : 'Sin ventas todavía';
    const so = p.soldOutBy || ls;
    const soldOut = st === 'out'
      ? '<div class="soldout-note">' + (so ? 'Última unidad vendida por <b>' + esc(so.user) + '</b> · ' + fmtDT(so.at) : 'Sin unidades en stock') + '</div>' : '';
    return '<article class="card st-' + st + (state.animate ? ' enter' : '') + (state.changed.has(p.id) ? ' flash' : '') + '" data-id="' + esc(p.id) + '" style="--i:' + Math.min(i, 14) + '">' +
      '<div class="card-photo">' + photo + '<div class="card-tags"><span class="tag">' + icon(key) + esc(p.category) + '</span>' + badge + '</div>' +
        (st === 'out' ? '<div class="ribbon">AGOTADO</div>' : '') + '</div>' +
      '<div class="card-body">' +
        '<div class="card-head"><h3 class="serif">' + esc(p.name) + '</h3><div class="price">' + money(p.price) + '</div></div>' +
        '<div class="meta">' + (p.variant ? '<span>' + esc(p.variant) + '</span>' : '') + '<span class="code">Ref. ' + esc(p.code) + '</span></div>' +
        '<div class="stock-row"><div class="stock"><span class="stock-n" data-n="' + p.stock + '">' + p.stock + '</span><span class="stock-l">' + (p.stock === 1 ? 'unidad' : 'unidades') + '</span></div>' +
          '<div class="stock-bar"><i style="width:' + Math.min(100, (p.stock / Math.max(8, p.stock)) * 100) + '%"></i></div></div>' +
        (p.notes ? '<p class="notes">' + esc(p.notes) + '</p>' : '') +
        soldOut +
        '<p class="last">' + last + '</p>' +
        (rsv > 0 && st !== 'out' ? '<p class="reserved">' + icon('cart') + rsv + (rsv === 1 ? ' unidad reservada' : ' unidades reservadas') + ' en carritos · ' + avail(p) + ' libres</p>' : '') +
        '<button class="btn sell" type="button" data-act="sell"' + (blocked ? ' disabled' : '') + '>' + icon('bag') + '<span>' + (st === 'out' ? 'Agotado' : blocked ? 'Reservado' : 'Vender') + '</span></button>' +
        '<div class="card-actions">' +
          '<button type="button" class="btn soft" data-act="restock">' + icon('box') + 'Reponer</button>' +
          '<button type="button" class="btn soft" data-act="undo"' + (ls && !ls.orderId ? '' : ' disabled') + '>' + icon('undo') + 'Deshacer</button>' +
          '<button type="button" class="btn soft" data-act="edit">' + icon('edit') + 'Editar</button>' +
        '</div>' +
      '</div></article>';
  }

  function renderGrid() {
    renderInventoryShell();
    renderCats();
    const grid = $('#grid'), list = filteredProducts();
    const sold = list.filter(p => statusOf(p) === 'out').length;
    $('#resultLine').textContent = list.length + (list.length === 1 ? ' producto' : ' productos') + (sold ? ' · ' + sold + ' agotado' + (sold > 1 ? 's' : '') : '');
    if (!state.loaded) { grid.innerHTML = '<div class="empty"><div class="spinner"></div><p>Cargando inventario…</p></div>'; return; }
    if (!list.length) {
      const none = !state.products.length;
      grid.innerHTML = '<div class="empty">' + icon('inv', 'big') + '<h3 class="serif">' + (none ? 'Aún no hay productos' : 'Nada por aquí') + '</h3>' +
        '<p class="muted">' + (none ? 'Añade el primero o carga unos productos de ejemplo para ver cómo funciona.' : 'Prueba con otra categoría, estado o búsqueda.') + '</p>' +
        (none ? '<div class="empty-actions"><button class="btn primary" data-act="new" type="button">Añadir producto</button><button class="btn ghost" data-act="seed" type="button">Cargar ejemplos</button></div>' : '') + '</div>';
      state.animate = false; return;
    }
    grid.innerHTML = list.map(cardHTML).join('');
    state.animate = false;
    state.changed.clear();
  }

  function cardEl(id) { return $('.card[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]'); }

  async function onGridClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, card = b.closest('.card'), id = card && card.dataset.id;
    if (act === 'new') return openProductForm(null);
    if (act === 'seed') return seedExamples();
    if (act === 'sell') return doSell(id);
    if (act === 'restock') return openRestock(id);
    if (act === 'edit') return openProductForm(byId(id));
    if (act === 'undo') return askUndo(id);
  }

  async function doSell(id) {
    const p = byId(id);
    if (!p || p.stock <= 0 || busy.has(id)) return;
    busy.add(id);
    const c0 = cardEl(id); if (c0) c0.classList.add('selling');
    try {
      await store.sell(id, state.user);
      const c = cardEl(id);
      if (c) { c.classList.remove('selling'); c.classList.add('sold-pulse'); floatText(c, '−1', 'minus'); setTimeout(() => c.classList.remove('sold-pulse'), 900); }
      const np = byId(id);
      if (np && np.stock === 0) toast('Última unidad vendida · ' + p.name + ' queda AGOTADO', { type: 'warn', action: { label: 'Deshacer', fn: () => undo(id) }, ms: 6000 });
      else toast('Vendido: ' + p.name + (p.variant ? ' (' + p.variant + ')' : ''), { type: 'ok', action: { label: 'Deshacer', fn: () => undo(id) }, ms: 5500 });
    } catch (err) {
      const c = cardEl(id); if (c) c.classList.remove('selling');
      toast(errMsg(err), { type: 'err' });
    } finally { busy.delete(id); }
  }

  async function undo(id) {
    if (busy.has(id)) return;
    busy.add(id);
    try {
      await store.undoSale(id, state.user);
      const c = cardEl(id); floatText(c, '+1', 'plus');
      toast('Venta deshecha', { type: 'ok' });
    } catch (err) { toast(errMsg(err), { type: 'err' }); } finally { busy.delete(id); }
  }
  async function askUndo(id) {
    const p = byId(id); if (!p || !p.lastSale) return;
    const ok = await confirmBox({
      title: '¿Deshacer la última venta?',
      text: 'Se devolverá 1 unidad de <b>' + esc(p.name) + '</b> al stock. Venta registrada por <b>' + esc(p.lastSale.user) + '</b> el ' + fmtDT(p.lastSale.at) + '.',
      ok: 'Deshacer venta', danger: true
    });
    if (ok) undo(id);
  }

  /* ---------- Reponer ---------- */
  function openRestock(id) {
    const p = byId(id); if (!p) return;
    const s = openSheet(
      '<div class="sheet-head"><h3 class="serif">Reponer stock</h3><button class="icon-btn" data-close type="button" aria-label="Cerrar">' + icon('close') + '</button></div>' +
      '<p class="muted"><b>' + esc(p.name) + '</b>' + (p.variant ? ' · ' + esc(p.variant) : '') + '<br>Ahora hay ' + p.stock + ' ' + (p.stock === 1 ? 'unidad' : 'unidades') + '.</p>' +
      '<form id="rsForm" novalidate><div class="stepper"><button type="button" data-step="-1" aria-label="Menos">−</button><input id="rsQty" type="number" min="1" step="1" value="5" inputmode="numeric"><button type="button" data-step="1" aria-label="Más">+</button></div>' +
      '<div class="chips center">' + [1, 5, 10, 20].map(n => '<button type="button" class="chip" data-add="' + n + '">+' + n + '</button>').join('') + '</div>' +
      '<p class="form-error" id="rsErr"></p>' +
      '<div class="sheet-actions"><button class="btn ghost" data-close type="button">Cancelar</button><button class="btn primary" id="rsOk" type="submit">Añadir al stock</button></div></form>', 'sheet-sm');
    const qty = $('#rsQty', s);
    s.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) return closeSheet();
      const st = e.target.closest('[data-step]'); if (st) qty.value = Math.max(1, (parseInt(qty.value, 10) || 0) + Number(st.dataset.step));
      const ad = e.target.closest('[data-add]'); if (ad) qty.value = (parseInt(qty.value, 10) || 0) + Number(ad.dataset.add);
    });
    $('#rsForm', s).addEventListener('submit', async ev => {
      ev.preventDefault();
      const n = parseInt(qty.value, 10);
      if (!(n > 0)) { $('#rsErr', s).textContent = 'Indica una cantidad mayor que 0.'; return; }
      const btn = $('#rsOk', s); btn.disabled = true;
      try {
        await store.restock(id, n, state.user);
        closeSheet();
        toast('Reposición registrada: +' + n + ' · ' + p.name, { type: 'ok' });
        const c = cardEl(id); floatText(c, '+' + n, 'plus');
      } catch (err) { $('#rsErr', s).textContent = errMsg(err); btn.disabled = false; }
    });
    setTimeout(() => { qty.focus(); qty.select(); }, 80);
  }

  /* ---------- Alta / edición ---------- */
  function resizeImage(file, max, q) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', q));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la imagen.')); };
      img.src = url;
    });
  }

  function openProductForm(p) {
    const isNew = !p;
    p = p || { category: state.cat !== 'all' ? state.cat : 'Textil', stock: 1, price: '', name: '', code: '', variant: '', notes: '', photo: '' };
    let photo = p.photo || '';
    const s = openSheet(
      '<div class="sheet-head"><h3 class="serif">' + (isNew ? 'Nuevo producto' : 'Editar producto') + '</h3><button class="icon-btn" data-close type="button" aria-label="Cerrar">' + icon('close') + '</button></div>' +
      '<form id="pf" novalidate>' +
        '<div class="photo-pick"><div class="photo-prev" id="photoPrev"></div><div class="photo-btns">' +
          '<label class="btn soft">' + icon('camera') + '<span>Foto</span><input id="photoIn" type="file" accept="image/*" hidden></label>' +
          '<button type="button" class="btn ghost" id="photoRm">Quitar</button></div></div>' +
        '<label class="field"><span>Nombre *</span><input id="f_name" type="text" maxlength="80" value="' + esc(p.name) + '" placeholder="Cojín de lino" required></label>' +
        '<div class="row2">' +
          '<label class="field"><span>Referencia / código *</span><input id="f_code" type="text" maxlength="30" value="' + esc(p.code) + '" placeholder="TX-0142" required></label>' +
          '<label class="field"><span>Categoría *</span><select id="f_cat">' + CATS.map(c => '<option' + (c.id === p.category ? ' selected' : '') + '>' + c.id + '</option>').join('') + '</select></label>' +
        '</div>' +
        '<label class="field"><span>Variante <em>(talla, color, medida)</em></span><input id="f_var" type="text" maxlength="40" value="' + esc(p.variant) + '" placeholder="Arena · 45×45 cm"></label>' +
        '<div class="row2">' +
          '<label class="field"><span>Precio (€) *</span><input id="f_price" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(p.price) + '" placeholder="0,00" required></label>' +
          '<label class="field"><span>Unidades en stock *</span><input id="f_stock" type="number" min="0" step="1" inputmode="numeric" value="' + esc(p.stock) + '" required></label>' +
        '</div>' +
        '<label class="field"><span>Notas</span><textarea id="f_notes" rows="2" maxlength="300" placeholder="Proveedor, cuidados, observaciones…">' + esc(p.notes) + '</textarea></label>' +
        '<p class="form-error" id="pfErr" role="alert"></p>' +
        '<div class="sheet-actions">' +
          (isNew ? '' : '<button type="button" class="btn danger-ghost" id="pfDel">Eliminar</button>') +
          '<span class="spacer"></span><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" type="submit" id="pfOk">' + (isNew ? 'Añadir' : 'Guardar') + '</button>' +
        '</div>' +
      '</form>');
    const prev = $('#photoPrev', s);
    const paint = () => {
      prev.innerHTML = photo ? '<img alt="" src="' + esc(photo) + '">' : '<div class="ph ph-' + catKey($('#f_cat', s).value) + '">' + icon(catKey($('#f_cat', s).value)) + '</div>';
      $('#photoRm', s).hidden = !photo;
    };
    paint();
    $('#f_cat', s).addEventListener('change', () => { if (!photo) paint(); });
    $('#photoIn', s).addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try { photo = await resizeImage(f, 640, 0.74); paint(); } catch (err) { $('#pfErr', s).textContent = errMsg(err); }
    });
    $('#photoRm', s).addEventListener('click', () => { photo = ''; paint(); });
    s.addEventListener('click', e => { if (e.target.closest('[data-close]')) tryCloseSheet(); });
    const readForm = () => JSON.stringify([$('#f_name', s).value, $('#f_code', s).value, $('#f_cat', s).value, $('#f_var', s).value, $('#f_price', s).value, $('#f_stock', s).value, $('#f_notes', s).value, photo]);
    const initialForm = readForm();
    sheetGuard = () => readForm() !== initialForm;

    const del = $('#pfDel', s);
    if (del) del.addEventListener('click', async () => {
      const ok = await confirmBox({ title: '¿Eliminar este producto?', text: '<b>' + esc(p.name) + '</b> desaparecerá del inventario. Su historial de movimientos se conserva. Esta acción no se puede deshacer.', ok: 'Eliminar', danger: true });
      if (!ok) return;
      try { await store.deleteProduct(p.id, state.user); closeSheet(); toast('Producto eliminado', { type: 'ok' }); } catch (err) { $('#pfErr', s).textContent = errMsg(err); }
    });

    $('#pf', s).addEventListener('submit', async e => {
      e.preventDefault();
      const f = {
        name: $('#f_name', s).value.trim(), code: $('#f_code', s).value.trim(), category: $('#f_cat', s).value,
        variant: $('#f_var', s).value.trim(), price: $('#f_price', s).value, stock: $('#f_stock', s).value,
        notes: $('#f_notes', s).value.trim(), photo
      };
      const err = $('#pfErr', s);
      if (!f.name) { err.textContent = 'Falta el nombre.'; return $('#f_name', s).focus(); }
      if (!f.code) { err.textContent = 'Falta la referencia o código.'; return $('#f_code', s).focus(); }
      if (f.price === '' || Number(f.price) < 0) { err.textContent = 'Indica un precio válido.'; return $('#f_price', s).focus(); }
      if (f.stock === '' || Number(f.stock) < 0 || !Number.isInteger(Number(f.stock))) { err.textContent = 'El stock debe ser un número entero (0 o más).'; return $('#f_stock', s).focus(); }
      const dup = state.products.find(x => x.id !== p.id && x.code.toLowerCase() === f.code.toLowerCase() && (x.variant || '').toLowerCase() === f.variant.toLowerCase());
      if (dup) { err.textContent = 'Ya existe un producto con esa referencia y variante.'; return; }
      const btn = $('#pfOk', s); btn.disabled = true;
      try {
        if (isNew) await store.addProduct(f, state.user); else await store.updateProduct(p.id, f, state.user, p.stock);
        closeSheet();
        toast(isNew ? 'Producto añadido' : 'Cambios guardados', { type: 'ok' });
      } catch (ex) { err.textContent = errMsg(ex); btn.disabled = false; }
    });
    setTimeout(() => $('#f_name', s).focus(), 120);
  }

  /* ---------- Ejemplos ---------- */
  const EXAMPLES = [
    { name: 'Cojín de lino lavado', code: 'TX-0101', category: 'Textil', variant: 'Arena · 45×45', price: 29.9, stock: 8, notes: 'Funda con cremallera oculta.' },
    { name: 'Manta de lana merino', code: 'TX-0120', category: 'Textil', variant: 'Crudo · 130×170', price: 89, stock: 2, notes: '' },
    { name: 'Plaid de algodón bouclé', code: 'TX-0133', category: 'Textil', variant: 'Terracota', price: 64.5, stock: 5 },
    { name: 'Vela de soja Higuera', code: 'AR-0201', category: 'Aromas', variant: '200 g', price: 24, stock: 12, notes: 'Combustión aprox. 45 h.' },
    { name: 'Difusor de varillas', code: 'AR-0215', category: 'Aromas', variant: 'Té blanco · 100 ml', price: 19.5, stock: 1 },
    { name: 'Lámpara de mesa cerámica', code: 'IL-0301', category: 'Iluminación', variant: 'Salvia', price: 118, stock: 3 },
    { name: 'Aplique de latón cepillado', code: 'IL-0322', category: 'Iluminación', variant: 'Latón', price: 142, stock: 0 },
    { name: 'Guirnalda de luz cálida', code: 'IL-0340', category: 'Iluminación', variant: '5 m', price: 21.9, stock: 14 },
    { name: 'Jarrón de gres esmaltado', code: 'JA-0401', category: 'Jarrones', variant: 'Arena · M', price: 46, stock: 6 },
    { name: 'Jarrón de vidrio soplado', code: 'JA-0415', category: 'Jarrones', variant: 'Ahumado · L', price: 72, stock: 2 },
    { name: 'Set de tazas artesanales', code: 'ME-0501', category: 'Menaje', variant: '4 uds · Blanco roto', price: 38, stock: 9 },
    { name: 'Bandeja de madera de roble', code: 'ME-0517', category: 'Menaje', variant: '40 cm', price: 33, stock: 4 },
    { name: 'Espejo redondo marco ratán', code: 'DE-0601', category: 'Decoración', variant: 'Ø 60 cm', price: 95, stock: 3 },
    { name: 'Escultura de cerámica', code: 'DE-0618', category: 'Decoración', variant: 'Terracota', price: 54, stock: 7, notes: 'Pieza única hecha a mano.' }
  ];
  async function seedExamples() {
    try {
      await store.seed(EXAMPLES, state.user);
      if (!state.promos.length) {
        await store.savePromo({ name: 'Textil −15 %', percent: 15, scope: 'Textil', minSubtotal: 0, stackable: false, active: true }, state.user);
        await store.savePromo({ name: 'Compra de más de 150 € · −10 %', percent: 10, scope: 'all', minSubtotal: 150, stackable: false, active: true }, state.user);
      }
      toast('Productos y promociones de ejemplo añadidos', { type: 'ok' });
    } catch (e) { toast(errMsg(e), { type: 'err' }); }
  }

  /* =========================================================
     VENTAS (historial)
     ========================================================= */
  function filteredMovements() {
    const f = state.sf;
    const from = f.from ? new Date(f.from + 'T00:00:00').getTime() : 0;
    const to = f.to ? new Date(f.to + 'T23:59:59.999').getTime() : Infinity;
    return state.movements.filter(m =>
      (!f.user || m.user === f.user) && (!f.cat || m.category === f.cat) && (!f.type || m.type === f.type) && m.at >= from && m.at <= to);
  }

  // Frase de la venta: a quién se vendió (con teléfono y correo si los hay)
  function saleWho(m) {
    if (m.type !== 'sale') return '';
    if (!m.customerId && !m.customerName) return '<span class="who muted">Venta rápida en tienda · sin cuenta de cliente</span>';
    const c = customerById(m.customerId), name = c ? c.name : m.customerName;
    return '<span class="who">Ha sido vendido al cliente <b>' + esc(name) + '</b>' + (contactHTML(m.customerId) ? ' ' + contactHTML(m.customerId) : '') + '</span>';
  }

  function renderSales() {
    const root = $('#view-sales');
    const f = state.sf;
    const users = Array.from(new Set(state.movements.map(m => m.user))).sort((a, b) => a.localeCompare(b, 'es'));
    if (!$('#sf', root)) {
      root.innerHTML =
        '<div class="section-head"><div><h2 class="serif">Movimientos</h2><p class="muted" id="salesCount"></p></div><button class="btn soft" id="csvBtn" type="button">' + icon('download') + 'Exportar CSV</button></div>' +
        '<div id="truncSales"></div>' +
        '<div class="filters" id="sf">' +
          '<label class="field sm"><span>Usuario</span><select id="sf_user"></select></label>' +
          '<label class="field sm"><span>Categoría</span><select id="sf_cat"><option value="">Todas</option>' + CATS.map(c => '<option>' + c.id + '</option>').join('') + '</select></label>' +
          '<label class="field sm"><span>Tipo</span><select id="sf_type"><option value="">Todos</option>' + Object.keys(TYPES).map(k => '<option value="' + k + '">' + TYPES[k].label + '</option>').join('') + '</select></label>' +
          '<label class="field sm"><span>Desde</span><input id="sf_from" type="date"></label>' +
          '<label class="field sm"><span>Hasta</span><input id="sf_to" type="date"></label>' +
          '<div class="chips quick-dates"><button type="button" class="chip" data-q="today">Hoy</button><button type="button" class="chip" data-q="week">7 días</button><button type="button" class="chip" data-q="all">Todo</button></div>' +
        '</div>' +
        '<div class="mv-list" id="mvList"></div>';
      const on = (id, key) => $(id, root).addEventListener('change', e => { state.sf[key] = e.target.value; state.sf.limit = 80; state.animate = true; renderSales(); });
      on('#sf_user', 'user'); on('#sf_cat', 'cat'); on('#sf_type', 'type'); on('#sf_from', 'from'); on('#sf_to', 'to');
      $('.quick-dates', root).addEventListener('click', e => {
        const b = e.target.closest('[data-q]'); if (!b) return;
        const now = Date.now();
        if (b.dataset.q === 'today') { state.sf.from = ymd(now); state.sf.to = ymd(now); }
        if (b.dataset.q === 'week') { state.sf.from = ymd(now - 6 * 864e5); state.sf.to = ymd(now); }
        if (b.dataset.q === 'all') { state.sf.from = ''; state.sf.to = ''; }
        state.animate = true; renderSales();
      });
      $('#csvBtn', root).addEventListener('click', exportCSV);
      $('#mvList', root).addEventListener('click', e => { if (e.target.closest('[data-more]')) { state.sf.limit += 80; renderSales(); } });
    }
    $('#truncSales', root).innerHTML = truncHTML();
    // sincronizar controles
    const su = $('#sf_user', root);
    su.innerHTML = '<option value="">Todos</option>' + users.map(u => '<option' + (u === f.user ? ' selected' : '') + ' value="' + esc(u) + '">' + esc(u) + '</option>').join('');
    $('#sf_cat', root).value = f.cat; $('#sf_type', root).value = f.type; $('#sf_from', root).value = f.from; $('#sf_to', root).value = f.to;

    const list = filteredMovements();
    const sales = list.filter(m => m.type === 'sale' && !m.undone);
    const nSales = sales.reduce((a, m) => a + units(m), 0);
    $('#salesCount', root).textContent = list.length + ' movimiento' + (list.length === 1 ? '' : 's') + (nSales ? ' · ' + nSales + (nSales === 1 ? ' unidad vendida' : ' unidades vendidas') + ' · ' + money(sales.reduce((a, m) => a + m.price * units(m), 0)) : '');
    const box = $('#mvList', root);
    if (!state.loaded) { box.innerHTML = '<div class="empty"><div class="spinner"></div></div>'; return; }
    if (!list.length) { box.innerHTML = '<div class="empty">' + icon('ventas', 'big') + '<h3 class="serif">Sin movimientos</h3><p class="muted">No hay registros con estos filtros.</p></div>'; return; }
    const shown = list.slice(0, f.limit);
    let day = '', html = '';
    shown.forEach((m, i) => {
      const d = ymd(m.at);
      if (d !== day) {
        day = d;
        const label = d === ymd(Date.now()) ? 'Hoy' : d === ymd(Date.now() - 864e5) ? 'Ayer' : new Date(m.at).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        html += '<div class="day">' + esc(label) + '</div>';
      }
      const t = TYPES[m.type] || { label: m.type, cls: 'edit' };
      const q = m.type === 'sale' ? '−' + units(m) : m.type === 'restock' ? '+' + m.qty : m.type === 'undo' ? '+1' : m.type === 'adjust' ? (m.qty > 0 ? '+' : '') + m.qty : m.type === 'create' ? '+' + m.qty : '';
      html += '<div class="mv' + (m.undone ? ' undone' : '') + (state.animate ? ' enter' : '') + '" style="--i:' + Math.min(i, 12) + '">' +
        '<span class="pill ' + t.cls + '">' + t.label + '</span>' +
        '<div class="mv-main"><b>' + esc(m.productName) + '</b>' + saleWho(m) +
          '<span class="muted">' + (m.variant ? esc(m.variant) + ' · ' : '') + 'Ref. ' + esc(m.code) + (m.discount || m.promoPct ? ' · −' + (m.discount || 0) + '%' + (m.promoPct ? ' +promo ' + m.promoPct + '%' : '') : '') + '</span></div>' +
        '<span class="mv-cat">' + icon(catKey(m.category)) + esc(m.category) + '</span>' +
        '<span class="mv-user">' + icon('user') + esc(m.user) + '</span>' +
        '<span class="mv-qty">' + q + '</span>' +
        '<span class="mv-time">' + fmtDT(m.at) + (m.undone ? '<em> · deshecha por ' + esc(m.undoneBy || '') + '</em>' : '') + '</span>' +
      '</div>';
    });
    if (list.length > shown.length) html += '<button class="btn soft more" data-more type="button">Mostrar más (' + (list.length - shown.length) + ')</button>';
    box.innerHTML = html;
    state.animate = false;
  }

  function exportCSV() {
    const rows = [['Fecha', 'Hora', 'Tipo', 'Producto', 'Referencia', 'Variante', 'Categoría', 'Usuario', 'Cantidad', 'Precio unidad', 'Deshecha', 'Cliente', 'Teléfono', 'Email', 'Descuento %']];
    filteredMovements().forEach(m => {
      const d = new Date(m.at);
      rows.push([d.toLocaleDateString('es-ES'), d.toLocaleTimeString('es-ES'), (TYPES[m.type] || {}).label || m.type, m.productName, m.code, m.variant, m.category, m.user, m.qty, String(m.price).replace('.', ','), m.undone ? 'Sí' : '', m.customerName || '', (customerById(m.customerId) || {}).phone || '', (customerById(m.customerId) || {}).email || '', m.discount || 0]);
    });
    const csv = '﻿' + rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'movimientos-' + ymd(Date.now()) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* =========================================================
     RESUMEN
     ========================================================= */
  // Por cliente: sus datos y lo que compró en cada fecha
  function renderCustSummary(root) {
    const by = {};
    state.orders.forEach(o => { (by[o.customerId] || (by[o.customerId] = { id: o.customerId, name: o.customerName, orders: [] })).orders.push(o); });
    const list = Object.values(by).sort((a, b) => b.orders[0].at - a.orders[0].at);
    const box = $('#custSum', root), q = $('[data-mi="filter"]', root);
    $('#custSumNote', root).textContent = list.length
      ? list.length + (list.length === 1 ? ' cliente con compras' : ' clientes con compras') + ' · el más reciente primero' + (state.orders.length >= 300 ? ' · se muestran las últimas 300 compras' : '')
      : '';
    if (!list.length) { box.innerHTML = '<p class="muted pad">Todavía no hay compras asociadas a clientes. Aparecerán aquí al finalizar una compra desde el carrito.</p>'; return; }
    const open = new Set($$('#custSum .cs[open]', root).map(d => d.dataset.id));
    box.innerHTML = list.map(c => {
      const cu = customerById(c.id), name = cu ? cu.name : c.name;
      const total = c.orders.reduce((a, o) => a + o.total, 0), uds = c.orders.reduce((a, o) => a + (o.units || 0), 0);
      const days = [];
      c.orders.forEach(o => {   // las compras llegan de la más reciente a la más antigua
        const k = ymd(o.at); let d = days.find(x => x.k === k);
        if (!d) { d = { k, at: o.at, items: [], total: 0 }; days.push(d); }
        d.total += o.total;
        (o.lines || []).forEach(l => { const it = d.items.find(x => x.id === l.productId && x.var === (l.variant || '')); if (it) it.qty += l.qty; else d.items.push({ id: l.productId, name: l.name, var: l.variant || '', qty: l.qty }); });
      });
      return '<details class="cs" data-id="' + esc(c.id) + '"' + (open.has(c.id) || list.length === 1 ? ' open' : '') + ' data-text="' + esc(((name || '') + ' ' + (cu ? cu.phone + ' ' + cu.email : '')).toLowerCase()) + '">' +
        '<summary><span class="avatar sm">' + esc((name || '?').charAt(0).toUpperCase()) + '</span>' +
          '<div class="cs-main"><b>' + esc(name) + '</b><span class="cs-contact">' + (cu ? (contactHTML(c.id) || '<span class="muted">Sin teléfono ni correo</span>') : '<span class="muted">Cuenta eliminada</span>') + '</span></div>' +
          '<div class="cs-tot"><b>' + money(total) + '</b><span class="muted">' + c.orders.length + (c.orders.length === 1 ? ' compra' : ' compras') + ' · ' + uds + (uds === 1 ? ' ud.' : ' uds.') + '</span></div></summary>' +
        '<div class="cs-body">' + days.map(d => '<p class="cs-day"><b>El día ' + fmtDay(d.at) + '</b> compró ' + esc(listJoin(d.items.map(i => i.name + (i.var ? ' (' + i.var + ')' : '') + (i.qty > 1 ? ' ×' + i.qty : '')))) + ' <span class="muted">· ' + money(d.total) + '</span></p>').join('') +
          (cu ? '<button class="btn soft" type="button" data-m="custedit" data-id="' + esc(c.id) + '">' + icon('edit') + 'Editar teléfono / correo</button>' : '') + '</div></details>';
    }).join('');
    if (q && q.value) q.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function renderSummary() {
    const root = $('#view-summary');
    if (!$('#sumGrid', root)) {
      root.innerHTML =
        '<div class="section-head"><div><h2 class="serif">Resumen</h2><p class="muted">Un vistazo al estado de la tienda</p></div></div>' +
        '<div id="truncSum"></div>' +
        '<div class="kpis" id="sumGrid">' +
          '<div class="kpi k-sage"><span class="kpi-l">Ventas de hoy</span><b class="kpi-v" id="k_sales">0</b><span class="kpi-s" id="k_sales_s"></span></div>' +
          '<div class="kpi k-sand"><span class="kpi-l">Ingresos de hoy</span><b class="kpi-v" id="k_rev">0 €</b><span class="kpi-s">IVA incluido</span></div>' +
          '<div class="kpi k-low"><span class="kpi-l">Últimas unidades</span><b class="kpi-v" id="k_low">0</b><span class="kpi-s">productos</span></div>' +
          '<div class="kpi k-out"><span class="kpi-l">Agotados</span><b class="kpi-v" id="k_out">0</b><span class="kpi-s">productos</span></div>' +
        '</div>' +
        '<div class="panels">' +
          '<section class="panel"><div class="panel-head"><h3 class="serif">Ventas por dependiente</h3><div class="chips" id="rangeChips">' +
            '<button type="button" class="chip" data-r="today">Hoy</button><button type="button" class="chip" data-r="week">7 días</button><button type="button" class="chip" data-r="month">Mes</button><button type="button" class="chip" data-r="all">Todo</button></div></div><div id="byUser"></div></section>' +
          '<section class="panel"><div class="panel-head"><h3 class="serif">Productos agotados</h3></div><div id="outList"></div></section>' +
          '<section class="panel"><div class="panel-head"><h3 class="serif">Últimas unidades</h3></div><div id="lowList"></div></section>' +
        '</div>' +
        '<section class="panel panel-wide"><div class="panel-head"><h3 class="serif">Compras por cliente</h3>' +
          '<label class="search sm">' + icon('search') + '<input type="search" data-mi="filter" data-target="custSum" placeholder="Buscar cliente, teléfono o correo…" autocomplete="off"></label></div>' +
          '<p class="muted small" id="custSumNote"></p><div id="custSum"></div></section>';
      $('#rangeChips', root).addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) { state.range = b.dataset.r; renderSummary(); } });
    }
    $('#truncSum', root).innerHTML = truncHTML();
    const t0 = startOfDay();
    const sales = realSales();
    const today = sales.filter(m => m.at >= t0);
    const todayUnits = today.reduce((a, m) => a + units(m), 0);
    countUp($('#k_sales'), todayUnits);
    $('#k_sales_s').textContent = todayUnits === 1 ? 'unidad vendida' : 'unidades vendidas';
    countUp($('#k_rev'), today.reduce((a, m) => a + m.price * units(m), 0), money);
    const out = state.products.filter(p => statusOf(p) === 'out'), low = state.products.filter(p => statusOf(p) === 'low');
    countUp($('#k_low'), low.length); countUp($('#k_out'), out.length);

    $$('#rangeChips .chip', root).forEach(c => c.classList.toggle('on', c.dataset.r === state.range));
    const since = state.range === 'today' ? t0 : state.range === 'week' ? t0 - 6 * 864e5 : state.range === 'month' ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() : 0;
    const agg = {};
    sales.filter(m => m.at >= since).forEach(m => { const a = agg[m.user] || (agg[m.user] = { n: 0, rev: 0 }); a.n += units(m); a.rev += m.price * units(m); });
    const rows = Object.entries(agg).sort((a, b) => b[1].n - a[1].n);
    const max = rows.length ? rows[0][1].n : 1;
    $('#byUser').innerHTML = rows.length ? rows.map(([u, a], i) =>
      '<div class="bar-row"><span class="avatar sm">' + esc(u.charAt(0).toUpperCase()) + '</span><div class="bar-main"><div class="bar-top"><b>' + esc(u) + '</b><span>' + a.n + (a.n === 1 ? ' unidad' : ' unidades') + ' · ' + money(a.rev) + '</span></div>' +
      '<div class="bar"><i style="width:' + Math.max(4, a.n / max * 100) + '%;--d:' + (i * 70) + 'ms"></i></div></div></div>').join('')
      : '<p class="muted pad">Todavía no hay ventas en este periodo.</p>';

    renderCustSummary(root);
    $('#outList').innerHTML = out.length ? out.map(p => {
      const so = p.soldOutBy || p.lastSale;
      return '<div class="li"><span class="dot out"></span><div class="li-main"><b>' + esc(p.name) + '</b><span class="muted">' + (p.variant ? esc(p.variant) + ' · ' : '') + 'Ref. ' + esc(p.code) + '</span></div><span class="li-side">' + (so ? 'Vendió <b>' + esc(so.user) + '</b><br>' + fmtDT(so.at) : '—') + '</span></div>';
    }).join('') : '<p class="muted pad">Ningún producto agotado. 🌿</p>';
    $('#lowList').innerHTML = low.length ? low.sort((a, b) => a.stock - b.stock).map(p =>
      '<div class="li"><span class="dot low"></span><div class="li-main"><b>' + esc(p.name) + '</b><span class="muted">' + (p.variant ? esc(p.variant) + ' · ' : '') + 'Ref. ' + esc(p.code) + '</span></div><span class="li-side"><b>' + p.stock + '</b> ' + (p.stock === 1 ? 'unidad' : 'unidades') + '</span></div>').join('')
      : '<p class="muted pad">Todo con stock suficiente.</p>';
  }

  /* =========================================================
     RENDER GLOBAL Y TIEMPO REAL
     ========================================================= */
  function renderAll() {
    if (state.view === 'inventory') renderGrid();
    else if (state.view === 'sales') renderSales();
    else if (state.view === 'summary') renderSummary();
    else if (MasarteUI.views[state.view]) MasarteUI.views[state.view].render();
    renderBadge();
  }

  function onData(data) {
    const first = !state.loaded;
    const nextMap = new Map();
    state.changed = new Set();
    data.products.forEach(p => {
      nextMap.set(p.id, { stock: p.stock, upd: p.updatedAt, sale: p.lastSale ? p.lastSale.at : 0 });
      const o = prevMap.get(p.id);
      if (!first && (!o || o.stock !== p.stock || o.upd !== p.updatedAt)) {
        if (!busy.has(p.id)) state.changed.add(p.id);
        if (p.lastSale && p.lastSale.user !== state.user && (!o || o.sale !== p.lastSale.at) && !busy.has(p.id)) {
          toast(p.lastSale.user + ' vendió ' + p.name + (p.stock === 0 ? ' · AGOTADO' : ''), { type: p.stock === 0 ? 'warn' : '' });
        }
      }
    });
    prevMap = nextMap;
    state.products = data.products;
    state.movements = data.movements;
    state.customers = (data.customers || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
    state.carts = data.carts || []; state.orders = data.orders || []; state.promos = data.promos || [];
    state.truncated = !!data.truncated;
    state.loaded = true;
    if (state.user) {
      if (first) state.animate = true;
      // no interrumpir al usuario mientras escribe en el buscador
      renderAll();
    }
  }

  // Contador del carrito en las pestañas (sin repintar todo)
  function renderBadge() {
    const n = cartUnits(state.customerId);
    $$('.tab[data-view="cart"]').forEach(t => {
      let b = $('.tab-n', t);
      if (n && !b) { b = document.createElement('em'); b.className = 'tab-n'; t.appendChild(b); }
      if (b) { if (n) b.textContent = n; else b.remove(); }
    });
  }

  // Las reservas caducan con el tiempo: se repinta cada 20 s la vista de carrito/tienda/admin (sin molestar si se está escribiendo)
  setInterval(() => {
    if (!state.loaded || !state.user || !MasarteUI.views[state.view]) return;
    const a = document.activeElement;
    if (!$('#sheetRoot').hidden || (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))) return;
    renderAll();
  }, 20000);

  let booted = false;
  async function boot() {
    booted = true;
    store.onStatus(s => {
      if (s.local) banner('⚠ MODO LOCAL: los datos NO se comparten entre dispositivos ni dependientes. Conecta Firebase en js/config.js (ver README) para sincronizar.');
      else if (s.error) banner(s.error);
      else if (s.online != null) { banner(''); state.online = s.online && navigator.onLine; }
      setLive();
    });
    store.onChange(onData);
    setLive();
    try { await store.init(); }
    catch (e) { banner(errMsg(e)); state.loaded = true; renderAll(); }
  }

  /* =========================================================
     API para el módulo de tienda, carrito y administración
     ========================================================= */
  Object.assign(MasarteUI, {
    state, store, cfg, P, $, $$, esc, money, icon, toast, errMsg, fmtDT, catKey, CATS, busy, lsGet, lsSet,
    openSheet, closeSheet, tryCloseSheet, confirmBox, countUp, reduceMotion,
    avail, customerById, contactHTML, cartOf, promoById, productsMap, cartUnits, statusOf, byId,
    renderHeader, renderAll, setView, openProductForm,
    setSheetGuard: fn => { sheetGuard = fn; }
  });

  /* =========================================================
     INICIO
     ========================================================= */
  (function init() {
    if (state.user) {
      // sesión recordada en este dispositivo
      $('#app').hidden = false;
      renderHeader();
      renderAll();
      boot();
    } else {
      showLogin();
    }
  })();
})();
