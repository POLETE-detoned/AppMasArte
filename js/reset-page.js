/* Restablecer datos: borra las colecciones de la app (solo funciona con las reglas temporales publicadas) */
(function () {
  'use strict';
  const cfg = window.MASARTE_CONFIG || {}, fb = cfg.firebase || {};
  const useFirebase = !!(fb.apiKey && fb.projectId && !/^TU_/.test(fb.apiKey) && !/^TU_/.test(fb.projectId));
  const COLS = [['products', 'Productos'], ['movements', 'Movimientos e historial'], ['customers', 'Clientes'], ['carts', 'Carritos'], ['orders', 'Compras'], ['promos', 'Promociones'], ['styling_requests', 'Solicitudes de estilismo']];
  const $ = s => document.querySelector(s);
  const msg = t => { $('#msg').textContent = t || ''; };
  const log = (t, cls) => { const p = document.createElement('p'); p.className = cls || ''; p.textContent = t; $('#log').appendChild(p); };
  let db = null;

  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo conectar con Firebase.')); document.head.appendChild(s); }); }
  async function connect() {
    const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
    await loadScript(base + 'firebase-app-compat.js');
    await Promise.all([loadScript(base + 'firebase-auth-compat.js'), loadScript(base + 'firebase-firestore-compat.js')]);
    firebase.initializeApp(fb);
    const auth = firebase.auth();
    const cur = await new Promise(res => { const un = auth.onAuthStateChanged(u => { un(); res(u); }); });
    if (!cur) await auth.signInAnonymously();
    db = firebase.firestore();
  }

  async function count(name) {
    try { const s = await db.collection(name).get(); return s.size; }
    catch (e) { return e && e.code === 'permission-denied' ? null : -1; }
  }
  async function showCounts() {
    const box = $('#counts'); box.innerHTML = '';
    let total = 0, blocked = 0;
    for (const [name, label] of COLS) {
      const n = await count(name), row = document.createElement('div'); row.className = 'rc';
      row.innerHTML = '<span></span><b></b>'; row.firstChild.textContent = label;
      row.lastChild.textContent = n === null ? 'sin acceso' : n < 0 ? 'error' : String(n);
      if (n === null) { row.classList.add('na'); if (name !== 'styling_requests') blocked++; } else if (n > 0) total += n;
      box.appendChild(row);
    }
    if (blocked) msg('Firestore no deja leer los datos: publica primero las reglas temporales (firestore.reset.rules) y recarga esta página.');
    else if (!total) msg('No hay datos que borrar: la app ya está limpia.');
    else msg('');
    return { total, blocked };
  }

  async function wipe(name) {
    let deleted = 0;
    for (;;) {
      const snap = await db.collection(name).limit(400).get();
      if (snap.empty) return deleted;
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit(); deleted += snap.size;
    }
  }

  async function clearDevice() {
    try { Object.keys(localStorage).filter(k => k.indexOf('masarte.') === 0).forEach(k => localStorage.removeItem(k)); sessionStorage.clear(); } catch (e) { /* ignorar */ }
    try { if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.filter(k => k.indexOf('masarte-') === 0).map(k => caches.delete(k))); } } catch (e) { /* ignorar */ }
    try { if (indexedDB.databases) { const dbs = await indexedDB.databases(); await Promise.all(dbs.filter(d => /firestore|firebase/i.test(d.name || '')).map(d => new Promise(r => { const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = () => r(); }))); } } catch (e) { /* ignorar */ }
  }

  async function run() {
    const btn = $('#go'); btn.disabled = true; $('#confirm').disabled = true; msg(''); $('#log').innerHTML = '';
    let failed = false;
    for (const [name, label] of COLS) {
      try { const n = await wipe(name); log('✔ ' + label + ': ' + n + (n === 1 ? ' registro eliminado' : ' registros eliminados'), 'ok'); }
      catch (e) {
        failed = true;
        log('✖ ' + label + ': ' + (e && e.code === 'permission-denied' ? (name === 'styling_requests' ? 'se borra desde Estilismos → Solicitudes (requiere cuenta de administrador)' : 'Firestore lo rechazó (¿están publicadas las reglas temporales?)') : (e.message || 'error')), 'bad');
        if (name !== 'styling_requests') failed = true;
      }
    }
    await clearDevice();
    log('✔ Datos de este dispositivo borrados', 'ok');
    await showCounts();
    log(failed ? 'Termina de revisar los avisos de arriba. Recuerda volver a publicar las reglas normales (firestore.rules).' : 'Listo. Ahora vuelve a publicar las reglas normales (firestore.rules) en Firestore → Reglas.', failed ? 'bad' : 'ok');
    $('#confirm').value = ''; $('#confirm').disabled = false;
  }

  async function runLocal() {
    $('#go').disabled = true; $('#log').innerHTML = '';
    await clearDevice(); log('✔ Datos de este dispositivo borrados. Recarga la app para verla limpia.', 'ok');
    $('#confirm').value = '';
  }

  async function init() {
    $('#confirm').addEventListener('input', e => { $('#go').disabled = e.target.value.trim() !== 'BORRAR TODO'; });
    $('#local').addEventListener('click', async () => { await clearDevice(); log('✔ Datos de este dispositivo borrados (recarga la app para verla limpia)', 'ok'); });
    if (!useFirebase) {
      $('#counts').innerHTML = '<p class="muted">Modo de prueba (sin Firebase): los datos solo existen en este navegador.</p>';
      $('#go').textContent = 'Borrar los datos de este dispositivo'; $('#local').hidden = true;
      $('#go').addEventListener('click', runLocal); return;
    }
    $('#go').addEventListener('click', run);
    try { await connect(); await showCounts(); } catch (e) { $('#counts').innerHTML = ''; msg(e.message || 'No se pudo conectar.'); }
  }
  init();
})();
