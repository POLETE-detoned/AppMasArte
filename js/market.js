/* ============================================================
   TIENDA · CARRITO · COMPRA · ADMINISTRACIÓN
   Se apoya en la API que expone app.js (window.MasarteUI).
   ============================================================ */
(function () {
  'use strict';
  const U = window.MasarteUI;
  const { state, store, cfg, P, $, $$, esc, money, icon, toast, errMsg, fmtDT, catKey, CATS, busy, lsSet,
    openSheet, closeSheet, confirmBox, avail, customerById, cartOf, promoById, productsMap, byId } = U;

  const pct = n => (n === 0 ? 'Sin descuento' : n === 100 ? '100 % · Gratis' : '−' + n + ' %');
  const hhmm = ms => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const minsLeft = ms => Math.max(0, Math.ceil((ms - Date.now()) / 60000));
  const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);
  const photoOf = p => (p && p.photo ? '<img src="' + esc(p.photo) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async">'
    : '<div class="ph ph-' + catKey(p ? p.category : '') + '">' + icon(catKey(p ? p.category : '')) + '</div>');
  const cust = () => customerById(state.customerId);
  const lineQty = pid => { const c = cartOf(state.customerId); const l = c && (c.items || []).find(i => i.productId === pid); return l ? l.qty : 0; };
  const sheetClose = () => closeSheet();

  /* =========================================================
     CUENTAS DE CLIENTES
     ========================================================= */
  function custBarHTML() {
    const opts = state.customers.map(c => '<option value="' + esc(c.id) + '"' + (c.id === state.customerId ? ' selected' : '') + '>' + esc(c.name) + (cartUnitsOf(c.id) ? ' · ' + cartUnitsOf(c.id) + ' en carrito' : '') + '</option>').join('');
    return '<div class="cust-bar"><label class="field sm"><span>Cuenta del cliente</span><select data-mc="cust"><option value="">— Elige una cuenta —</option>' + opts + '</select></label>' +
      '<button class="btn soft" type="button" data-m="newcust">' + icon('plus') + 'Nueva cuenta</button></div>';
  }
  const cartUnitsOf = id => U.cartUnits(id);

  function selectCustomer(id) {
    state.customerId = id || ''; lsSet('masarte.customer', state.customerId);
    U.renderHeader(); U.renderAll();
  }

  function openCustomerSheet(after, editId) {
    const ex = editId ? customerById(editId) : null;
    const s = openSheet(
      '<div class="sheet-head"><h3 class="serif">' + (ex ? 'Datos del cliente' : 'Nueva cuenta de cliente') + '</h3><button class="icon-btn" data-close type="button" aria-label="Cerrar">' + icon('close') + '</button></div>' +
      '<form id="cf" novalidate><label class="field"><span>Nombre *</span><input id="c_name" type="text" maxlength="60" placeholder="Nombre del cliente" value="' + esc(ex ? ex.name : '') + '" required></label>' +
      '<div class="row2"><label class="field"><span>Teléfono</span><input id="c_phone" type="tel" maxlength="30" inputmode="tel" value="' + esc(ex ? ex.phone : '') + '"></label>' +
      '<label class="field"><span>Email</span><input id="c_mail" type="email" maxlength="80" value="' + esc(ex ? ex.email : '') + '"></label></div>' +
      '<p class="form-error" id="cfErr" role="alert"></p>' +
      '<div class="sheet-actions"><button class="btn ghost" data-close type="button">Cancelar</button><button class="btn primary" type="submit">' + (ex ? 'Guardar' : 'Crear cuenta') + '</button></div></form>', 'sheet-sm');
    s.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
    $('#cf', s).addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('button[type=submit]', s); btn.disabled = true;
      try {
        const f = { name: $('#c_name', s).value, phone: $('#c_phone', s).value, email: $('#c_mail', s).value };
        if (ex) { await store.updateCustomer(ex.id, f, state.user); closeSheet(); toast('Datos del cliente guardados', { type: 'ok' }); U.renderAll(); return; }
        const id = await store.addCustomer(f, state.user);
        closeSheet(); toast('Cuenta creada', { type: 'ok' });
        state.customerId = id; lsSet('masarte.customer', id);
        U.renderHeader(); U.renderAll();
        if (after) after();
      } catch (err) { $('#cfErr', s).textContent = errMsg(err); btn.disabled = false; }
    });
    setTimeout(() => $('#c_name', s).focus(), 120);
  }

  function requireCustomer(after) {
    if (cust()) return true;
    toast('Primero elige o crea la cuenta del cliente', { type: 'warn' });
    openCustomerSheet(after);
    return false;
  }

  /* =========================================================
     TIENDA (catálogo para vender)
     ========================================================= */
  const S = { cat: 'all', q: '', openDisc: new Set(), disc: {}, qty: {} };
  const discOf = p => (S.disc[p.id] != null ? S.disc[p.id] : (Number(p.discount) || 0));
  const qtyOf = p => Math.max(1, S.qty[p.id] || 1);

  function shopCard(p, i, animate) {
    const now = Date.now(), cid = state.customerId;
    const av = avail(p), rsv = P.reservedUnits(p, now), key = catKey(p.category);
    const addable = Math.max(0, P.available(p, now, cid) - lineQty(p.id));
    const d = discOf(p), pl = P.priceLine({ qty: 1, discount: d }, p, null, 0);
    const inCart = lineQty(p.id), q = Math.min(qtyOf(p), Math.max(1, addable));
    const out = (p.stock || 0) <= 0;
    const badge = out ? '<span class="badge out">AGOTADO</span>' : av <= 0 ? '<span class="badge low"><i></i>Reservado</span>'
      : av <= (cfg.lowStock != null ? cfg.lowStock : 2) ? '<span class="badge low"><i></i>Últimas unidades</span>' : '<span class="badge ok"><i></i>Disponible</span>';
    const chips = P.DISCOUNTS.map(x => '<button type="button" class="dchip' + (x === d ? ' on' : '') + (x === 100 ? ' free' : '') + '" data-m="disc" data-d="' + x + '">' + (x === 0 ? 'Sin dto.' : x === 100 ? 'Gratis' : x + '%') + '</button>').join('');
    return '<article class="card scard st-' + (out ? 'out' : av <= 2 ? 'low' : 'ok') + (animate ? ' enter' : '') + '" data-id="' + esc(p.id) + '" style="--i:' + Math.min(i, 14) + '">' +
      '<div class="card-photo">' + photoOf(p) + '<div class="card-tags"><span class="tag">' + icon(key) + esc(p.category) + '</span>' + badge + '</div>' + (d > 0 ? '<span class="dto-flag' + (d === 100 ? ' free' : '') + '">' + (d === 100 ? 'GRATIS' : '−' + d + '%') + '</span>' : '') + '</div>' +
      '<div class="card-body">' +
        '<div class="card-head"><h3 class="serif">' + esc(p.name) + '</h3></div>' +
        '<div class="meta">' + (p.variant ? '<span>' + esc(p.variant) + '</span>' : '') + '<span class="code">Ref. ' + esc(p.code) + '</span></div>' +
        (p.notes ? '<p class="notes">' + esc(p.notes) + '</p>' : '') +
        '<div class="pbox"><div class="pbox-main">' + (d > 0 ? '<s>' + money(pl.list) + '</s>' : '') + '<b class="pfinal">' + money(pl.unitFinal) + '</b></div>' +
          '<span class="avail">' + (out ? 'Sin stock' : plural(av, 'unidad libre', 'unidades libres')) + (rsv > 0 && !out ? ' · ' + rsv + ' reservadas' : '') + '</span></div>' +
        '<div class="disc-tab"><button type="button" class="disc-toggle' + (S.openDisc.has(p.id) ? ' open' : '') + '" data-m="togdisc">' + icon('tag') + '<span>Descuentos</span><em>' + (d === 0 ? 'Ninguno' : d === 100 ? 'Gratis' : '−' + d + ' %') + '</em></button>' +
          (S.openDisc.has(p.id) ? '<div class="disc-panel"><div class="dchips">' + chips + '</div>' +
            '<dl class="breakdown"><div><dt>Precio original</dt><dd>' + money(pl.list) + '</dd></div><div><dt>Descuento (' + d + ' %)</dt><dd class="neg">−' + money(pl.unitSaving) + '</dd></div><div class="fin"><dt>Precio final</dt><dd>' + money(pl.unitFinal) + '</dd></div></dl></div>' : '') +
        '</div>' +
        (inCart ? '<p class="incart">' + icon('cart') + plural(inCart, 'unidad', 'unidades') + ' en el carrito de ' + esc((cust() || {}).name || '') + '</p>' : '') +
        '<div class="add-row"><div class="qty"><button type="button" data-m="sq" data-s="-1" aria-label="Menos">−</button><span>' + q + '</span><button type="button" data-m="sq" data-s="1" aria-label="Más">+</button></div>' +
          '<button class="btn sell" type="button" data-m="add"' + (addable <= 0 ? ' disabled' : '') + '>' + icon('cart') + '<span>' + (addable <= 0 ? (out ? 'Agotado' : inCart ? 'Máximo en carrito' : 'Reservado') : 'Añadir al carrito') + '</span></button></div>' +
      '</div></article>';
  }

  function renderShop() {
    const root = $('#view-shop');
    if (!$('#shopGrid', root)) {
      root.innerHTML = '<div class="section-head"><div><h2 class="serif">Tienda</h2><p class="muted">Elige los artículos para el cliente. Quedan reservados al añadirlos al carrito.</p></div></div>' +
        '<div id="shopCust"></div>' +
        '<div class="toolbar"><label class="search">' + icon('search') + '<input id="shopQ" type="search" placeholder="Buscar por nombre o código…" autocomplete="off"></label></div>' +
        '<div class="chips shop-cats" id="shopCats"></div><div class="result-line" id="shopCount"></div><div class="grid" id="shopGrid"></div>';
      $('#shopQ', root).addEventListener('input', e => { S.q = e.target.value; state.animate = true; renderShop(); });
    }
    $('#shopCust', root).innerHTML = custBarHTML();
    $('#shopCats', root).innerHTML = [{ id: 'all', label: 'Todas' }].concat(CATS.map(c => ({ id: c.id, label: c.id }))).map(c =>
      '<button type="button" class="chip' + (S.cat === c.id ? ' on' : '') + '" data-m="shopcat" data-c="' + esc(c.id) + '">' + esc(c.label) + '</button>').join('');
    const q = S.q.trim().toLowerCase();
    const list = state.products.filter(p => (S.cat === 'all' || p.category === S.cat) &&
      (!q || String(p.name).toLowerCase().includes(q) || String(p.code).toLowerCase().includes(q) || String(p.variant || '').toLowerCase().includes(q)))
      .sort((a, b) => (avail(b) > 0) - (avail(a) > 0) || String(a.name).localeCompare(String(b.name), 'es'));
    $('#shopCount', root).textContent = plural(list.length, 'producto', 'productos');
    const grid = $('#shopGrid', root);
    if (!state.loaded) { grid.innerHTML = '<div class="empty"><div class="spinner"></div><p>Cargando…</p></div>'; return; }
    if (!list.length) { grid.innerHTML = '<div class="empty">' + icon('inv', 'big') + '<h3 class="serif">Nada por aquí</h3><p class="muted">No hay productos con ese filtro.</p></div>'; return; }
    grid.innerHTML = list.map((p, i) => shopCard(p, i, state.animate)).join('');
    state.animate = false;
  }

  function repaintCard(id) {
    const el = $('.scard[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]'), p = byId(id);
    if (el && p) { const tmp = document.createElement('div'); tmp.innerHTML = shopCard(p, 0, false); el.replaceWith(tmp.firstChild); }
  }

  async function addToCart(id) {
    if (!requireCustomer(() => addToCart(id))) return;
    const p = byId(id), key = 'c:' + id; if (!p || busy.has(key)) return;
    busy.add(key);
    try {
      const q = Math.min(qtyOf(p), Math.max(1, P.available(p, Date.now(), state.customerId) - lineQty(id)));
      await store.cartSetLine(state.customerId, id, lineQty(id) + q, discOf(p), state.user);
      S.qty[id] = 1;
      toast('Añadido para ' + cust().name + ': ' + p.name + (q > 1 ? ' ×' + q : ''), { type: 'ok', action: { label: 'Ver carrito', fn: () => U.setView('cart') } });
    } catch (e) { toast(errMsg(e), { type: 'err' }); } finally { busy.delete(key); }
  }

  /* =========================================================
     CARRITO
     ========================================================= */
  const manualSaving = t => P.r2(t.lines.reduce((a, l) => a + l.list * l.qty * l.discount / 100, 0));

  function resInfo(cartId, t) {
    // Caducidad más próxima de las reservas de este carrito
    const now = Date.now(); let min = Infinity, expired = 0;
    t.lines.forEach(l => {
      const r = l.product && l.product.reservations && l.product.reservations[cartId];
      if (!r || r.exp <= now) expired++; else min = Math.min(min, r.exp);
    });
    return { min: min === Infinity ? 0 : min, expired };
  }

  function promoNote(promo, t) {
    if (!promo) return '';
    if (t.promoApplied) return 'Promoción aplicada a ' + plural(t.lines.filter(l => l.promoPct > 0).length, 'línea', 'líneas') + '.';
    if (!P.promoMatches(promo, null, t.listSubtotal) && promo.minSubtotal > t.listSubtotal) return 'Faltan ' + money(promo.minSubtotal - t.listSubtotal) + ' para activar esta promoción.';
    if (t.lines.some(l => l.note)) return 'No se aplica: las líneas con descuento manual no admiten promoción (incompatibles).';
    return 'Ninguna línea del carrito cumple las condiciones de esta promoción.';
  }

  function renderCart() {
    const root = $('#view-cart'), c = cust(), cart = c ? cartOf(c.id) : null;
    const items = (cart && cart.items) || [];
    let html = '<div class="section-head"><div><h2 class="serif">Carrito</h2><p class="muted">' + (c ? 'Cuenta de <b>' + esc(c.name) + '</b>' : 'Elige una cuenta para ver su carrito') + '</p></div></div>' + custBarHTML();
    if (!c) { root.innerHTML = html + '<div class="empty">' + icon('cart', 'big') + '<h3 class="serif">Sin cuenta seleccionada</h3><p class="muted">Cada cliente tiene su propio carrito.</p></div>'; return; }
    if (!items.length) { root.innerHTML = html + '<div class="empty">' + icon('cart', 'big') + '<h3 class="serif">Carrito vacío</h3><p class="muted">Añade artículos desde la Tienda.</p><div class="empty-actions"><button class="btn primary" data-view="shop" type="button">Ir a la tienda</button></div></div>'; return; }

    const promo = cart.promoId ? promoById(cart.promoId) : null;
    const t = P.cartTotals(items, productsMap(), promo && promo.active !== false ? promo : null);
    const ri = resInfo(c.id, t);
    html += '<div class="res-bar ' + (ri.expired ? 'bad' : '') + '">' + icon('tag') +
      (ri.expired ? '<span><b>' + plural(ri.expired, 'reserva caducada', 'reservas caducadas') + '.</b> Esas unidades pueden haberse liberado para otros clientes.</span>'
        : '<span>Unidades reservadas hasta las <b>' + hhmm(ri.min) + '</b> (quedan ' + minsLeft(ri.min) + ' min)</span>') +
      '<button class="btn soft" type="button" data-m="renew">Renovar reservas</button></div>';

    html += '<div class="cart-grid"><div class="cart-lines">' + t.lines.map(l => {
      const it = l.item, p = l.product, r = p && p.reservations && p.reservations[c.id], exp = !r || r.exp <= Date.now();
      if (!p) return '<div class="cl missing" data-pid="' + esc(it.productId) + '"><div class="cl-main"><b>Producto eliminado del inventario</b><span class="muted">No se puede comprar. Quítalo del carrito.</span></div><button class="btn danger-ghost" data-m="rm" type="button">Quitar</button></div>';
      return '<div class="cl" data-pid="' + esc(p.id) + '"><div class="cl-img">' + photoOf(p) + '</div>' +
        '<div class="cl-main"><b>' + esc(p.name) + '</b><span class="muted">' + (p.variant ? esc(p.variant) + ' · ' : '') + 'Ref. ' + esc(p.code) + '</span>' +
          '<div class="cl-price">' + (l.unitSaving > 0 ? '<s>' + money(l.list) + '</s>' : '') + '<b>' + money(l.unitFinal) + '</b><span class="muted"> / ud.</span>' +
            (l.discount ? '<em class="tagd">' + (l.discount === 100 ? 'GRATIS' : '−' + l.discount + '%') + '</em>' : '') + (l.promoPct ? '<em class="tagd promo">Promo −' + l.promoPct + '%</em>' : '') + '</div>' +
          (l.note ? '<span class="cl-note">' + esc(l.note) + '</span>' : '') +
          (exp ? '<span class="cl-note bad">Reserva caducada</span>' : '') +
          '<div class="cl-ctrl"><div class="qty"><button type="button" data-m="lq" data-s="-1" aria-label="Menos">−</button><span>' + it.qty + '</span><button type="button" data-m="lq" data-s="1" aria-label="Más">+</button></div>' +
          '<label class="dsel"><span>Descuento</span><select data-mc="ldisc">' + P.DISCOUNTS.map(d => '<option value="' + d + '"' + (d === l.discount ? ' selected' : '') + '>' + pct(d) + '</option>').join('') + '</select></label></div></div>' +
        '<div class="cl-total">' + (l.lineSaving > 0 ? '<s>' + money(l.lineList) + '</s>' : '') + '<b>' + money(l.lineTotal) + '</b>' +
          '<button class="icon-btn" type="button" data-m="rm" aria-label="Quitar del carrito">' + icon('close') + '</button></div></div>';
    }).join('') + '</div>';

    const promos = state.promos.filter(x => x.active !== false);
    html += '<aside class="cart-side"><div class="panel">' +
      '<h3 class="serif">Promoción</h3>' +
      (promos.length ? '<label class="field sm"><select data-mc="promo"><option value="">Sin promoción</option>' + promos.map(x => '<option value="' + esc(x.id) + '"' + (x.id === cart.promoId ? ' selected' : '') + '>' + esc(x.name) + (x.stackable ? ' (acumulable)' : '') + '</option>').join('') + '</select></label>' +
        (promo ? '<p class="promo-note ' + (t.promoApplied ? 'ok' : '') + '">' + esc(promoNote(promo, t)) + '</p>' : '')
        : '<p class="muted pad">No hay promociones activas.</p>') +
      '<dl class="totals"><div><dt>Precio original</dt><dd>' + money(t.listSubtotal) + '</dd></div>' +
        (manualSaving(t) > 0 ? '<div><dt>Descuentos</dt><dd class="neg">−' + money(manualSaving(t)) + '</dd></div>' : '') +
        (t.promoApplied ? '<div><dt>Promoción</dt><dd class="neg">−' + money(P.r2(t.saving - manualSaving(t))) + '</dd></div>' : '') +
        '<div class="grand"><dt>Total · ' + plural(t.units, 'unidad', 'unidades') + '</dt><dd>' + money(t.total) + '</dd></div></dl>' +
      '<button class="btn primary xl" type="button" data-m="checkout">Finalizar compra</button>' +
      '<button class="btn ghost" type="button" data-m="clear">Vaciar carrito</button></div></aside></div>';
    root.innerHTML = html;
  }

  async function cartOp(key, fn, okMsg) {
    if (busy.has(key)) return; busy.add(key);
    try { await fn(); if (okMsg) toast(okMsg, { type: 'ok' }); } catch (e) { toast(errMsg(e), { type: 'err' }); } finally { busy.delete(key); }
  }

  function openCheckout() {
    const c = cust(), cart = c && cartOf(c.id); if (!cart || !(cart.items || []).length) return;
    const promo = cart.promoId ? promoById(cart.promoId) : null;
    const t = P.cartTotals(cart.items, productsMap(), promo && promo.active !== false ? promo : null);
    const s = openSheet(
      '<div class="sheet-head"><h3 class="serif">Resumen de la compra</h3><button class="icon-btn" data-close type="button" aria-label="Cerrar">' + icon('close') + '</button></div>' +
      '<p class="muted">Cuenta: <b>' + esc(c.name) + '</b> · Atiende: <b>' + esc(state.user) + '</b></p>' +
      '<div class="sum">' + t.lines.map(l => '<div class="sum-l"><div><b>' + esc(l.product ? l.product.name : 'Producto eliminado') + '</b><span class="muted">' + l.qty + ' × ' + money(l.unitFinal) +
        (l.discount ? ' · dto. ' + l.discount + '%' : '') + (l.promoPct ? ' · promo ' + l.promoPct + '%' : '') + (l.unitSaving > 0 ? ' <s>' + money(l.list) + '</s>' : '') + '</span></div><b>' + money(l.lineTotal) + '</b></div>').join('') + '</div>' +
      '<dl class="totals"><div><dt>Precio original</dt><dd>' + money(t.listSubtotal) + '</dd></div><div><dt>Descuentos' + (t.promoApplied ? ' y promoción «' + esc(promo.name) + '»' : '') + '</dt><dd class="neg">−' + money(t.saving) + '</dd></div>' +
      '<div class="grand"><dt>Total a pagar</dt><dd>' + money(t.total) + '</dd></div></dl>' +
      '<p class="form-error" id="coErr" role="alert"></p>' +
      '<div class="sheet-actions"><button class="btn ghost" data-close type="button">Volver al carrito</button><button class="btn primary" id="coOk" type="button">Confirmar compra</button></div>');
    s.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
    $('#coOk', s).addEventListener('click', async () => {
      const btn = $('#coOk', s); btn.disabled = true; btn.textContent = 'Registrando…';
      try {
        const orderId = await store.checkout(c.id, state.user);
        showReceipt(c.name, t, orderId);
      } catch (e) { $('#coErr', s).textContent = errMsg(e); btn.disabled = false; btn.textContent = 'Confirmar compra'; }
    });
  }

  function showReceipt(name, t, orderId) {
    const s = openSheet(
      '<div class="done"><div class="done-ic">' + icon('admin') + '</div><h3 class="serif">¡Compra registrada!</h3>' +
      '<p class="muted">Cuenta de <b>' + esc(name) + '</b> · ' + plural(t.units, 'artículo', 'artículos') + '</p><div class="done-total">' + money(t.total) + '</div>' +
      '<p class="muted small">Pedido ' + esc(String(orderId).slice(-6).toUpperCase()) + ' · el stock ya está descontado</p>' +
      '<div class="sheet-actions center"><button class="btn primary" data-close type="button">Seguir vendiendo</button></div></div>', 'sheet-sm');
    s.addEventListener('click', e => { if (e.target.closest('[data-close]')) { closeSheet(); U.setView('shop'); } });
  }

  /* =========================================================
     ADMINISTRACIÓN
     ========================================================= */
  const A = { tab: 'carts' };
  const ATABS = [['carts', 'Carritos activos'], ['orders', 'Compras'], ['promos', 'Descuentos'], ['res', 'Reservas'], ['stock', 'Stock']];

  function guardAdmin() {
    if (state.admin || !cfg.adminPin) { state.admin = true; return Promise.resolve(true); }
    try { if (sessionStorage.getItem('masarte.admin') === '1') { state.admin = true; return Promise.resolve(true); } } catch (e) { /* ignorar */ }
    return new Promise(res => {
      let done = false;
      const s = openSheet(
        '<div class="sheet-head"><h3 class="serif">Administración</h3><button class="icon-btn" data-close type="button" aria-label="Cerrar">' + icon('close') + '</button></div>' +
        '<form id="af" novalidate><label class="field"><span>PIN de administrador</span><input id="a_pin" type="password" inputmode="numeric" maxlength="12" autocomplete="off"></label>' +
        '<p class="form-error" id="afErr" role="alert"></p><div class="sheet-actions"><button class="btn ghost" data-close type="button">Cancelar</button><button class="btn primary" type="submit">Entrar</button></div></form>', 'sheet-sm');
      const finish = v => { if (!done) { done = true; res(v); } };
      s.addEventListener('click', e => { if (e.target.closest('[data-close]')) { closeSheet(); finish(false); } });
      $('#sheetRoot').addEventListener('mousedown', function h(e) { if (e.target.id === 'sheetRoot') { finish(false); $('#sheetRoot').removeEventListener('mousedown', h); } });
      $('#af', s).addEventListener('submit', e => {
        e.preventDefault();
        if ($('#a_pin', s).value !== String(cfg.adminPin)) { $('#afErr', s).textContent = 'PIN incorrecto.'; $('#a_pin', s).value = ''; return; }
        state.admin = true; try { sessionStorage.setItem('masarte.admin', '1'); } catch (er) { /* ignorar */ }
        closeSheet(); finish(true);
      });
      setTimeout(() => $('#a_pin', s).focus(), 120);
    });
  }

  function tableFilter(id) { return '<label class="search sm">' + icon('search') + '<input type="search" data-mi="filter" data-target="' + id + '" placeholder="Filtrar…" autocomplete="off"></label>'; }

  function adminCarts() {
    const rows = state.carts.filter(c => (c.items || []).length).sort((a, b) => b.updatedAt - a.updatedAt);
    if (!rows.length) return '<div class="empty small">' + icon('cart', 'big') + '<p class="muted">No hay carritos activos.</p></div>';
    const pm = productsMap();
    return '<div class="atable">' + rows.map(c => {
      const promo = c.promoId ? promoById(c.promoId) : null, t = P.cartTotals(c.items, pm, promo && promo.active !== false ? promo : null), ri = resInfo(c.id, t);
      return '<div class="arow"><div class="arow-main"><b>' + esc(c.customerName) + '</b><span class="muted">' + plural(t.lines.length, 'línea', 'líneas') + ' · ' + plural(t.units, 'unidad', 'unidades') + ' · Última acción: ' + esc(c.updatedBy || '') + ' · ' + fmtDT(c.updatedAt) + '</span>' +
        '<span class="muted small">' + t.lines.map(l => esc(l.product ? l.product.name : '(eliminado)') + ' ×' + l.qty).join(' · ') + '</span></div>' +
        '<div class="arow-side"><b>' + money(t.total) + '</b>' + (ri.expired ? '<span class="st-pill bad">' + plural(ri.expired, 'reserva caducada', 'reservas caducadas') + '</span>' : '<span class="st-pill ok">Reservado · ' + minsLeft(ri.min) + ' min</span>') + '</div>' +
        '<div class="arow-act"><button class="btn soft" type="button" data-m="acartopen" data-id="' + esc(c.id) + '">Abrir</button><button class="btn danger-ghost" type="button" data-m="acartfree" data-id="' + esc(c.id) + '">Liberar</button></div></div>';
    }).join('') + '</div>';
  }

  function adminOrders() {
    const o = state.orders;
    if (!o.length) return '<div class="empty small">' + icon('ventas', 'big') + '<p class="muted">Todavía no hay compras finalizadas.</p></div>';
    const total = o.reduce((a, x) => a + x.total, 0), units = o.reduce((a, x) => a + (x.units || 0), 0);
    return '<p class="muted pad">' + plural(o.length, 'compra', 'compras') + ' · ' + plural(units, 'unidad', 'unidades') + ' · <b>' + money(total) + '</b> facturados' + (o.length >= 300 ? ' (últimas 300)' : '') + '</p>' +
      '<div class="atable">' + o.map(x => '<details class="ord"><summary><div class="arow-main"><b>' + esc(x.customerName) + '</b>' + (U.contactHTML(x.customerId) ? '<span class="muted contact">' + U.contactHTML(x.customerId) + '</span>' : '') + '<span class="muted">' + fmtDT(x.at) + ' · atendió ' + esc(x.user) + (x.promo ? ' · promo «' + esc(x.promo.name) + '»' : '') + '</span></div>' +
        '<div class="arow-side"><b>' + money(x.total) + '</b><span class="muted small">' + plural(x.units || 0, 'ud.', 'uds.') + (x.saving > 0 ? ' · ahorro ' + money(x.saving) : '') + '</span></div></summary>' +
        '<div class="ord-lines">' + (x.lines || []).map(l => '<div class="sum-l"><div><b>' + esc(l.name) + '</b><span class="muted">' + (l.variant ? esc(l.variant) + ' · ' : '') + 'Ref. ' + esc(l.code) + ' · ' + l.qty + ' × ' + money(l.unitFinal) +
          (l.discount ? ' · dto. ' + l.discount + '%' : '') + (l.promoPct ? ' · promo ' + l.promoPct + '%' : '') + ' <s>' + money(l.listPrice) + '</s></span></div><b>' + money(l.lineTotal) + '</b></div>').join('') + '</div></details>').join('') + '</div>';
  }

  function adminPromos() {
    const ps = state.promos;
    const cats = n => (n === 'all' || !n ? 'Todas las categorías' : 'Solo ' + n);
    let h = '<div class="panel"><div class="panel-head"><h3 class="serif">Promociones</h3><button class="btn primary" type="button" data-m="promoedit" data-id="">' + icon('plus') + 'Nueva promoción</button></div>' +
      '<p class="muted small">Una promoción <b>no se suma</b> a un descuento manual de la misma línea (son incompatibles) salvo que la marques como <b>acumulable</b>, que es la autorización expresa.</p>' +
      (ps.length ? ps.map(x => '<div class="li"><span class="dot ' + (x.active === false ? 'off' : 'ok') + '"></span><div class="li-main"><b>' + esc(x.name) + '</b><span class="muted">−' + x.percent + ' % · ' + esc(cats(x.scope)) + (x.minSubtotal ? ' · desde ' + money(x.minSubtotal) : '') + (x.stackable ? ' · acumulable' : ' · no acumulable') + (x.active === false ? ' · desactivada' : '') + '</span></div>' +
        '<button class="btn soft" type="button" data-m="promoedit" data-id="' + esc(x.id) + '">Editar</button></div>').join('') : '<p class="muted pad">Aún no hay promociones.</p>') + '</div>';
    h += '<div class="panel"><div class="panel-head"><h3 class="serif">Descuento por producto</h3>' + tableFilter('dtab') + '</div>' +
      '<p class="muted small">Es el descuento que aparece preseleccionado en la Tienda para ese producto. En cada compra se puede cambiar entre 0, 10, 20, 30, 40, 50 y 100 %.</p><div id="dtab">' +
      state.products.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')).map(p => '<div class="li" data-text="' + esc((p.name + ' ' + p.code + ' ' + (p.variant || '')).toLowerCase()) + '"><div class="li-main"><b>' + esc(p.name) + '</b><span class="muted">' + (p.variant ? esc(p.variant) + ' · ' : '') + 'Ref. ' + esc(p.code) + ' · ' + money(p.price) + '</span></div>' +
        '<select class="mini-sel" data-mc="pdisc" data-id="' + esc(p.id) + '">' + P.DISCOUNTS.map(d => '<option value="' + d + '"' + (d === (Number(p.discount) || 0) ? ' selected' : '') + '>' + pct(d) + '</option>').join('') + '</select></div>').join('') + '</div></div>';
    return h;
  }

  function adminRes() {
    const now = Date.now(), rows = [];
    state.products.forEach(p => Object.keys(p.reservations || {}).forEach(cid => { const r = p.reservations[cid]; rows.push({ p, cid, r, live: r.exp > now }); }));
    rows.sort((a, b) => b.live - a.live || a.r.exp - b.r.exp);
    if (!rows.length) return '<div class="empty small">' + icon('tag', 'big') + '<p class="muted">No hay reservas.</p></div>';
    const live = rows.filter(x => x.live);
    return '<p class="muted pad">' + plural(live.length, 'reserva vigente', 'reservas vigentes') + ' · ' + plural(live.reduce((a, x) => a + x.r.qty, 0), 'unidad retenida', 'unidades retenidas') + (rows.length > live.length ? ' · ' + (rows.length - live.length) + ' caducadas' : '') + '</p>' +
      '<div class="atable">' + rows.map(x => '<div class="arow"><div class="arow-main"><b>' + esc(x.p.name) + '</b><span class="muted">' + (x.p.variant ? esc(x.p.variant) + ' · ' : '') + 'Ref. ' + esc(x.p.code) + ' · Cuenta: <b>' + esc(x.r.customerName || '—') + '</b></span></div>' +
        '<div class="arow-side"><b>' + plural(x.r.qty, 'ud.', 'uds.') + '</b><span class="st-pill ' + (x.live ? 'ok' : 'bad') + '">' + (x.live ? 'Caduca ' + hhmm(x.r.exp) + ' · ' + minsLeft(x.r.exp) + ' min' : 'Caducada') + '</span></div>' +
        '<div class="arow-act"><button class="btn danger-ghost" type="button" data-m="ares" data-id="' + esc(x.p.id) + '" data-c="' + esc(x.cid) + '">Liberar</button></div></div>').join('') + '</div>';
  }

  function adminStock() {
    const now = Date.now();
    return '<div class="panel-head">' + tableFilter('stab') + '</div><div class="atable" id="stab">' +
      state.products.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')).map(p => {
        const rsv = P.reservedUnits(p, now), av = avail(p), st = (p.stock || 0) <= 0 ? ['bad', 'Agotado'] : av <= 0 ? ['low', 'Todo reservado'] : (p.stock <= (cfg.lowStock != null ? cfg.lowStock : 2) ? ['low', 'Últimas unidades'] : ['ok', 'Disponible']);
        return '<div class="arow" data-text="' + esc((p.name + ' ' + p.code + ' ' + (p.variant || '') + ' ' + p.category).toLowerCase()) + '"><div class="arow-main"><b>' + esc(p.name) + '</b><span class="muted">' + esc(p.category) + ' · ' + (p.variant ? esc(p.variant) + ' · ' : '') + 'Ref. ' + esc(p.code) + '</span></div>' +
          '<div class="stk"><span><em>Físico</em><b>' + (p.stock || 0) + '</b></span><span><em>Reservado</em><b>' + rsv + '</b></span><span><em>Disponible</em><b class="' + (av === 0 ? 'zero' : '') + '">' + av + '</b></span></div>' +
          '<div class="arow-side"><span class="st-pill ' + st[0] + '">' + st[1] + '</span></div>' +
          '<div class="arow-act"><button class="btn soft" type="button" data-m="aedit" data-id="' + esc(p.id) + '">Editar</button></div></div>';
      }).join('') + '</div>';
  }

  function renderAdmin() {
    const root = $('#view-admin');
    if (!$('#adminBody', root)) {
      root.innerHTML = '<div class="section-head"><div><h2 class="serif">Administración</h2><p class="muted">Carritos, compras, descuentos, reservas y stock</p></div><button class="btn ghost" type="button" data-m="alock">Bloquear</button></div>' +
        '<div class="seg" id="adminTabs"></div><div id="adminBody"></div>';
    }
    $('#adminTabs', root).innerHTML = ATABS.map(t => '<button type="button" class="chip' + (A.tab === t[0] ? ' on' : '') + '" data-m="atab" data-t="' + t[0] + '">' + t[1] +
      (t[0] === 'carts' ? ' <em>' + state.carts.filter(c => (c.items || []).length).length + '</em>' : '') + '</button>').join('');
    const body = $('#adminBody', root);
    // no repintar encima de un campo que se está editando
    const a = document.activeElement;
    if (a && body.contains(a) && /^(INPUT|SELECT)$/.test(a.tagName) && body.dataset.tab === A.tab) return;
    const keep = $('[data-mi="filter"]', body), kv = keep ? keep.value : '';
    body.dataset.tab = A.tab;
    body.innerHTML = ({ carts: adminCarts, orders: adminOrders, promos: adminPromos, res: adminRes, stock: adminStock }[A.tab])();
    const f = $('[data-mi="filter"]', body); if (f && kv) { f.value = kv; applyFilter(f); }
  }
  function applyFilter(input) {
    const q = input.value.trim().toLowerCase(), box = document.getElementById(input.dataset.target);
    if (box) $$('[data-text]', box).forEach(r => { r.hidden = !!q && !r.dataset.text.includes(q); });
  }

  function openPromoSheet(id) {
    const x = id ? promoById(id) : null;
    const s = openSheet(
      '<div class="sheet-head"><h3 class="serif">' + (x ? 'Editar promoción' : 'Nueva promoción') + '</h3><button class="icon-btn" data-close type="button" aria-label="Cerrar">' + icon('close') + '</button></div>' +
      '<form id="pf2" novalidate><label class="field"><span>Nombre *</span><input id="p_name" type="text" maxlength="60" value="' + esc(x ? x.name : '') + '" placeholder="Ej. Rebajas de otoño"></label>' +
      '<div class="row2"><label class="field"><span>Descuento (%) *</span><input id="p_pct" type="number" min="1" max="100" step="1" inputmode="numeric" value="' + esc(x ? x.percent : '') + '"></label>' +
      '<label class="field"><span>Se aplica a</span><select id="p_scope"><option value="all">Todas las categorías</option>' + CATS.map(c => '<option' + (x && x.scope === c.id ? ' selected' : '') + '>' + c.id + '</option>').join('') + '</select></label></div>' +
      '<label class="field"><span>Importe mínimo del carrito (€) <em>(opcional)</em></span><input id="p_min" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(x && x.minSubtotal ? x.minSubtotal : '') + '"></label>' +
      '<label class="check"><input id="p_stack" type="checkbox"' + (x && x.stackable ? ' checked' : '') + '><span><b>Acumulable con descuentos manuales</b><em>Autorización expresa: se suma al descuento de la línea. Si no, son incompatibles.</em></span></label>' +
      '<label class="check"><input id="p_act" type="checkbox"' + (!x || x.active !== false ? ' checked' : '') + '><span><b>Activa</b><em>Las promociones desactivadas no se pueden elegir en el carrito.</em></span></label>' +
      '<p class="form-error" id="pfErr2" role="alert"></p><div class="sheet-actions">' + (x ? '<button class="btn danger-ghost" type="button" id="p_del">Eliminar</button>' : '') + '<span class="spacer"></span><button class="btn ghost" data-close type="button">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>');
    s.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
    const del = $('#p_del', s);
    if (del) del.addEventListener('click', async () => {
      if (!(await confirmBox({ title: '¿Eliminar la promoción?', text: 'Los carritos que la usen dejarán de aplicarla. Las compras ya hechas no cambian.', ok: 'Eliminar', danger: true }))) return;
      try { await store.deletePromo(x.id); closeSheet(); toast('Promoción eliminada', { type: 'ok' }); } catch (e) { $('#pfErr2', s).textContent = errMsg(e); }
    });
    $('#pf2', s).addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await store.savePromo({ id: x ? x.id : '', name: $('#p_name', s).value, percent: $('#p_pct', s).value, scope: $('#p_scope', s).value, minSubtotal: $('#p_min', s).value, stackable: $('#p_stack', s).checked, active: $('#p_act', s).checked }, state.user);
        closeSheet(); toast('Promoción guardada', { type: 'ok' });
      } catch (err) { $('#pfErr2', s).textContent = errMsg(err); }
    });
    setTimeout(() => $('#p_name', s).focus(), 120);
  }

  /* =========================================================
     EVENTOS
     ========================================================= */
  const H = {
    newcust: () => openCustomerSheet(),
    custedit: el => openCustomerSheet(null, el.dataset.id),
    shopcat: el => { S.cat = el.dataset.c; state.animate = true; renderShop(); },
    togdisc: el => { const id = el.closest('.scard').dataset.id; S.openDisc.has(id) ? S.openDisc.delete(id) : S.openDisc.add(id); repaintCard(id); },
    disc: el => { const id = el.closest('.scard').dataset.id; S.disc[id] = Number(el.dataset.d); repaintCard(id); },
    sq: el => {
      const id = el.closest('.scard').dataset.id, p = byId(id); if (!p) return;
      const max = Math.max(1, P.available(p, Date.now(), state.customerId) - lineQty(id));
      S.qty[id] = Math.min(max, Math.max(1, qtyOf(p) + Number(el.dataset.s))); repaintCard(id);
    },
    add: el => addToCart(el.closest('.scard').dataset.id),
    lq: el => {
      const pid = el.closest('.cl').dataset.pid, nq = lineQty(pid) + Number(el.dataset.s);
      cartOp('l:' + pid, () => store.cartSetLine(state.customerId, pid, Math.max(0, nq), null, state.user));
    },
    rm: el => { const pid = el.closest('.cl').dataset.pid; cartOp('l:' + pid, () => store.cartSetLine(state.customerId, pid, 0, null, state.user), 'Artículo quitado; las unidades vuelven a estar disponibles'); },
    renew: () => cartOp('renew', () => store.cartRenew(state.customerId, state.user), 'Reservas renovadas'),
    clear: async () => {
      if (await confirmBox({ title: '¿Vaciar el carrito?', text: 'Se quitarán todos los artículos y las unidades reservadas volverán a estar disponibles.', ok: 'Vaciar carrito', danger: true }))
        cartOp('clear', () => store.cartClear(state.customerId, state.user), 'Carrito vaciado');
    },
    checkout: () => openCheckout(),
    atab: el => { A.tab = el.dataset.t; renderAdmin(); },
    alock: () => { state.admin = false; try { sessionStorage.removeItem('masarte.admin'); } catch (e) { /* ignorar */ } U.setView('inventory'); },
    acartopen: el => { selectCustomer(el.dataset.id); U.setView('cart'); },
    acartfree: async el => {
      const c = customerById(el.dataset.id);
      if (await confirmBox({ title: '¿Liberar este carrito?', text: 'Se vaciará el carrito de <b>' + esc(c ? c.name : '') + '</b> y sus unidades reservadas volverán al stock disponible.', ok: 'Liberar', danger: true }))
        cartOp('af:' + el.dataset.id, () => store.cartClear(el.dataset.id, state.user), 'Carrito liberado');
    },
    ares: async el => {
      if (await confirmBox({ title: '¿Liberar la reserva?', text: 'Se quitará este artículo del carrito del cliente y las unidades volverán a estar disponibles.', ok: 'Liberar', danger: true }))
        cartOp('ar:' + el.dataset.id + el.dataset.c, () => store.cartSetLine(el.dataset.c, el.dataset.id, 0, null, state.user), 'Reserva liberada');
    },
    aedit: el => U.openProductForm(byId(el.dataset.id)),
    promoedit: el => openPromoSheet(el.dataset.id)
  };
  document.addEventListener('click', e => { const el = e.target.closest('[data-m]'); if (el && H[el.dataset.m]) H[el.dataset.m](el, e); });

  const HC = {
    cust: el => selectCustomer(el.value),
    ldisc: el => { const pid = el.closest('.cl').dataset.pid; cartOp('l:' + pid, () => store.cartSetLine(state.customerId, pid, lineQty(pid), Number(el.value), state.user)); },
    promo: el => cartOp('promo', () => store.cartSetPromo(state.customerId, el.value || null, state.user)),
    pdisc: el => cartOp('pd:' + el.dataset.id, () => store.setProductDiscount(el.dataset.id, Number(el.value), state.user), 'Descuento del producto actualizado')
  };
  document.addEventListener('change', e => { const el = e.target.closest('[data-mc]'); if (el && HC[el.dataset.mc]) HC[el.dataset.mc](el); });
  document.addEventListener('input', e => { const el = e.target.closest('[data-mi="filter"]'); if (el) applyFilter(el); });

  U.views.shop = { render: renderShop };
  U.views.cart = { render: renderCart };
  U.views.admin = { render: renderAdmin, guard: guardAdmin };
})();
