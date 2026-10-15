/* ============================================================
   ESTILISMOS · solicitudes de estilismo de clientes
   - Datos: colección "styling_requests" de Firestore (o localStorage en modo local de prueba).
   - Cualquier visitante puede ENVIAR una solicitud; solo los administradores
     (cuenta de correo y contraseña de la lista de las reglas) pueden LEERLAS,
     editarlas o borrarlas. Eso lo garantizan las reglas de Firestore, no esta página.
   - Lo usan la pestaña "Estilismos" de la app y la página pública estilismos.html.
   ============================================================ */
(function () {
  'use strict';
  const cfg = window.MASARTE_CONFIG || {};
  const fb = cfg.firebase || {};
  const priv = cfg.privacy || {};
  const useFirebase = !!(fb.apiKey && fb.projectId && !/^TU_/.test(fb.apiKey) && !/^TU_/.test(fb.projectId));
  const COL = 'styling_requests', LSKEY = 'masarte.styling.v1';

  const STATUS = {
    pending: { label: 'Pendiente', cls: 'low' },
    in_progress: { label: 'En proceso', cls: 'info' },
    done: { label: 'Finalizada', cls: 'ok' }
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Validación (las reglas de Firestore aplican los mismos límites) ---------- */
  const LIMITS = { name: [2, 120], email: [5, 120], phone: [6, 30], description: [10, 3000] };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const PHONE_RE = /^[+()\d][\d\s().\-]{5,29}$/;

  function clean(d) {
    return {
      name: String(d.name || '').replace(/\s+/g, ' ').trim(),
      email: String(d.email || '').trim().toLowerCase(),
      phone: String(d.phone || '').replace(/\s+/g, ' ').trim(),
      description: String(d.description || '').replace(/\r\n/g, '\n').trim()
    };
  }
  function validate(d, only) {
    const e = {}, has = k => !only || only.indexOf(k) >= 0;
    const len = (k, label) => { if (has(k) && (d[k].length < LIMITS[k][0] || d[k].length > LIMITS[k][1])) e[k] = label; };
    if (has('name')) { len('name', 'Escribe tu nombre y apellidos.'); if (!e.name && d.name.indexOf(' ') < 0) e.name = 'Indica nombre y apellidos.'; }
    if (has('email') && !EMAIL_RE.test(d.email)) e.email = 'Escribe un correo electrónico válido.'; else len('email', 'El correo es demasiado largo.');
    if (has('phone') && !PHONE_RE.test(d.phone)) e.phone = 'Escribe un teléfono válido (solo números, espacios y +).';
    if (has('description')) len('description', d.description.length < LIMITS.description[0] ? 'Cuéntanos un poco más (mínimo 10 caracteres).' : 'Es demasiado largo (máximo 3000 caracteres).');
    return e;
  }

  /* ---------- Firebase (se reutiliza el de la app o se carga en la página pública) ---------- */
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.'));
      document.head.appendChild(s);
    });
  }
  let dbPromise = null;
  function ensure() {
    if (dbPromise) return dbPromise;
    dbPromise = (async () => {
      if (window.MasarteStore && window.MasarteStore.ready) await window.MasarteStore.ready;
      else {
        const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
        if (!window.firebase) await loadScript(base + 'firebase-app-compat.js');
        if (!firebase.auth) await loadScript(base + 'firebase-auth-compat.js');
        if (!firebase.firestore) await loadScript(base + 'firebase-firestore-compat.js');
        if (!firebase.apps.length) firebase.initializeApp(fb);
      }
      const auth = firebase.auth();
      const cur = await new Promise(res => { const un = auth.onAuthStateChanged(u => { un(); res(u); }); });
      if (!cur) await auth.signInAnonymously();
      return firebase.firestore();
    })();
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }
  const toMs = v => (v && typeof v.toMillis === 'function' ? v.toMillis() : (typeof v === 'number' ? v : 0));
  const norm = (id, d) => Object.assign({}, d, { id, createdAt: toMs(d.createdAt) || Date.now(), consentAt: toMs(d.consentAt), updatedAt: toMs(d.updatedAt), history: d.history || [] });
  const authMsg = code => ({
    'auth/invalid-credential': 'Correo o contraseña incorrectos.', 'auth/wrong-password': 'Correo o contraseña incorrectos.',
    'auth/user-not-found': 'Correo o contraseña incorrectos.', 'auth/invalid-email': 'El correo no es válido.',
    'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.', 'auth/network-request-failed': 'Sin conexión. Inténtalo de nuevo.',
    'auth/operation-not-allowed': 'El acceso con correo y contraseña no está activado en Firebase (Authentication → Método de acceso).'
  }[code] || 'No se pudo iniciar sesión (' + code + ').');

  /* ---------- Almacén local (solo modo de prueba sin Firebase) ---------- */
  const lsLoad = () => { try { return JSON.parse(localStorage.getItem(LSKEY)) || []; } catch (e) { return []; } };
  const lsSave = a => { try { localStorage.setItem(LSKEY, JSON.stringify(a)); } catch (e) { throw new Error('Almacenamiento local lleno.'); } };
  const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* ---------- API ---------- */
  const Styling = {
    mode: useFirebase ? 'firebase' : 'local', STATUS, LIMITS, esc, clean, validate,

    // Enviar una solicitud (cualquier visitante)
    async submit(raw, source) {
      const d = clean(raw), err = validate(d);
      if (!raw.consent) err.consent = 'Necesitamos tu consentimiento para guardar tus datos.';
      if (Object.keys(err).length) throw Object.assign(new Error('Revisa los campos marcados.'), { fields: err });
      const src = source === 'tienda' ? 'tienda' : 'web';
      if (!useFirebase) {
        const a = lsLoad(), now = Date.now();
        a.unshift(Object.assign({ id: rid(), status: 'pending', source: src, consent: true, consentAt: now, createdAt: now, history: [] }, d));
        lsSave(a); window.dispatchEvent(new Event('masarte-styling')); return;
      }
      const db = await ensure(), FV = firebase.firestore.FieldValue;
      try {
        await db.collection(COL).add(Object.assign({}, d, { status: 'pending', source: src, consent: true, consentAt: FV.serverTimestamp(), createdAt: FV.serverTimestamp() }));
      } catch (e) {
        throw new Error(e && e.code === 'permission-denied' ? 'No se pudo guardar la solicitud. Inténtalo de nuevo en unos minutos.' : 'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.');
      }
    },

    // ¿La sesión actual es de administrador?
    isAdmin() {
      if (!useFirebase) { try { return sessionStorage.getItem('masarte.admin') === '1'; } catch (e) { return false; } }
      const u = window.firebase && firebase.apps && firebase.apps.length && firebase.auth().currentUser;
      return !!(u && !u.isAnonymous && u.providerData.some(p => p.providerId === 'password'));
    },
    adminEmail() { const u = window.firebase && firebase.apps && firebase.apps.length && firebase.auth().currentUser; return (u && u.email) || ''; },
    async signIn(email, password) {
      await ensure();
      try { await firebase.auth().signInWithEmailAndPassword(String(email || '').trim(), String(password || '')); }
      catch (e) { throw new Error(authMsg(e.code)); }
    },
    async signOut() {
      if (!useFirebase) { try { sessionStorage.removeItem('masarte.admin'); } catch (e) { /* ignorar */ } return; }
      await firebase.auth().signOut();
      await firebase.auth().signInAnonymously();   // la app de tienda sigue funcionando
    },
    onAuthChange(cb) { if (useFirebase) ensure().then(() => firebase.auth().onAuthStateChanged(cb)).catch(() => {}); },

    // Escuchar solicitudes en tiempo real (solo administradores; las reglas lo imponen)
    watch(cb, errCb) {
      if (!useFirebase) {
        const run = () => cb(lsLoad().map(x => norm(x.id, x)));
        window.addEventListener('masarte-styling', run); window.addEventListener('storage', run); setTimeout(run, 0);
        return () => { window.removeEventListener('masarte-styling', run); window.removeEventListener('storage', run); };
      }
      let un = () => {}, dead = false;
      ensure().then(db => {
        if (dead) return;
        un = db.collection(COL).orderBy('createdAt', 'desc').onSnapshot(s => cb(s.docs.map(d => norm(d.id, d.data()))), e => errCb && errCb(e));
      }).catch(e => errCb && errCb(e));
      return () => { dead = true; un(); };
    },

    // Editar datos/estado y anotar el seguimiento (solo administradores)
    async update(id, fields, user, entries) {
      const f = {};
      ['name', 'email', 'phone', 'description'].forEach(k => { if (fields[k] != null) f[k] = fields[k]; });
      if (Object.keys(f).length) {
        const c = clean(Object.assign({ name: '', email: '', phone: '', description: '' }, f)), err = validate(c, Object.keys(f));
        if (Object.keys(err).length) throw Object.assign(new Error('Revisa los campos marcados.'), { fields: err });
        Object.keys(f).forEach(k => { f[k] = c[k]; });
      }
      if (fields.status != null) { if (!STATUS[fields.status]) throw new Error('Estado no válido.'); f.status = fields.status; }
      const ents = (entries || []).map(e => Object.assign({ at: Date.now(), by: user }, e));
      if (!useFirebase) {
        const a = lsLoad(), i = a.findIndex(x => x.id === id);
        if (i < 0) throw new Error('La solicitud ya no existe.');
        Object.assign(a[i], f, { updatedAt: Date.now(), updatedBy: user }); a[i].history = (a[i].history || []).concat(ents);
        lsSave(a); window.dispatchEvent(new Event('masarte-styling')); return;
      }
      const db = await ensure(), upd = Object.assign({}, f, { updatedAt: Date.now(), updatedBy: user });
      if (ents.length) upd.history = firebase.firestore.FieldValue.arrayUnion.apply(null, ents);
      await db.collection(COL).doc(id).update(upd);
    },
    async remove(id) {
      if (!useFirebase) { lsSave(lsLoad().filter(x => x.id !== id)); window.dispatchEvent(new Event('masarte-styling')); return; }
      const db = await ensure(); await db.collection(COL).doc(id).delete();
    },

    /* ---------- Formulario (compartido por la app y la página pública) ---------- */
    privacyHTML() {
      const who = esc(priv.controller || cfg.storeName || '+Arte Home'), mail = priv.contactEmail ? esc(priv.contactEmail) : 'la propia tienda';
      return '<details class="priv"><summary>Información sobre protección de datos</summary><ul>' +
        '<li><b>Responsable:</b> ' + who + '.</li>' +
        '<li><b>Finalidad:</b> gestionar tu solicitud de estilismo y ponernos en contacto contigo.</li>' +
        '<li><b>Base jurídica:</b> tu consentimiento (art. 6.1.a RGPD), que puedes retirar en cualquier momento.</li>' +
        '<li><b>Destinatarios:</b> no cedemos tus datos a terceros salvo obligación legal. Se almacenan en servidores de Google Firebase (proveedor tecnológico) con acceso restringido al personal autorizado.</li>' +
        '<li><b>Conservación:</b> ' + (priv.retentionMonths || 24) + ' meses desde la última gestión, o hasta que solicites su supresión.</li>' +
        '<li><b>Derechos:</b> acceso, rectificación, supresión, oposición, limitación y portabilidad, escribiendo a ' + mail + '. También puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).</li></ul></details>';
    },
    formHTML(prefix) {
      const id = k => (prefix || 'sf') + '_' + k;
      return '<form class="sform" novalidate autocomplete="on" data-sform>' +
        '<label class="field"><span>Nombre y apellidos *</span><input id="' + id('name') + '" name="name" type="text" autocomplete="name" maxlength="120" required><small class="ferr" data-err="name"></small></label>' +
        '<div class="row2">' +
          '<label class="field"><span>Correo electrónico *</span><input id="' + id('email') + '" name="email" type="email" autocomplete="email" inputmode="email" maxlength="120" required><small class="ferr" data-err="email"></small></label>' +
          '<label class="field"><span>Teléfono de contacto *</span><input id="' + id('phone') + '" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" required><small class="ferr" data-err="phone"></small></label>' +
        '</div>' +
        '<label class="field"><span>Cuéntanos qué necesitas *</span><textarea id="' + id('description') + '" name="description" rows="7" maxlength="3000" required ' +
          'placeholder="¿Qué espacio quieres estilizar? ¿Qué estilo te gusta (nórdico, mediterráneo, clásico…)? Colores, presupuesto aproximado, plazos, ideas o cualquier detalle que nos ayude."></textarea>' +
          '<span class="fcount"><small class="ferr" data-err="description"></small><em data-count>0 / 3000</em></span></label>' +
        '<div class="hp" aria-hidden="true"><label>No rellenar este campo<input name="website" tabindex="-1" autocomplete="off"></label></div>' +
        this.privacyHTML() +
        '<label class="check"><input name="consent" type="checkbox"><span><b>Acepto el tratamiento de mis datos</b><em>Consiento que se guarden para gestionar mi solicitud de estilismo.</em></span></label><small class="ferr" data-err="consent"></small>' +
        '<p class="form-error" data-err="form" role="alert"></p>' +
        '<button class="btn primary xl" type="submit">Enviar solicitud</button></form>';
    },
    // Conecta el formulario: validación en vivo, envío y mensajes
    bindForm(form, opts) {
      opts = opts || {};
      const q = n => form.querySelector('[name="' + n + '"]'), err = n => form.querySelector('[data-err="' + n + '"]');
      const area = q('description'), counter = form.querySelector('[data-count]');
      const upd = () => { counter.textContent = area.value.length + ' / ' + LIMITS.description[1]; };
      area.addEventListener('input', upd); upd();
      const show = fields => { ['name', 'email', 'phone', 'description', 'consent'].forEach(k => { const el = err(k); if (el) el.textContent = (fields && fields[k]) || ''; const inp = q(k); if (inp) inp.classList.toggle('bad', !!(fields && fields[k])); }); };
      ['name', 'email', 'phone', 'description'].forEach(k => q(k).addEventListener('blur', () => { const d = clean(Object.fromEntries(['name', 'email', 'phone', 'description'].map(x => [x, q(x).value]))); if (q(k).value) { const e = validate(d, [k]); err(k).textContent = e[k] || ''; q(k).classList.toggle('bad', !!e[k]); } }));
      let busy = false;
      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        if (busy) return;
        const raw = { name: q('name').value, email: q('email').value, phone: q('phone').value, description: q('description').value, consent: q('consent').checked };
        const btn = form.querySelector('button[type=submit]');
        if (q('website').value) { opts.onDone && opts.onDone(); return; }   // anti-spam: campo trampa (los bots lo rellenan, las personas no lo ven)
        busy = true; btn.disabled = true; const label = btn.textContent; btn.textContent = 'Enviando…'; show(null); err('form').textContent = '';
        try {
          await Styling.submit(raw, opts.source);
          form.reset(); upd();
          opts.onDone && opts.onDone();
        } catch (e) {
          if (e.fields) { show(e.fields); const first = Object.keys(e.fields)[0], el = q(first); if (el) el.focus(); }
          err('form').textContent = e.fields ? '' : (e.message || 'No se pudo enviar.');
        } finally { busy = false; btn.disabled = false; btn.textContent = label; }
      });
    }
  };
  window.MasarteStyling = Styling;
})();
