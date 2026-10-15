/* ============================================================
   CAPA DE DATOS
   Dos implementaciones con la misma interfaz:
   - Firestore (base de datos compartida en tiempo real)
   - Local (localStorage, solo para probar sin configurar nada)

   Toda la lógica de carritos, reservas y compras vive en el bloque
   "NÚCLEO" (funciones puras). Cada implementación solo lee los
   documentos, llama al núcleo y escribe el resultado, dentro de una
   transacción en Firestore, para que dos cuentas nunca reserven
   las mismas unidades.
   ============================================================ */
(function () {
  'use strict';
  const cfg = window.MASARTE_CONFIG || {};
  const fb = cfg.firebase || {};
  const P = window.MasartePricing;
  const useFirebase = !!(fb.apiKey && fb.projectId && !/^TU_/.test(fb.apiKey) && !/^TU_/.test(fb.projectId));

  /* Movimiento (registro de auditoría) */
  const mv = (type, p, user, extra) => Object.assign({
    type, productId: p.id, productName: p.name || '', code: p.code || '', category: p.category || '',
    variant: p.variant || '', price: Number(p.price) || 0, qty: 1, user, at: Date.now(), undone: false
  }, extra || {});

  /* Última venta deshacible de un producto, y la anterior (para restaurar "última venta") */
  function saleChain(movements, productId) {
    const sales = movements
      .filter(m => m.productId === productId && m.type === 'sale' && !m.undone)
      .sort((a, b) => b.at - a.at);
    return { last: sales[0] || null, prev: sales[1] || null };
  }
  const lastSaleOf = m => (m ? Object.assign({ user: m.user, at: m.at, movId: m.id }, m.orderId ? { orderId: m.orderId } : {}) : null);

  function cleanFields(f) {
    return {
      name: String(f.name || '').trim(),
      code: String(f.code || '').trim(),
      category: f.category,
      variant: String(f.variant || '').trim(),
      price: Math.round((Number(f.price) || 0) * 100) / 100,
      stock: Math.max(0, Math.floor(Number(f.stock) || 0)),
      photo: f.photo || '',
      notes: String(f.notes || '').trim()
    };
  }
  function cleanPromo(f) {
    const percent = Math.floor(Number(f.percent));
    if (!String(f.name || '').trim()) throw new Error('La promoción necesita un nombre.');
    if (!(percent >= 1 && percent <= 100)) throw new Error('El porcentaje debe estar entre 1 y 100.');
    return {
      name: String(f.name).trim().slice(0, 60), percent,
      scope: f.scope || 'all',
      minSubtotal: Math.max(0, Number(f.minSubtotal) || 0),
      stackable: !!f.stackable,            // true = se autoriza sumarla a un descuento manual
      active: f.active !== false
    };
  }
  const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);

  /* =========================================================
     NÚCLEO: carritos, reservas y compra (funciones puras)
     Cada función devuelve las escrituras que hay que aplicar:
     { products: {id: campos}, carts: {id: doc}, movements: [{id,data}], orders: [{id,data}] }
     ========================================================= */
  // Reservas vigentes de un producto + la de esta cuenta (se purgan las caducadas de otras)
  function liveReservations(p, now, cartId) {
    const out = {}, res = (p && p.reservations) || {};
    Object.keys(res).forEach(cid => { if (cid !== cartId && res[cid].exp > now) out[cid] = res[cid]; });
    return out;
  }
  const baseCart = (c) => c.cart || { items: [], promoId: null };

  function cartDoc(c, items, extra) {
    return Object.assign({
      customerId: c.customer.id, customerName: c.customer.name, items,
      promoId: baseCart(c).promoId || null, status: 'active', updatedAt: c.now, updatedBy: c.user
    }, extra || {});
  }

  // Añadir, cambiar cantidad/descuento o quitar una línea (qty 0)
  function coreSetLine(c) {
    const qty = Math.floor(Number(c.qty));
    if (!(qty >= 0)) throw new Error('Cantidad no válida.');
    const cartId = c.customer.id, p = c.product;
    const items = baseCart(c).items.map(i => Object.assign({}, i));
    const idx = items.findIndex(i => i.productId === c.productId);
    const res = { products: {}, carts: {} };

    if (qty > 0) {
      if (!p) throw new Error('El producto ya no existe.');
      const d = c.discount != null ? Number(c.discount) : (idx >= 0 ? items[idx].discount : (Number(p.discount) || 0));
      if (!P.DISCOUNTS.includes(d)) throw new Error('Ese descuento no está permitido.');
      const av = P.available(p, c.now, cartId);
      if (qty > av) {
        throw new Error(av <= 0
          ? '«' + p.name + '» no tiene unidades disponibles' + ((p.stock || 0) > 0 ? ' (están reservadas en otros carritos).' : '.')
          : 'Solo quedan ' + plural(av, 'unidad disponible', 'unidades disponibles') + ' de «' + p.name + '».');
      }
      if (idx >= 0) { items[idx].qty = qty; items[idx].discount = d; }
      else items.push({ productId: c.productId, qty, discount: d, addedAt: c.now });
      const live = liveReservations(p, c.now, cartId);
      live[cartId] = { qty, exp: c.now + P.TTL_MS, customerName: c.customer.name, user: c.user, at: c.now };
      res.products[c.productId] = { reservations: live };
    } else {
      if (idx >= 0) items.splice(idx, 1);
      if (p) res.products[c.productId] = { reservations: liveReservations(p, c.now, cartId) };
    }
    res.carts[cartId] = cartDoc(c, items);
    return res;
  }

  // Renovar el plazo de todas las reservas del carrito (falla si alguna ya no está disponible)
  function coreRenew(c) {
    const cartId = c.customer.id, items = baseCart(c).items, res = { products: {}, carts: {} };
    items.forEach(it => {
      const p = c.products[it.productId];
      if (!p) throw new Error('Un producto del carrito ya no existe. Quítalo para continuar.');
      if (it.qty > P.available(p, c.now, cartId)) throw new Error('«' + p.name + '» ya no tiene ' + plural(it.qty, 'unidad', 'unidades') + ' disponibles. Ajusta la cantidad.');
      const live = liveReservations(p, c.now, cartId);
      live[cartId] = { qty: it.qty, exp: c.now + P.TTL_MS, customerName: c.customer.name, user: c.user, at: c.now };
      res.products[it.productId] = { reservations: live };
    });
    res.carts[cartId] = cartDoc(c, items.map(i => Object.assign({}, i)));
    return res;
  }

  // Vaciar el carrito y liberar todas sus reservas
  function coreClear(c) {
    const cartId = c.customer.id, res = { products: {}, carts: {} };
    baseCart(c).items.forEach(it => {
      const p = c.products[it.productId];
      if (p) res.products[it.productId] = { reservations: liveReservations(p, c.now, cartId) };
    });
    res.carts[cartId] = cartDoc(c, [], { promoId: null });
    return res;
  }

  function coreSetPromo(c) {
    if (c.promoId && (!c.promo || c.promo.active === false)) throw new Error('Esa promoción ya no está disponible.');
    return { products: {}, carts: { [c.customer.id]: cartDoc(c, baseCart(c).items.map(i => Object.assign({}, i)), { promoId: c.promoId || null }) } };
  }

  // Finalizar la compra: descuenta el stock definitivamente y registra pedido + movimientos
  function coreCheckout(c) {
    const cartId = c.customer.id, items = baseCart(c).items;
    if (!items.length) throw new Error('El carrito está vacío.');
    items.forEach(it => {
      const p = c.products[it.productId];
      if (!p) throw new Error('Un producto del carrito ya no existe. Quítalo para continuar.');
      const av = P.available(p, c.now, cartId);
      if (it.qty > av) throw new Error('«' + p.name + '»: ' + (av <= 0 ? 'ya no hay unidades disponibles.' : 'solo quedan ' + plural(av, 'unidad', 'unidades') + '.') + ' Ajusta el carrito.');
    });
    const promo = c.promo && c.promo.active !== false ? c.promo : null;
    const t = P.cartTotals(items, c.products, promo);
    const orderId = c.newId('orders'), res = { products: {}, carts: {}, movements: [], orders: [] };
    const lines = [];
    t.lines.forEach(l => {
      const p = l.product, movId = c.newId('movements'), stock = (p.stock || 0) - l.qty;
      const upd = {
        stock, reservations: liveReservations(p, c.now, cartId), updatedAt: c.now,
        lastSale: { user: c.user, at: c.now, movId, orderId }
      };
      if (stock === 0) upd.soldOutBy = { user: c.user, at: c.now };
      res.products[p.id] = upd;
      res.movements.push({
        id: movId,
        data: mv('sale', p, c.user, {
          at: c.now, qty: l.qty, price: l.unitFinal, listPrice: l.list, discount: l.discount, promoPct: l.promoPct,
          stockAfter: stock, orderId, customerId: c.customer.id, customerName: c.customer.name
        })
      });
      lines.push({
        productId: p.id, name: p.name, code: p.code || '', variant: p.variant || '', category: p.category || '',
        qty: l.qty, listPrice: l.list, discount: l.discount, promoPct: l.promoPct,
        unitFinal: l.unitFinal, lineTotal: l.lineTotal, movId
      });
    });
    res.orders.push({
      id: orderId,
      data: {
        customerId: c.customer.id, customerName: c.customer.name, user: c.user, at: c.now, status: 'completed',
        lines, units: t.units, subtotal: t.listSubtotal, saving: t.saving, total: t.total,
        promo: t.promoApplied && promo ? { id: promo.id, name: promo.name, percent: promo.percent, stackable: !!promo.stackable } : null
      }
    });
    res.carts[cartId] = cartDoc(c, [], { promoId: null, lastOrderId: orderId });
    res.orderId = orderId;
    return res;
  }

  // Venta rápida de 1 unidad (botón "Vender"): respeta las unidades reservadas
  function checkQuickSale(p, now) {
    if (!p) throw new Error('El producto ya no existe.');
    if ((p.stock || 0) <= 0) throw new Error('Producto agotado: alguien vendió la última unidad hace un momento.');
    if (P.available(p, now) <= 0) throw new Error('Las unidades que quedan están reservadas en carritos de clientes.');
  }

  /* ---------------------------------------------------------
     FIRESTORE
     --------------------------------------------------------- */
  function createFirestoreStore() {
    let db = null, listener = null, statusCb = null, failFn = null;
    let movLimit = 1500, unsubM = null, truncated = false;
    const data = { products: [], movements: [], customers: [], carts: [], orders: [], promos: [] };
    const ready = {};
    const KEYS = ['products', 'movements', 'customers', 'carts', 'orders', 'promos'];
    const emit = () => { if (listener && KEYS.every(k => ready[k])) listener(Object.assign({ truncated }, {
      products: data.products.slice(), movements: data.movements.slice(), customers: data.customers.slice(),
      carts: data.carts.slice(), orders: data.orders.slice(), promos: data.promos.slice()
    })); };
    const setStatus = s => statusCb && statusCb(s);
    const col = n => db.collection(n);
    const docs = snap => snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    const byId = (arr, id) => arr.find(x => x.id === id) || null;
    const newId = name => col(name).doc().id;

    function loadScript(src) {
      return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src; s.onload = res;
        s.onerror = () => rej(new Error('No se pudo cargar ' + src + ' (¿sin conexión?)'));
        document.head.appendChild(s);
      });
    }

    // Suscripción a los movimientos más recientes (el límite crece con "Cargar más")
    function subscribeMovements() {
      if (unsubM) unsubM();
      unsubM = col('movements').orderBy('at', 'desc').limit(movLimit).onSnapshot(snap => {
        data.movements = docs(snap);
        truncated = snap.size >= movLimit;
        ready.movements = true; emit();
      }, e => failFn(e, 'movements'));
    }
    function listen(name, query, onFirst) {
      query.onSnapshot(snap => {
        data[name] = docs(snap); ready[name] = true;
        if (onFirst) onFirst(snap);
        emit();
      }, e => failFn(e, name));
    }

    // Escribe dentro de una transacción lo que ha decidido el núcleo
    function applyWrites(tx, w) {
      Object.keys(w.products || {}).forEach(id => tx.update(col('products').doc(id), w.products[id]));
      Object.keys(w.carts || {}).forEach(id => tx.set(col('carts').doc(id), w.carts[id]));
      (w.movements || []).forEach(m => tx.set(col('movements').doc(m.id), m.data));
      (w.orders || []).forEach(o => tx.set(col('orders').doc(o.id), o.data));
    }
    // Lee el carrito y los productos implicados (todas las lecturas antes de escribir)
    async function readCart(tx, customerId, extraProductId) {
      const cs = await tx.get(col('carts').doc(customerId));
      const cart = cs.exists ? Object.assign({ id: customerId }, cs.data()) : null;
      const ids = new Set(((cart && cart.items) || []).map(i => i.productId));
      if (extraProductId) ids.add(extraProductId);
      const products = {};
      await Promise.all(Array.from(ids).map(async id => {
        const s = await tx.get(col('products').doc(id));
        if (s.exists) products[id] = Object.assign({ id }, s.data());
      }));
      const customer = byId(data.customers, customerId);
      if (!customer) throw new Error('La cuenta del cliente ya no existe.');
      return { cart, products, customer };
    }
    const cartOp = (customerId, productId, fn) => db.runTransaction(async tx => {
      const r = await readCart(tx, customerId, productId);
      const w = fn(r);
      applyWrites(tx, w);
      return w;
    });

    const api = {
      mode: 'firebase',
      loadMoreMovements() { if (!db) return; movLimit += 1500; subscribeMovements(); },
      onStatus(cb) { statusCb = cb; },
      onChange(cb) { listener = cb; },
      async init() {
        const v = '10.12.2';
        const base = 'https://www.gstatic.com/firebasejs/' + v + '/';
        await loadScript(base + 'firebase-app-compat.js');
        await Promise.all([loadScript(base + 'firebase-auth-compat.js'), loadScript(base + 'firebase-firestore-compat.js')]);
        firebase.initializeApp(fb);
        try { await firebase.auth().signInAnonymously(); }
        catch (e) { throw new Error('No se pudo iniciar sesión anónima en Firebase. Actívala en Authentication → Método de acceso → Anónimo. (' + e.code + ')'); }
        db = firebase.firestore();
        try { await db.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* no crítico */ }

        failFn = (e, name) => setStatus({ error: e.code === 'permission-denied'
          ? 'Firestore rechazó el acceso a «' + (name || '?') + '». Copia el contenido actual de firestore.rules en Firebase → Firestore → Reglas y pulsa Publicar (ver README).'
          : 'Error de base de datos: ' + (e.message || e) });

        listen('products', col('products'), snap => setStatus({ online: !snap.metadata.fromCache || navigator.onLine }));
        listen('customers', col('customers'));
        listen('carts', col('carts'));
        listen('orders', col('orders').orderBy('at', 'desc').limit(300));
        listen('promos', col('promos'));
        subscribeMovements();
      },

      /* ----- Inventario ----- */
      async addProduct(fields, user) {
        const f = cleanFields(fields), at = Date.now();
        const ref = col('products').doc();
        const p = Object.assign({ id: ref.id }, f);
        const batch = db.batch();
        batch.set(ref, Object.assign({}, f, { lastSale: null, soldOutBy: null, discount: 0, reservations: {}, createdAt: at, updatedAt: at, createdBy: user }));
        batch.set(col('movements').doc(), mv('create', p, user, { qty: f.stock, stockAfter: f.stock }));
        await batch.commit();
      },

      async updateProduct(id, fields, user, origStock) {
        const f = cleanFields(fields);
        await db.runTransaction(async tx => {
          const ref = col('products').doc(id);
          const s = await tx.get(ref);
          if (!s.exists) throw new Error('El producto ya no existe.');
          const cur = s.data(), at = Date.now();
          const upd = { name: f.name, code: f.code, category: f.category, variant: f.variant, price: f.price, photo: f.photo, notes: f.notes, updatedAt: at };
          const p = Object.assign({ id }, cur, upd);
          tx.set(col('movements').doc(), mv('edit', p, user, { qty: 0, stockAfter: cur.stock }));
          if (f.stock !== origStock) { // solo se toca el stock si el editor lo cambió (no pisa ventas simultáneas)
            upd.stock = f.stock;
            upd.soldOutBy = f.stock === 0 ? (cur.stock > 0 ? { user, at } : cur.soldOutBy || null) : null;
            tx.set(col('movements').doc(), mv('adjust', p, user, { qty: f.stock - cur.stock, stockAfter: f.stock }));
          }
          tx.update(ref, upd);
        });
      },

      async deleteProduct(id, user) {
        const p = byId(data.products, id);
        const batch = db.batch();
        batch.delete(col('products').doc(id));
        if (p) batch.set(col('movements').doc(), mv('delete', p, user, { qty: 0, stockAfter: p.stock }));
        await batch.commit();
      },

      async sell(id, user) {
        await db.runTransaction(async tx => {
          const ref = col('products').doc(id);
          const s = await tx.get(ref);
          const cur = s.exists ? s.data() : null, at = Date.now();
          checkQuickSale(cur, at);
          const stock = cur.stock - 1, mref = col('movements').doc();
          const upd = { stock, lastSale: { user, at, movId: mref.id }, updatedAt: at };
          if (stock === 0) upd.soldOutBy = { user, at };
          tx.update(ref, upd);
          tx.set(mref, mv('sale', Object.assign({ id }, cur), user, { at, stockAfter: stock }));
        });
      },

      async restock(id, qty, user) {
        qty = Math.floor(Number(qty));
        if (!(qty > 0)) throw new Error('Indica una cantidad mayor que 0.');
        await db.runTransaction(async tx => {
          const ref = col('products').doc(id);
          const s = await tx.get(ref);
          if (!s.exists) throw new Error('El producto ya no existe.');
          const cur = s.data(), stock = (cur.stock || 0) + qty, at = Date.now();
          tx.update(ref, { stock, soldOutBy: null, updatedAt: at });
          tx.set(col('movements').doc(), mv('restock', Object.assign({ id }, cur), user, { qty, at, stockAfter: stock }));
        });
      },

      async undoSale(id, user) {
        // Se consultan las ventas de ESTE producto en el servidor: no depende de la ventana de movimientos cargada
        const found = await col('movements').where('productId', '==', id).get();
        const { last, prev } = saleChain(found.docs.map(d => Object.assign({ id: d.id }, d.data())), id);
        if (!last) throw new Error('No hay ninguna venta que deshacer.');
        if (last.orderId) throw new Error('La última venta pertenece a una compra finalizada de un cliente y no se puede deshacer desde aquí.');
        await db.runTransaction(async tx => {
          const ref = col('products').doc(id), mref = col('movements').doc(last.id);
          const [s, m] = await Promise.all([tx.get(ref), tx.get(mref)]);
          if (!s.exists) throw new Error('El producto ya no existe.');
          if (!m.exists || m.data().undone) throw new Error('Esa venta ya estaba deshecha.');
          const cur = s.data(), stock = (cur.stock || 0) + 1, at = Date.now();
          tx.update(ref, { stock, lastSale: lastSaleOf(prev), soldOutBy: null, updatedAt: at });
          tx.update(mref, { undone: true, undoneBy: user, undoneAt: at });
          tx.set(col('movements').doc(), mv('undo', Object.assign({ id }, cur), user, { at, stockAfter: stock, ref: last.id }));
        });
      },

      async setProductDiscount(id, pct, user) {
        if (!P.DISCOUNTS.includes(Number(pct))) throw new Error('Ese descuento no está permitido.');
        await col('products').doc(id).update({ discount: Number(pct), updatedAt: Date.now() });
      },

      async seed(items, user) {
        const batch = db.batch();
        items.forEach(it => {
          const f = cleanFields(it), ref = col('products').doc(), at = Date.now();
          batch.set(ref, Object.assign({}, f, { lastSale: null, soldOutBy: null, discount: 0, reservations: {}, createdAt: at, updatedAt: at, createdBy: user }));
          batch.set(col('movements').doc(), mv('create', Object.assign({ id: ref.id }, f), user, { qty: f.stock, stockAfter: f.stock }));
        });
        await batch.commit();
      },

      /* ----- Clientes, carritos y compras ----- */
      async addCustomer(fields, user) {
        const name = String(fields.name || '').trim();
        if (name.length < 2) throw new Error('Escribe el nombre del cliente.');
        const ref = col('customers').doc();
        await ref.set({ name: name.slice(0, 60), phone: String(fields.phone || '').trim().slice(0, 30), email: String(fields.email || '').trim().slice(0, 80), createdAt: Date.now(), createdBy: user });
        return ref.id;
      },
      async updateCustomer(id, fields, user) {
        const name = String(fields.name || '').trim();
        if (name.length < 2) throw new Error('Escribe el nombre del cliente.');
        await col('customers').doc(id).update({ name: name.slice(0, 60), phone: String(fields.phone || '').trim().slice(0, 30), email: String(fields.email || '').trim().slice(0, 80), updatedAt: Date.now(), updatedBy: user });
      },
      cartSetLine(customerId, productId, qty, discount, user) {
        return cartOp(customerId, productId, r => coreSetLine({ now: Date.now(), user, customer: r.customer, cart: r.cart, product: r.products[productId] || null, productId, qty, discount }));
      },
      cartRenew(customerId, user) {
        return cartOp(customerId, null, r => coreRenew({ now: Date.now(), user, customer: r.customer, cart: r.cart, products: r.products }));
      },
      cartClear(customerId, user) {
        return cartOp(customerId, null, r => coreClear({ now: Date.now(), user, customer: r.customer, cart: r.cart, products: r.products }));
      },
      cartSetPromo(customerId, promoId, user) {
        return cartOp(customerId, null, r => coreSetPromo({ now: Date.now(), user, customer: r.customer, cart: r.cart, promoId, promo: byId(data.promos, promoId) }));
      },
      async checkout(customerId, user) {
        const w = await db.runTransaction(async tx => {
          const r = await readCart(tx, customerId, null);
          const promo = r.cart && r.cart.promoId ? byId(data.promos, r.cart.promoId) : null;
          const out = coreCheckout({ now: Date.now(), user, customer: r.customer, cart: r.cart, products: r.products, promo, newId });
          applyWrites(tx, out);
          return out;
        });
        return w.orderId;
      },

      /* ----- Promociones ----- */
      async savePromo(promo, user) {
        const f = cleanPromo(promo), ref = promo.id ? col('promos').doc(promo.id) : col('promos').doc();
        await ref.set(Object.assign(f, { updatedAt: Date.now(), updatedBy: user }), { merge: true });
      },
      async deletePromo(id) { await col('promos').doc(id).delete(); }
    };
    return api;
  }

  /* ---------------------------------------------------------
     LOCAL (localStorage + sincronización entre pestañas)
     --------------------------------------------------------- */
  function createLocalStore() {
    const KEY = 'masarte.db.v2';
    const EMPTY = () => ({ products: {}, movements: {}, customers: {}, carts: {}, orders: {}, promos: {} });
    let db = load(), listener = null, statusCb = null;
    const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    function load() {
      try { return Object.assign(EMPTY(), JSON.parse(localStorage.getItem(KEY)) || {}); }
      catch (e) { return EMPTY(); }
    }
    const list = k => Object.keys(db[k]).map(id => Object.assign({ id }, db[k][id]));
    function snapshot() {
      return {
        products: list('products'),
        movements: Object.values(db.movements).sort((a, b) => b.at - a.at),
        customers: list('customers'), carts: list('carts'),
        orders: list('orders').sort((a, b) => b.at - a.at), promos: list('promos'), truncated: false
      };
    }
    function emit() { if (listener) listener(snapshot()); }
    function save() {
      try { localStorage.setItem(KEY, JSON.stringify(db)); }
      catch (e) { db = load(); throw new Error('Almacenamiento local lleno. Usa fotos más pequeñas o conecta Firebase.'); }
      emit();
    }
    const addMv = (type, p, user, extra) => { const id = rid(); db.movements[id] = Object.assign({ id }, mv(type, p, user, extra)); return id; };
    const withId = (k, id) => (db[k][id] ? Object.assign({ id }, db[k][id]) : null);

    window.addEventListener('storage', e => { if (e.key === KEY) { db = load(); emit(); } });

    function applyWrites(w) {
      Object.keys(w.products || {}).forEach(id => { if (db.products[id]) Object.assign(db.products[id], w.products[id]); });
      Object.keys(w.carts || {}).forEach(id => { db.carts[id] = w.carts[id]; });
      (w.movements || []).forEach(m => { db.movements[m.id] = Object.assign({ id: m.id }, m.data); });
      (w.orders || []).forEach(o => { db.orders[o.id] = o.data; });
    }
    // Un movimiento deshecho solo se calcula con los datos del momento, y todo o nada
    function cartOp(customerId, productId, fn) {
      db = load(); // última versión (otra pestaña pudo cambiarla)
      const customer = withId('customers', customerId);
      if (!customer) throw new Error('La cuenta del cliente ya no existe.');
      const cart = withId('carts', customerId);
      const products = {};
      const ids = new Set(((cart && cart.items) || []).map(i => i.productId));
      if (productId) ids.add(productId);
      ids.forEach(id => { const p = withId('products', id); if (p) products[id] = JSON.parse(JSON.stringify(p)); });
      const w = fn({ customer, cart: cart ? JSON.parse(JSON.stringify(cart)) : null, products });
      applyWrites(w); save();
      return w;
    }

    return {
      mode: 'local',
      onStatus(cb) { statusCb = cb; },
      onChange(cb) { listener = cb; },
      async init() { statusCb && statusCb({ local: true }); setTimeout(emit, 0); },

      async addProduct(fields, user) {
        const f = cleanFields(fields), id = rid(), at = Date.now();
        db.products[id] = Object.assign({ id }, f, { lastSale: null, soldOutBy: null, discount: 0, reservations: {}, createdAt: at, updatedAt: at, createdBy: user });
        addMv('create', db.products[id], user, { qty: f.stock, stockAfter: f.stock });
        save();
      },
      async updateProduct(id, fields, user, origStock) {
        const f = cleanFields(fields), cur = db.products[id];
        if (!cur) throw new Error('El producto ya no existe.');
        const at = Date.now();
        Object.assign(cur, { name: f.name, code: f.code, category: f.category, variant: f.variant, price: f.price, photo: f.photo, notes: f.notes, updatedAt: at });
        addMv('edit', Object.assign({ id }, cur), user, { qty: 0, stockAfter: cur.stock });
        if (f.stock !== origStock) {
          const delta = f.stock - cur.stock;
          cur.soldOutBy = f.stock === 0 ? (cur.stock > 0 ? { user, at } : cur.soldOutBy || null) : null;
          cur.stock = f.stock;
          addMv('adjust', Object.assign({ id }, cur), user, { qty: delta, stockAfter: f.stock });
        }
        save();
      },
      async deleteProduct(id, user) {
        const p = db.products[id];
        if (p) { addMv('delete', Object.assign({ id }, p), user, { qty: 0, stockAfter: p.stock }); delete db.products[id]; save(); }
      },
      async sell(id, user) {
        db = load();
        const p = db.products[id], at = Date.now();
        checkQuickSale(p, at);
        p.stock -= 1; p.updatedAt = at;
        const mid = addMv('sale', Object.assign({ id }, p), user, { at, stockAfter: p.stock });
        p.lastSale = { user, at, movId: mid };
        if (p.stock === 0) p.soldOutBy = { user, at };
        save();
      },
      async restock(id, qty, user) {
        qty = Math.floor(Number(qty));
        if (!(qty > 0)) throw new Error('Indica una cantidad mayor que 0.');
        db = load();
        const p = db.products[id];
        if (!p) throw new Error('El producto ya no existe.');
        p.stock += qty; p.soldOutBy = null; p.updatedAt = Date.now();
        addMv('restock', Object.assign({ id }, p), user, { qty, stockAfter: p.stock });
        save();
      },
      async undoSale(id, user) {
        db = load();
        const p = db.products[id];
        if (!p) throw new Error('El producto ya no existe.');
        const { last, prev } = saleChain(Object.values(db.movements), id);
        if (!last) throw new Error('No hay ninguna venta que deshacer.');
        if (last.orderId) throw new Error('La última venta pertenece a una compra finalizada de un cliente y no se puede deshacer desde aquí.');
        db.movements[last.id].undone = true; db.movements[last.id].undoneBy = user; db.movements[last.id].undoneAt = Date.now();
        p.stock += 1; p.soldOutBy = null; p.updatedAt = Date.now();
        p.lastSale = lastSaleOf(prev);
        addMv('undo', Object.assign({ id }, p), user, { stockAfter: p.stock, ref: last.id });
        save();
      },
      async setProductDiscount(id, pct) {
        if (!P.DISCOUNTS.includes(Number(pct))) throw new Error('Ese descuento no está permitido.');
        db = load();
        if (!db.products[id]) throw new Error('El producto ya no existe.');
        db.products[id].discount = Number(pct); db.products[id].updatedAt = Date.now();
        save();
      },
      async seed(items, user) {
        items.forEach(it => {
          const f = cleanFields(it), id = rid(), at = Date.now();
          db.products[id] = Object.assign({ id }, f, { lastSale: null, soldOutBy: null, discount: 0, reservations: {}, createdAt: at, updatedAt: at, createdBy: user });
          addMv('create', db.products[id], user, { qty: f.stock, stockAfter: f.stock });
        });
        save();
      },

      async addCustomer(fields, user) {
        const name = String(fields.name || '').trim();
        if (name.length < 2) throw new Error('Escribe el nombre del cliente.');
        db = load();
        const id = rid();
        db.customers[id] = { name: name.slice(0, 60), phone: String(fields.phone || '').trim().slice(0, 30), email: String(fields.email || '').trim().slice(0, 80), createdAt: Date.now(), createdBy: user };
        save();
        return id;
      },
      async updateCustomer(id, fields, user) {
        const name = String(fields.name || '').trim();
        if (name.length < 2) throw new Error('Escribe el nombre del cliente.');
        db = load();
        if (!db.customers[id]) throw new Error('La cuenta del cliente ya no existe.');
        Object.assign(db.customers[id], { name: name.slice(0, 60), phone: String(fields.phone || '').trim().slice(0, 30), email: String(fields.email || '').trim().slice(0, 80), updatedAt: Date.now(), updatedBy: user });
        save();
      },
      async cartSetLine(customerId, productId, qty, discount, user) {
        cartOp(customerId, productId, r => coreSetLine({ now: Date.now(), user, customer: r.customer, cart: r.cart, product: r.products[productId] || null, productId, qty, discount }));
      },
      async cartRenew(customerId, user) {
        cartOp(customerId, null, r => coreRenew({ now: Date.now(), user, customer: r.customer, cart: r.cart, products: r.products }));
      },
      async cartClear(customerId, user) {
        cartOp(customerId, null, r => coreClear({ now: Date.now(), user, customer: r.customer, cart: r.cart, products: r.products }));
      },
      async cartSetPromo(customerId, promoId, user) {
        cartOp(customerId, null, r => coreSetPromo({ now: Date.now(), user, customer: r.customer, cart: r.cart, promoId, promo: withId('promos', promoId) }));
      },
      async checkout(customerId, user) {
        const w = cartOp(customerId, null, r => {
          const promo = r.cart && r.cart.promoId ? withId('promos', r.cart.promoId) : null;
          return coreCheckout({ now: Date.now(), user, customer: r.customer, cart: r.cart, products: r.products, promo, newId: () => rid() });
        });
        return w.orderId;
      },

      async savePromo(promo, user) {
        const f = cleanPromo(promo);
        db = load();
        const id = promo.id || rid();
        db.promos[id] = Object.assign(db.promos[id] || {}, f, { updatedAt: Date.now(), updatedBy: user });
        save();
      },
      async deletePromo(id) { db = load(); delete db.promos[id]; save(); }
    };
  }

  window.MasarteStore = useFirebase ? createFirestoreStore() : createLocalStore();
})();
