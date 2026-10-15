/* ============================================================
   CLIENTES · COMPRA
   - Lista de clientes: crear, editar, ver lo que compró cada uno (línea de tiempo).
   - "Comprar": catálogo con descuentos + carrito del cliente + finalizar compra.
   Se apoya en la API que expone app.js (window.MasarteUI).
   ============================================================ */
(function () {
  'use strict';
  const U = window.MasarteUI;
  const { state, store, cfg, P, $, $$, esc, money, icon, toast, errMsg, fmtDT, catKey, CATS, busy,
    openSheet, closeSheet, confirmBox, avail, customerById, cartOf, promoById, productsMap, byId, fmtDay, listJoin, ymd, countUp } = U;

  const pct = n => (n === 0 ? 'Sin descuento' : n === 100 ? '100 % · Gratis' : '−' + n + ' %');
  const hhmm = ms => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const minsLeft = ms => Math.max(0, Math.ceil((ms - Date.now()) / 60000));
  const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const photoOf = p => (p && p.photo ? '<img src="' + esc(p.photo) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async">'
    : '<div class="ph ph-' + catKey(p ? p.category : '') + '">' + icon(catKey(p ? p.category : '')) + '</div>');
  const buyer = () => customerById(state.buying);
  const lineQty = pid => { const c = cartOf(state.buying); const l = c && (c.items || []).find(i => i.productId === pid); return l ? l.qty : 0; };
  const cartCount = id => U.cartUnits(id);

  const C = { mode: '', q: '', open: new Set(), played: new Set(), shop: { cat: 'all', q: '', openDisc: new Set(), disc: {}, qty: {} } };

  /* =========================================================
     NUEVO CLIENTE / EDITAR CLIENTE
     ========================================================= */
  function openCustomerSheet(editId, after) {
    const ex = editId ? customerById(editId) : null;
    const s = openSheet(
      '<div class="sheet-head"><h3 class="serif">' + (ex ? 'Datos del cliente' : 'Nuevo cliente') + '</h3><button class="icon-btn" data-close type="button" aria-label="Cerrar">' + icon('close') + '</button></div>' +
      '<form id="cf" novalidate>' + (ex ? '<p class="muted small" style="margin:0 0 10px">Si te has equivocado, corrígelo aquí: el cambio se verá en todo el historial de este cliente.</p>' : '') +
      '<label class="field"><span>Nombre *</span><input id="c_name" type="text" maxlength="60" placeholder="Nombre y apellidos" value="' + esc(ex ? ex.name : '') + '" required autocomplete="off"></label>' +
      '<div class="row2"><label class="field"><span>Teléfono</span><input id="c_phone" type="tel" maxlength="30" inputmode="tel" value="' + esc(ex ? ex.phone : '') + '"></label>' +
      '<label class="field"><span>Correo electrónico</span><input id="c_mail" type="email" maxlength="80" inputmode="email" value="' + esc(ex ? ex.email : '') + '"></label></div>' +
      '<p class="form-error" id="cfErr" role="alert"></p>' +
      '<div class="sheet-actions"><button class="btn ghost" data-close type="button">Cancelar</button><button class="btn primary" type="submit">' + (ex ? 'Guardar cambios' : 'Crear cliente') + '</button></div></form>', 'sheet-sm');
    s.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
    $('#cf', s).addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('button[type=submit]', s); btn.disabled = true;
      try {
        const f = { name: $('#c_name', s).value, phone: $('#c_phone', s).value, email: $('#c_mail', s).value };
        if (ex) { await store.updateCustomer(ex.id, f, state.user); closeSheet(); toast('Datos guardados', { type: 'ok' }); U.renderAll(); return; }
        const id = await store.addCustomer(f, state.user);
        closeSheet(); toast('Cliente creado', { type: 'ok' });
        if (after) after(id); else { C.open.add(id); C.played.delete(id); U.renderAll(); }
      } catch (err) { $('#cfErr', s).textContent = errMsg(err); btn.disabled = false; }
    });
    setTimeout(() => $('#c_name', s).focus(), 120);
  }

  /* =========================================================
     LISTA DE CLIENTES
     ========================================================= */
  function itemHTML(l, i) {
    const pr = byId(l.productId), key = catKey(l.category || (pr && pr.category));
    const thumb = pr && pr.photo ? '<img src="' + esc(pr.photo) + '" alt="" loading="lazy" decoding="async">' : '<div class="ph ph-' + key + '">' + icon(key) + '</div>';
    const tags = (l.discount === 100 ? '<em class="tagd free">GRATIS</em>' : l.discount ? '<em class="tagd">−' + l.discount + ' %</em>' : '') + (l.promoPct ? '<em class="tagd promo">Promo −' + l.promoPct + ' %</em>' : '');
    return '<li class="it" style="--j:' + i + '"><div class="it-th">' + thumb + '<span class="it-q">×' + l.qty + '</span></div>' +
      '<div class="it-main"><b>' + esc(l.name) + '</b>' + (l.variant ? '<span class="muted">' + esc(l.variant) + '</span>' : '') +
      '<div class="it-price">' + l.qty + ' × ' + (l.unitFinal < l.listPrice ? '<s>' + money(l.listPrice) + '</s> ' : '') + '<b>' + money(l.unitFinal) + '</b>' + tags + '</div></div>' +
      '<div class="it-tot">' + money(l.lineTotal) + '</div></li>';
  }

  function dayHTML(d, di) {
    const dt = new Date(d.at), today = ymd(Date.now()), yest = ymd(Date.now() - 864e5);
    const rel = d.k === today ? 'Hoy' : d.k === yest ? 'Ayer' : '';
    const long = cap(dt.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    const all = d.orders.reduce((a, o) => a.concat(o.lines || []), []);
    const uds = all.reduce((a, l) => a + l.qty, 0), total = d.orders.reduce((a, o) => a + o.total, 0), saving = d.orders.reduce((a, o) => a + (o.saving || 0), 0);
    const promos = Array.from(new Set(d.orders.filter(o => o.promo).map(o => o.promo.name)));
    const sentence = 'El día ' + fmtDay(d.at) + ' compró ' + listJoin(all.map(l => l.name + (l.qty > 1 ? ' ×' + l.qty : '')));
    let n = 0;
    const blocks = d.orders.map(o => {
      const lines = (o.lines || []).map(l => itemHTML(l, n++)).join('');
      return '<div class="ob">' + (d.orders.length > 1 ? '<div class="ob-h"><span>' + icon('bag') + 'Compra de las ' + hhmm(o.at) + '</span><b>' + money(o.total) + '</b></div>' : '') + '<ul class="its">' + lines + '</ul></div>';
    }).join('');
    return '<li class="dy" style="--d:' + di + '"><div class="d-badge' + (rel === 'Hoy' ? ' today' : '') + '"><b>' + dt.getDate() + '</b><span>' + dt.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '') + '</span><em>' + dt.getFullYear() + '</em></div>' +
      '<div class="d-card"><div class="d-head"><div><b>' + (rel ? rel + ' · ' : '') + esc(long.split(',')[0]) + '</b><span class="muted">' + esc(long.replace(/^[^,]+, /, '')) + '</span></div>' +
        '<div class="d-total"><b>' + money(total) + '</b><span>' + uds + (uds === 1 ? ' artículo' : ' artículos') + '</span></div></div>' +
        '<span class="sr-only">' + esc(sentence) + '</span>' + blocks +
        (saving > 0 || promos.length ? '<div class="d-foot">' + (saving > 0 ? '<span class="save">Ahorro ' + money(saving) + '</span>' : '') + promos.map(x => '<span class="promo">Promoción «' + esc(x) + '»</span>').join('') + '</div>' : '') +
      '</div></li>';
  }

  function listShell(root) {
    root.innerHTML =
      '<div class="section-head"><div><h2 class="serif">Clientes</h2><p class="muted">Crea un cliente, empieza su compra y consulta lo que se llevó</p></div>' +
        '<button class="btn primary big" type="button" data-m="newcust">' + icon('plus') + 'Nuevo cliente</button></div>' +
      '<div class="toolbar"><label class="search">' + icon('search') + '<input id="custQ" type="search" placeholder="Buscar cliente…" autocomplete="off"></label></div>' +
      '<div class="result-line" id="custCount"></div><div id="custList"></div>';
    $('#custQ', root).addEventListener('input', debounce(e => { C.q = e.target.value; renderList(); }, 120));
    $('#custList', root).addEventListener('click', e => {
      const h = e.target.closest('.cc-head'); if (!h) return;
      const card = h.closest('.cc'), id = card.dataset.id, opening = !card.classList.contains('open');
      if (opening) {
        C.open.add(id); C.played.delete(id); card.classList.remove('played'); card.classList.add('open');
        $$('[data-count]', card).forEach(el => { el.dataset.v = 0; countUp(el, Number(el.dataset.count), el.dataset.money ? money : null); });
        setTimeout(() => { if (C.open.has(id)) { C.played.add(id); card.classList.add('played'); } }, 1800);
      } else { C.open.delete(id); card.classList.remove('open'); }
      h.setAttribute('aria-expanded', opening);
    });
  }

  function renderList() {
    const root = $('#view-customers');
    if (C.mode !== 'list') { listShell(root); C.mode = 'list'; }
    const by = {};
    state.orders.forEach(o => { (by[o.customerId] || (by[o.customerId] = [])).push(o); });
    const q = C.q.trim().toLowerCase();
    const act = c => Math.max(c.updatedAt || 0, c.createdAt || 0, (by[c.id] && by[c.id][0].at) || 0, (cartOf(c.id) && (cartOf(c.id).items || []).length ? cartOf(c.id).updatedAt || 0 : 0));
    const list = state.customers.filter(c => !q || ((c.name || '') + ' ' + (c.phone || '') + ' ' + (c.email || '')).toLowerCase().includes(q)).sort((a, b) => act(b) - act(a));
    const sum = id => (by[id] || []).reduce((a, o) => a + o.total, 0);
    const max = Math.max.apply(null, [1].concat(state.customers.map(c => sum(c.id))));
    $('#custCount', root).textContent = state.loaded ? (plural(list.length, 'cliente', 'clientes') + (state.orders.length >= 300 ? ' · compras: se muestran las últimas 300' : '')) : '';
    const box = $('#custList', root);
    if (!state.loaded) { box.innerHTML = '<div class="empty"><div class="spinner"></div><p>Cargando…</p></div>'; return; }
    if (!state.customers.length) { box.innerHTML = '<div class="empty">' + icon('users', 'big') + '<h3 class="serif">Todavía no hay clientes</h3><p class="muted">Pulsa <b>Nuevo cliente</b> para crear el primero y empezar su compra.</p><div class="empty-actions"><button class="btn primary big" type="button" data-m="newcust">' + icon('plus') + 'Nuevo cliente</button></div></div>'; return; }
    if (!list.length) { box.innerHTML = '<div class="empty small">' + icon('search', 'big') + '<p class="muted">Ningún cliente coincide con «' + esc(C.q) + '».</p></div>'; return; }
    const openCards = new Set($$('.cc.open', box).map(x => x.dataset.id));
    box.innerHTML = '<div class="cc-list">' + list.map((c, ci) => {
      const orders = by[c.id] || [], total = sum(c.id), uds = orders.reduce((a, o) => a + (o.units || 0), 0), cu = cartCount(c.id);
      const days = [];
      orders.forEach(o => { const k = ymd(o.at); let d = days.find(x => x.k === k); if (!d) { d = { k, at: o.at, orders: [] }; days.push(d); } d.orders.push(o); });
      const open = C.open.has(c.id) || openCards.has(c.id);
      return '<article class="cc' + (open ? ' open' : '') + (C.played.has(c.id) ? ' played' : '') + '" data-id="' + esc(c.id) + '" style="--ci:' + Math.min(ci, 8) + '">' +
        '<button type="button" class="cc-head" aria-expanded="' + open + '"><span class="avatar">' + esc((c.name || '?').charAt(0).toUpperCase()) + '</span>' +
          '<span class="cc-who"><b>' + esc(c.name) + '</b><span class="cs-contact">' + (U.contactHTML(c.id) || '<span class="muted">Sin teléfono ni correo</span>') + '</span>' +
            (cu ? '<span class="cc-open">' + icon('cart') + 'Compra sin terminar · ' + plural(cu, 'artículo', 'artículos') + '</span>' : '') + '</span>' +
          '<span class="cc-stats"><span><b data-count="' + total + '" data-money="1">' + money(total) + '</b><em>total</em></span><span><b data-count="' + orders.length + '">' + orders.length + '</b><em>' + (orders.length === 1 ? 'compra' : 'compras') + '</em></span><span><b data-count="' + uds + '">' + uds + '</b><em>' + (uds === 1 ? 'artículo' : 'artículos') + '</em></span></span>' +
          '<span class="cc-chev" aria-hidden="true"></span><span class="cc-bar" aria-hidden="true"><i style="width:' + (total ? Math.max(6, total / max * 100) : 0) + '%"></i></span></button>' +
        '<div class="cc-body"><div class="cc-inner">' +
          '<div class="cc-act"><button class="btn primary big" type="button" data-m="buy" data-id="' + esc(c.id) + '">' + icon('cart') + (cu ? 'Continuar la compra' : 'Comprar') + '</button>' +
            '<button class="btn soft" type="button" data-m="custedit" data-id="' + esc(c.id) + '">' + icon('edit') + 'Editar datos</button></div>' +
          (days.length ? '<h4 class="cc-h">Lo que ha comprado</h4><ol class="tl2">' + days.map(dayHTML).join('') + '</ol>' : '<p class="muted cc-none">Todavía no ha comprado nada. Pulsa <b>Comprar</b> para empezar.</p>') +
        '</div></div></article>';
    }).join('') + '</div>';
  }

  /* =========================================================
     COMPRA: CATÁLOGO
     ========================================================= */
  const discOf = p => (C.shop.disc[p.id] != null ? C.shop.disc[p.id] : (Number(p.discount) || 0));
  const qtyOf = p => Math.max(1, C.shop.qty[p.id] || 1);

  function shopCard(p, i, animate) {
    const S = C.shop, now = Date.now(), cid = state.buying;
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
        (inCart ? '<p class="incart">' + icon('cart') + plural(inCart, 'unidad', 'unidades') + ' en el carrito</p>' : '') +
        '<div class="add-row"><div class="qty"><button type="button" data-m="sq" data-s="-1" aria-label="Menos">−</button><span>' + q + '</span><button type="button" data-m="sq" data-s="1" aria-label="Más">+</button></div>' +
          '<button class="btn sell" type="button" data-m="add"' + (addable <= 0 ? ' disabled' : '') + '>' + icon('cart') + '<span>' + (addable <= 0 ? (out ? 'Agotado' : inCart ? 'Máximo en carrito' : 'Reservado') : 'Añadir al carrito') + '</span></button></div>' +
      '</div></article>';
  }

  function repaintCard(id) {
    const el = $('.scard[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]'), p = byId(id);
    if (el && p) { const tmp = document.createElement('div'); tmp.innerHTML = shopCard(p, 0, false); el.replaceWith(tmp.firstChild); }
  }

  /* =========================================================
     COMPRA: CARRITO
     ========================================================= */
  const manualSaving = t => P.r2(t.lines.reduce((a, l) => a + l.list * l.qty * l.discount / 100, 0));
  function totalsOf(cart) {
    const promo = cart && cart.promoId ? promoById(cart.promoId) : null;
    return { promo, t: P.cartTotals((cart && cart.items) || [], productsMap(), promo && promo.active !== false ? promo : null) };
  }
  function resInfo(cartId, t) {
    const now = Date.now(); let min = Infinity, expired = 0;
    t.lines.forEach(l => { const r = l.product && l.product.reservations && l.product.reservations[cartId]; if (!r || r.exp <= now) expired++; else min = Math.min(min, r.exp); });
    return { min: min === Infinity ? 0 : min, expired };
  }
  function promoNote(promo, t) {
    if (!promo) return '';
    if (t.promoApplied) return 'Promoción aplicada a ' + plural(t.lines.filter(l => l.promoPct > 0).length, 'línea', 'líneas') + '.';
    if (!P.promoMatches(promo, null, t.listSubtotal) && promo.minSubtotal > t.listSubtotal) return 'Faltan ' + money(promo.minSubtotal - t.listSubtotal) + ' para activar esta promoción.';
    if (t.lines.some(l => l.note)) return 'No se aplica: las líneas con descuento manual no admiten promoción (incompatibles).';
    return 'Ninguna línea del carrito cumple las condiciones de esta promoción.';
  }

  // Contenido del carrito (se usa en el panel lateral del ordenador y en la hoja del móvil)
  function cartInnerHTML() {
    const c = buyer(), cart = c ? cartOf(c.id) : null, items = (cart && cart.items) || [];
    if (!items.length) return '<div class="cart-empty">' + icon('cart', 'big') + '<b>El carrito está vacío</b><span class="muted">Elige productos del catálogo y pulsa «Añadir al carrito».</span></div>';
    const { promo, t } = totalsOf(cart), ri = resInfo(c.id, t);
    const promos = state.promos.filter(x => x.active !== false);
    return '<div class="res-bar ' + (ri.expired ? 'bad' : '') + '">' + icon('tag') +
        (ri.expired ? '<span><b>' + plural(ri.expired, 'reserva caducada', 'reservas caducadas') + '.</b> Pueden haberse liberado.</span>' : '<span>Reservado hasta las <b>' + hhmm(ri.min) + '</b> (' + minsLeft(ri.min) + ' min)</span>') +
        '<button class="btn soft" type="button" data-m="renew">Renovar</button></div>' +
      '<div class="cart-lines">' + t.lines.map(l => {
        const it = l.item, p = l.product, r = p && p.reservations && p.reservations[c.id], exp = !r || r.exp <= Date.now();
        if (!p) return '<div class="cl missing" data-pid="' + esc(it.productId) + '"><div class="cl-main"><b>Producto eliminado</b><span class="muted">No se puede comprar. Quítalo.</span></div><button class="btn danger-ghost" data-m="rm" type="button">Quitar</button></div>';
        return '<div class="cl" data-pid="' + esc(p.id) + '"><div class="cl-img">' + photoOf(p) + '</div>' +
          '<div class="cl-main"><b>' + esc(p.name) + '</b><span class="muted">' + (p.variant ? esc(p.variant) + ' · ' : '') + 'Ref. ' + esc(p.code) + '</span>' +
            '<div class="cl-price">' + (l.unitSaving > 0 ? '<s>' + money(l.list) + '</s>' : '') + '<b>' + money(l.unitFinal) + '</b><span class="muted"> / ud.</span>' +
              (l.discount ? '<em class="tagd">' + (l.discount === 100 ? 'GRATIS' : '−' + l.discount + '%') + '</em>' : '') + (l.promoPct ? '<em class="tagd promo">Promo −' + l.promoPct + '%</em>' : '') + '</div>' +
            (l.note ? '<span class="cl-note">' + esc(l.note) + '</span>' : '') + (exp ? '<span class="cl-note bad">Reserva caducada</span>' : '') +
            '<div class="cl-ctrl"><div class="qty"><button type="button" data-m="lq" data-s="-1" aria-label="Menos">−</button><span>' + it.qty + '</span><button type="button" data-m="lq" data-s="1" aria-label="Más">+</button></div>' +
            '<label class="dsel"><span>Descuento</span><select data-mc="ldisc">' + P.DISCOUNTS.map(d => '<option value="' + d + '"' + (d === l.discount ? ' selected' : '') + '>' + pct(d) + '</option>').join('') + '</select></label></div></div>' +
          '<div class="cl-total">' + (l.lineSaving > 0 ? '<s>' + money(l.lineList) + '</s>' : '') + '<b>' + money(l.lineTotal) + '</b>' +
            '<button class="icon-btn" type="button" data-m="rm" aria-label="Quitar del carrito">' + icon('close') + '</button></div></div>';
      }).join('') + '</div>' +
      '<div class="promo-box"><div class="promo-top"><span>Promoción</span><button class="linkbtn" type="button" data-m="promos">Gestionar</button></div>' +
        (promos.length ? '<label class="field sm"><select data-mc="promo"><option value="">Sin promoción</option>' + promos.map(x => '<option value="' + esc(x.id) + '"' + (x.id === cart.promoId ? ' selected' : '') + '>' + esc(x.name) + (x.stackable ? ' (acumulable)' : '') + '</option>').join('') + '</select></label>' +
          (promo ? '<p class="promo-note ' + (t.promoApplied ? 'ok' : '') + '">' + esc(promoNote(promo, t)) + '</p>' : '') : '<p class="muted small" style="margin:4px 0 0">No hay promociones activas.</p>') + '</div>' +
      '<dl class="totals"><div><dt>Precio original</dt><dd>' + money(t.listSubtotal) + '</dd></div>' +
        (manualSaving(t) > 0 ? '<div><dt>Descuentos</dt><dd class="neg">−' + money(manualSaving(t)) + '</dd></div>' : '') +
        (t.promoApplied ? '<div><dt>Promoción</dt><dd class="neg">−' + money(P.r2(t.saving - manualSaving(t))) + '</dd></div>' : '') +
        '<div class="grand"><dt>Total · ' + plural(t.units, 'unidad', 'unidades') + '</dt><dd>' + money(t.total) + '</dd></div></dl>' +
      '<button class="btn primary xl" type="button" data-m="checkout">Finalizar compra</button>' +
      '<button class="btn ghost" type="button" data-m="clear">Vaciar carrito</button>';
  }

  function paintCart() {
    const c = buyer(); if (!c) return;
    const panel = $('#cartPanel'), n = cartCount(c.id), { t } = totalsOf(cartOf(c.id));
    if (panel) panel.innerHTML = '<h3 class="serif">Carrito de ' + esc(c.name) + '</h3>' + cartInnerHTML();
    const bar = $('#cartBar');
    if (bar) { bar.hidden = !n; bar.innerHTML = '<span class="cb-l">' + icon('cart') + '<b>' + n + '</b> ' + (n === 1 ? 'artículo' : 'artículos') + '</span><b class="cb-t">' + money(t.total) + '</b><span class="cb-go">Ver carrito ›</span>'; }
    const sh = $('#cartSheetBody'); if (sh) sh.innerHTML = cartInnerHTML();
  }

  function openCartSheet() {
    const c = buyer(); if (!c) return;
    const s = openSheet('<div class="sheet-head"><h3 class="serif">Carrito de ' + esc(c.name) + '</h3><button class="icon-btn" data-close type="button" aria-label="Cerrar">' + icon('close') + '</button></div><div id="cartSheetBody">' + cartInnerHTML() + '</div>', 'sheet-lg');
    s.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
  }

  /* =========================================================
     COMPRA: PANTALLA
     ========================================================= */
  function buyShell(root) {
    const c = buyer();
    root.innerHTML =
      '<div class="buy-top"><button class="btn soft" type="button" data-m="buyback">' + icon('back') + 'Clientes</button>' +
        '<div class="buy-who"><span class="avatar">' + esc((c.name || '?').charAt(0).toUpperCase()) + '</span><div><h2 class="serif">Compra de ' + esc(c.name) + '</h2><span class="muted cs-contact">' + (U.contactHTML(c.id) || 'Sin teléfono ni correo') + '</span></div></div>' +
        '<button class="btn ghost" type="button" data-m="custedit" data-id="' + esc(c.id) + '">' + icon('edit') + 'Editar datos</button></div>' +
      '<ol class="steps"><li class="on"><b>1</b>Elige productos</li><li><b>2</b>Revisa el carrito</li><li><b>3</b>Finaliza la compra</li></ol>' +
      '<div class="buy-grid"><div class="buy-catalog">' +
        '<div class="toolbar"><label class="search">' + icon('search') + '<input id="shopQ" type="search" placeholder="Buscar producto por nombre o código…" autocomplete="off"></label></div>' +
        '<div class="chips shop-cats" id="shopCats"></div><div class="result-line" id="shopCount"></div><div class="grid" id="shopGrid"></div></div>' +
        '<aside class="buy-cart panel" id="cartPanel"></aside></div>' +
      '<button class="cart-bar" id="cartBar" type="button" data-m="opencart" hidden></button>';
    $('#shopQ', root).addEventListener('input', debounce(e => { C.shop.q = e.target.value; state.animate = true; renderBuyGrid(); }, 120));
  }

  function renderBuyGrid() {
    const S = C.shop, root = $('#view-customers');
    $('#shopCats', root).innerHTML = [{ id: 'all', label: 'Todas' }].concat(CATS.map(c => ({ id: c.id, label: c.id }))).map(c =>
      '<button type="button" class="chip' + (S.cat === c.id ? ' on' : '') + '" data-m="shopcat" data-c="' + esc(c.id) + '">' + esc(c.label) + '</button>').join('');
    const q = S.q.trim().toLowerCase();
    const list = state.products.filter(p => (S.cat === 'all' || p.category === S.cat) &&
      (!q || String(p.name).toLowerCase().includes(q) || String(p.code).toLowerCase().includes(q) || String(p.variant || '').toLowerCase().includes(q)))
      .sort((a, b) => (avail(b) > 0) - (avail(a) > 0) || String(a.name).localeCompare(String(b.name), 'es'));
    $('#shopCount', root).textContent = plural(list.length, 'producto', 'productos');
    const grid = $('#shopGrid', root);
    if (!state.loaded) { grid.innerHTML = '<div class="empty"><div class="spinner"></div><p>Cargando…</p></div>'; return; }
    if (!list.length) { grid.innerHTML = '<div class="empty"><h3 class="serif">Nada por aquí</h3><p class="muted">No hay productos con ese filtro.</p></div>'; return; }
    grid.innerHTML = list.map((p, i) => shopCard(p, i, state.animate)).join('');
    state.animate = false;
  }

  function renderBuy() {
    const root = $('#view-customers');
    if (!buyer()) { state.buying = ''; C.mode = ''; return render(); }
    if (C.mode !== 'buy:' + state.buying) { buyShell(root); C.mode = 'buy:' + state.buying; state.animate = true; }
    renderBuyGrid(); paintCart();
    $$('.steps li', root).forEach((li, i) => li.classList.toggle('on', i === (cartCount(state.buying) ? 1 : 0)));
  }

  function render() { if (state.buying) renderBuy(); else renderList(); }

  function startBuy(id) {
    state.buying = id; C.mode = ''; C.shop.q = ''; C.shop.cat = 'all';
    state.animate = true; U.renderAll(); window.scrollTo({ top: 0, behavior: U.reduceMotion ? 'auto' : 'smooth' });
  }
  function backToList(openId) {
    state.buying = ''; C.mode = '';
    if (openId) { C.open.add(openId); C.played.delete(openId); }
    U.renderAll(); window.scrollTo({ top: 0, behavior: U.reduceMotion ? 'auto' : 'smooth' });
  }

  async function addToCart(id) {
    const p = byId(id), key = 'c:' + id; if (!p || busy.has(key)) return;
    busy.add(key);
    try {
      const q = Math.min(qtyOf(p), Math.max(1, P.available(p, Date.now(), state.buying) - lineQty(id)));
      await store.cartSetLine(state.buying, id, lineQty(id) + q, discOf(p), state.user);
      C.shop.qty[id] = 1;
      toast('Añadido: ' + p.name + (q > 1 ? ' ×' + q : ''), { type: 'ok', ms: 2500 });
    } catch (e) { toast(errMsg(e), { type: 'err' }); } finally { busy.delete(key); }
  }

  async function cartOp(key, fn, okMsg) {
    if (busy.has(key)) return; busy.add(key);
    try { await fn(); if (okMsg) toast(okMsg, { type: 'ok' }); } catch (e) { toast(errMsg(e), { type: 'err' }); } finally { busy.delete(key); }
  }

  /* ---------- Finalizar compra ---------- */
  function openCheckout() {
    const c = buyer(), cart = c && cartOf(c.id); if (!cart || !(cart.items || []).length) return;
    const { promo, t } = totalsOf(cart);
    const s = openSheet(
      '<div class="sheet-head"><h3 class="serif">Resumen de la compra</h3><button class="icon-btn" data-close type="button" aria-label="Cerrar">' + icon('close') + '</button></div>' +
      '<p class="muted">Cliente: <b>' + esc(c.name) + '</b> · Atiende: <b>' + esc(state.user) + '</b></p>' +
      '<div class="sum">' + t.lines.map(l => '<div class="sum-l"><div><b>' + esc(l.product ? l.product.name : 'Producto eliminado') + '</b><span class="muted">' + l.qty + ' × ' + money(l.unitFinal) +
        (l.discount ? ' · dto. ' + l.discount + '%' : '') + (l.promoPct ? ' · promo ' + l.promoPct + '%' : '') + (l.unitSaving > 0 ? ' <s>' + money(l.list) + '</s>' : '') + '</span></div><b>' + money(l.lineTotal) + '</b></div>').join('') + '</div>' +
      '<dl class="totals"><div><dt>Precio original</dt><dd>' + money(t.listSubtotal) + '</dd></div><div><dt>Descuentos' + (t.promoApplied ? ' y promoción «' + esc(promo.name) + '»' : '') + '</dt><dd class="neg">−' + money(t.saving) + '</dd></div>' +
      '<div class="grand"><dt>Total a pagar</dt><dd>' + money(t.total) + '</dd></div></dl>' +
      '<p class="form-error" id="coErr" role="alert"></p>' +
      '<div class="sheet-actions"><button class="btn ghost" data-close type="button">Volver</button><button class="btn primary" id="coOk" type="button">Confirmar compra</button></div>');
    s.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
    $('#coOk', s).addEventListener('click', async () => {
      const btn = $('#coOk', s); btn.disabled = true; btn.textContent = 'Registrando…';
      try { const orderId = await store.checkout(c.id, state.user); showReceipt(c, t, orderId); }
      catch (e) { $('#coErr', s).textContent = errMsg(e); btn.disabled = false; btn.textContent = 'Confirmar compra'; }
    });
  }

  function showReceipt(c, t, orderId) {
    const s = openSheet(
      '<div class="done"><div class="done-ic"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><h3 class="serif">¡Compra registrada!</h3>' +
      '<p class="muted">Cliente <b>' + esc(c.name) + '</b> · ' + plural(t.units, 'artículo', 'artículos') + '</p><div class="done-total">' + money(t.total) + '</div>' +
      '<p class="muted small">Pedido ' + esc(String(orderId).slice(-6).toUpperCase()) + ' · el stock ya está descontado</p>' +
      '<div class="sheet-actions center"><button class="btn primary big" data-close type="button">Ver las compras de ' + esc(c.name.split(' ')[0]) + '</button></div></div>', 'sheet-sm');
    s.addEventListener('click', e => { if (e.target.closest('[data-close]')) { closeSheet(); backToList(c.id); } });
  }

  /* =========================================================
     PROMOCIONES (desde el carrito)
     ========================================================= */
  function openPromoManager() {
    const ps = state.promos, cats = n => (n === 'all' || !n ? 'Todas las categorías' : 'Solo ' + n);
    const s = openSheet(
      '<div class="sheet-head"><h3 class="serif">Promociones</h3><button class="icon-btn" data-close type="button" aria-label="Cerrar">' + icon('close') + '</button></div>' +
      '<p class="muted small" style="margin:0 0 8px">Una promoción <b>no se suma</b> a un descuento manual de la misma línea (son incompatibles), salvo que sea <b>acumulable</b>, que es la autorización expresa.</p>' +
      (ps.length ? ps.map(x => '<div class="li"><span class="dot ' + (x.active === false ? 'off' : 'ok') + '"></span><div class="li-main"><b>' + esc(x.name) + '</b><span class="muted">−' + x.percent + ' % · ' + esc(cats(x.scope)) + (x.minSubtotal ? ' · desde ' + money(x.minSubtotal) : '') + (x.stackable ? ' · acumulable' : ' · no acumulable') + (x.active === false ? ' · desactivada' : '') + '</span></div>' +
        '<button class="btn soft" type="button" data-pe="' + esc(x.id) + '">Editar</button></div>').join('') : '<p class="muted pad">Aún no hay promociones.</p>') +
      '<div class="sheet-actions"><button class="btn ghost" data-close type="button">Cerrar</button><button class="btn primary" type="button" data-pe="">' + icon('plus') + 'Nueva promoción</button></div>');
    s.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) return closeSheet();
      const b = e.target.closest('[data-pe]'); if (b) openPromoSheet(b.dataset.pe);
    });
  }

  function openPromoSheet(id) {
    const x = id ? promoById(id) : null;
    const s = openSheet(
      '<div class="sheet-head"><h3 class="serif">' + (x ? 'Editar promoción' : 'Nueva promoción') + '</h3><button class="icon-btn" data-close type="button" aria-label="Cerrar">' + icon('close') + '</button></div>' +
      '<form id="pf2" novalidate><label class="field"><span>Nombre *</span><input id="p_name" type="text" maxlength="60" value="' + esc(x ? x.name : '') + '" placeholder="Ej. Rebajas de otoño"></label>' +
      '<div class="row2"><label class="field"><span>Descuento (%) *</span><input id="p_pct" type="number" min="1" max="100" step="1" inputmode="numeric" value="' + esc(x ? x.percent : '') + '"></label>' +
      '<label class="field"><span>Se aplica a</span><select id="p_scope"><option value="all">Todas las categorías</option>' + CATS.map(c => '<option' + (x && x.scope === c.id ? ' selected' : '') + '>' + c.id + '</option>').join('') + '</select></label></div>' +
      '<label class="field"><span>Importe mínimo del carrito (€) <em>(opcional)</em></span><input id="p_min" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(x && x.minSubtotal ? x.minSubtotal : '') + '"></label>' +
      '<label class="check"><input id="p_stack" type="checkbox"' + (x && x.stackable ? ' checked' : '') + '><span><b>Acumulable con descuentos manuales</b><em>Se suma al descuento de la línea. Si no, son incompatibles.</em></span></label>' +
      '<label class="check"><input id="p_act" type="checkbox"' + (!x || x.active !== false ? ' checked' : '') + '><span><b>Activa</b><em>Las desactivadas no se pueden elegir en el carrito.</em></span></label>' +
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
    newcust: () => openCustomerSheet(null),
    custedit: el => openCustomerSheet(el.dataset.id),
    buy: el => startBuy(el.dataset.id),
    buyback: () => backToList(state.buying),
    opencart: () => openCartSheet(),
    promos: () => openPromoManager(),
    shopcat: el => { C.shop.cat = el.dataset.c; state.animate = true; renderBuyGrid(); },
    togdisc: el => { const id = el.closest('.scard').dataset.id, S = C.shop; S.openDisc.has(id) ? S.openDisc.delete(id) : S.openDisc.add(id); repaintCard(id); },
    disc: el => { const id = el.closest('.scard').dataset.id; C.shop.disc[id] = Number(el.dataset.d); repaintCard(id); },
    sq: el => {
      const id = el.closest('.scard').dataset.id, p = byId(id); if (!p) return;
      const max = Math.max(1, P.available(p, Date.now(), state.buying) - lineQty(id));
      C.shop.qty[id] = Math.min(max, Math.max(1, qtyOf(p) + Number(el.dataset.s))); repaintCard(id);
    },
    add: el => addToCart(el.closest('.scard').dataset.id),
    lq: el => { const pid = el.closest('.cl').dataset.pid, nq = lineQty(pid) + Number(el.dataset.s); cartOp('l:' + pid, () => store.cartSetLine(state.buying, pid, Math.max(0, nq), null, state.user)); },
    rm: el => { const pid = el.closest('.cl').dataset.pid; cartOp('l:' + pid, () => store.cartSetLine(state.buying, pid, 0, null, state.user), 'Artículo quitado'); },
    renew: () => cartOp('renew', () => store.cartRenew(state.buying, state.user), 'Reservas renovadas'),
    clear: async () => {
      if (await confirmBox({ title: '¿Vaciar el carrito?', text: 'Se quitarán todos los artículos y las unidades reservadas volverán a estar disponibles.', ok: 'Vaciar carrito', danger: true }))
        cartOp('clear', () => store.cartClear(state.buying, state.user), 'Carrito vaciado');
    },
    checkout: () => { closeSheetIfCart(); openCheckout(); }
  };
  const closeSheetIfCart = () => { if ($('#cartSheetBody')) closeSheet(); };
  document.addEventListener('click', e => { const el = e.target.closest('[data-m]'); if (el && H[el.dataset.m]) H[el.dataset.m](el, e); });

  const HC = {
    ldisc: el => { const pid = el.closest('.cl').dataset.pid; cartOp('l:' + pid, () => store.cartSetLine(state.buying, pid, lineQty(pid), Number(el.value), state.user)); },
    promo: el => cartOp('promo', () => store.cartSetPromo(state.buying, el.value || null, state.user))
  };
  document.addEventListener('change', e => { const el = e.target.closest('[data-mc]'); if (el && HC[el.dataset.mc]) HC[el.dataset.mc](el); });

  U.views.customers = { render };
})();
