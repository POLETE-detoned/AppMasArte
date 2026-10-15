/* ============================================================
   CAPA DE DATOS
   Dos implementaciones con la misma interfaz:
   - Firestore (base de datos compartida en tiempo real)
   - Local (localStorage, solo para probar sin configurar nada)
   ============================================================ */
(function () {
  'use strict';
  const cfg = window.MASARTE_CONFIG || {};
  const fb = cfg.firebase || {};
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
  const lastSaleOf = m => (m ? { user: m.user, at: m.at, movId: m.id } : null);

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

  /* ---------------------------------------------------------
     FIRESTORE
     --------------------------------------------------------- */
  function createFirestoreStore() {
    let db = null, products = [], movements = [], listener = null;
    let gotP = false, gotM = false, statusCb = null;
    const emit = () => { if (gotP && gotM && listener) listener({ products: products.slice(), movements: movements.slice() }); };
    const setStatus = s => statusCb && statusCb(s);

    function loadScript(src) {
      return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src; s.onload = res;
        s.onerror = () => rej(new Error('No se pudo cargar ' + src + ' (¿sin conexión?)'));
        document.head.appendChild(s);
      });
    }

    const api = {
      mode: 'firebase',
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

        const fail = e => setStatus({ error: e.code === 'permission-denied'
          ? 'Firestore rechazó el acceso. Revisa las reglas de seguridad (ver README).'
          : 'Error de base de datos: ' + (e.message || e) });

        db.collection('products').onSnapshot(snap => {
          products = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
          gotP = true; setStatus({ online: !snap.metadata.fromCache || navigator.onLine }); emit();
        }, fail);
        db.collection('movements').orderBy('at', 'desc').limit(1500).onSnapshot(snap => {
          movements = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
          gotM = true; emit();
        }, fail);
      },

      async addProduct(fields, user) {
        const f = cleanFields(fields), at = Date.now();
        const ref = db.collection('products').doc();
        const p = Object.assign({ id: ref.id }, f);
        const batch = db.batch();
        batch.set(ref, Object.assign({}, f, { lastSale: null, soldOutBy: null, createdAt: at, updatedAt: at, createdBy: user }));
        batch.set(db.collection('movements').doc(), mv('create', p, user, { qty: f.stock, stockAfter: f.stock }));
        await batch.commit();
      },

      async updateProduct(id, fields, user, origStock) {
        const f = cleanFields(fields);
        await db.runTransaction(async tx => {
          const ref = db.collection('products').doc(id);
          const s = await tx.get(ref);
          if (!s.exists) throw new Error('El producto ya no existe.');
          const cur = s.data(), at = Date.now();
          const upd = { name: f.name, code: f.code, category: f.category, variant: f.variant, price: f.price, photo: f.photo, notes: f.notes, updatedAt: at };
          const p = Object.assign({ id }, cur, upd);
          tx.set(db.collection('movements').doc(), mv('edit', p, user, { qty: 0, stockAfter: cur.stock }));
          if (f.stock !== origStock) { // solo se toca el stock si el editor lo cambió (no pisa ventas simultáneas)
            upd.stock = f.stock;
            upd.soldOutBy = f.stock === 0 ? (cur.stock > 0 ? { user, at } : cur.soldOutBy || null) : null;
            tx.set(db.collection('movements').doc(), mv('adjust', p, user, { qty: f.stock - cur.stock, stockAfter: f.stock }));
          }
          tx.update(ref, upd);
        });
      },

      async deleteProduct(id, user) {
        const p = products.find(x => x.id === id);
        const batch = db.batch();
        batch.delete(db.collection('products').doc(id));
        if (p) batch.set(db.collection('movements').doc(), mv('delete', p, user, { qty: 0, stockAfter: p.stock }));
        await batch.commit();
      },

      async sell(id, user) {
        await db.runTransaction(async tx => {
          const ref = db.collection('products').doc(id);
          const s = await tx.get(ref);
          if (!s.exists) throw new Error('El producto ya no existe.');
          const cur = s.data();
          if ((cur.stock || 0) <= 0) throw new Error('Producto agotado: alguien vendió la última unidad hace un momento.');
          const stock = cur.stock - 1, at = Date.now(), mref = db.collection('movements').doc();
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
          const ref = db.collection('products').doc(id);
          const s = await tx.get(ref);
          if (!s.exists) throw new Error('El producto ya no existe.');
          const cur = s.data(), stock = (cur.stock || 0) + qty, at = Date.now();
          tx.update(ref, { stock, soldOutBy: null, updatedAt: at });
          tx.set(db.collection('movements').doc(), mv('restock', Object.assign({ id }, cur), user, { qty, at, stockAfter: stock }));
        });
      },

      async undoSale(id, user) {
        const { last, prev } = saleChain(movements, id);
        if (!last) throw new Error('No hay ninguna venta que deshacer.');
        await db.runTransaction(async tx => {
          const ref = db.collection('products').doc(id), mref = db.collection('movements').doc(last.id);
          const [s, m] = await Promise.all([tx.get(ref), tx.get(mref)]);
          if (!s.exists) throw new Error('El producto ya no existe.');
          if (!m.exists || m.data().undone) throw new Error('Esa venta ya estaba deshecha.');
          const cur = s.data(), stock = (cur.stock || 0) + 1, at = Date.now();
          tx.update(ref, { stock, lastSale: lastSaleOf(prev), soldOutBy: null, updatedAt: at });
          tx.update(mref, { undone: true, undoneBy: user, undoneAt: at });
          tx.set(db.collection('movements').doc(), mv('undo', Object.assign({ id }, cur), user, { at, stockAfter: stock, ref: last.id }));
        });
      },

      async seed(items, user) {
        const batch = db.batch();
        items.forEach(it => {
          const f = cleanFields(it), ref = db.collection('products').doc(), at = Date.now();
          batch.set(ref, Object.assign({}, f, { lastSale: null, soldOutBy: null, createdAt: at, updatedAt: at, createdBy: user }));
          batch.set(db.collection('movements').doc(), mv('create', Object.assign({ id: ref.id }, f), user, { qty: f.stock, stockAfter: f.stock }));
        });
        await batch.commit();
      }
    };
    return api;
  }

  /* ---------------------------------------------------------
     LOCAL (localStorage + sincronización entre pestañas)
     --------------------------------------------------------- */
  function createLocalStore() {
    const KEY = 'masarte.db.v1';
    let db = load(), listener = null, statusCb = null;
    const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    function load() {
      try { return JSON.parse(localStorage.getItem(KEY)) || { products: {}, movements: {} }; }
      catch (e) { return { products: {}, movements: {} }; }
    }
    function snapshot() {
      return {
        products: Object.values(db.products),
        movements: Object.values(db.movements).sort((a, b) => b.at - a.at)
      };
    }
    function emit() { if (listener) listener(snapshot()); }
    function save() {
      try { localStorage.setItem(KEY, JSON.stringify(db)); }
      catch (e) { db = load(); throw new Error('Almacenamiento local lleno. Usa fotos más pequeñas o conecta Firebase.'); }
      emit();
    }
    const addMv = (type, p, user, extra) => { const id = rid(); db.movements[id] = Object.assign({ id }, mv(type, p, user, extra)); return id; };

    window.addEventListener('storage', e => { if (e.key === KEY) { db = load(); emit(); } });

    return {
      mode: 'local',
      onStatus(cb) { statusCb = cb; },
      onChange(cb) { listener = cb; },
      async init() { statusCb && statusCb({ local: true }); setTimeout(emit, 0); },

      async addProduct(fields, user) {
        const f = cleanFields(fields), id = rid(), at = Date.now();
        db.products[id] = Object.assign({ id }, f, { lastSale: null, soldOutBy: null, createdAt: at, updatedAt: at, createdBy: user });
        addMv('create', db.products[id], user, { qty: f.stock, stockAfter: f.stock });
        save();
      },
      async updateProduct(id, fields, user, origStock) {
        const f = cleanFields(fields), cur = db.products[id];
        if (!cur) throw new Error('El producto ya no existe.');
        const at = Date.now();
        Object.assign(cur, { name: f.name, code: f.code, category: f.category, variant: f.variant, price: f.price, photo: f.photo, notes: f.notes, updatedAt: at });
        addMv('edit', cur, user, { qty: 0, stockAfter: cur.stock });
        if (f.stock !== origStock) {
          const delta = f.stock - cur.stock;
          cur.soldOutBy = f.stock === 0 ? (cur.stock > 0 ? { user, at } : cur.soldOutBy || null) : null;
          cur.stock = f.stock;
          addMv('adjust', cur, user, { qty: delta, stockAfter: f.stock });
        }
        save();
      },
      async deleteProduct(id, user) {
        const p = db.products[id];
        if (p) { addMv('delete', p, user, { qty: 0, stockAfter: p.stock }); delete db.products[id]; save(); }
      },
      async sell(id, user) {
        const p = db.products[id];
        if (!p) throw new Error('El producto ya no existe.');
        if ((p.stock || 0) <= 0) throw new Error('Producto agotado.');
        const at = Date.now();
        p.stock -= 1; p.updatedAt = at;
        const mid = addMv('sale', p, user, { at, stockAfter: p.stock });
        p.lastSale = { user, at, movId: mid };
        if (p.stock === 0) p.soldOutBy = { user, at };
        save();
      },
      async restock(id, qty, user) {
        qty = Math.floor(Number(qty));
        if (!(qty > 0)) throw new Error('Indica una cantidad mayor que 0.');
        const p = db.products[id];
        if (!p) throw new Error('El producto ya no existe.');
        p.stock += qty; p.soldOutBy = null; p.updatedAt = Date.now();
        addMv('restock', p, user, { qty, stockAfter: p.stock });
        save();
      },
      async undoSale(id, user) {
        const p = db.products[id];
        if (!p) throw new Error('El producto ya no existe.');
        const { last, prev } = saleChain(Object.values(db.movements), id);
        if (!last) throw new Error('No hay ninguna venta que deshacer.');
        db.movements[last.id].undone = true; db.movements[last.id].undoneBy = user; db.movements[last.id].undoneAt = Date.now();
        p.stock += 1; p.soldOutBy = null; p.updatedAt = Date.now();
        p.lastSale = lastSaleOf(prev);
        addMv('undo', p, user, { stockAfter: p.stock, ref: last.id });
        save();
      },
      async seed(items, user) {
        items.forEach(it => {
          const f = cleanFields(it), id = rid(), at = Date.now();
          db.products[id] = Object.assign({ id }, f, { lastSale: null, soldOutBy: null, createdAt: at, updatedAt: at, createdBy: user });
          addMv('create', db.products[id], user, { qty: f.stock, stockAfter: f.stock });
        });
        save();
      }
    };
  }

  window.MasarteStore = useFirebase ? createFirestoreStore() : createLocalStore();
})();
