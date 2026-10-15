/* Página pública de solicitud de estilismo (sin acceso al resto de la app) */
(function () {
  'use strict';
  const S = window.MasarteStyling, box = document.getElementById('formBox'), thanks = document.getElementById('thanks');
  const cfg = window.MASARTE_CONFIG || {};
  if (cfg.storeName) document.getElementById('brand').textContent = cfg.storeName;

  function show() {
    thanks.hidden = true; box.hidden = false;
    box.innerHTML = S.formHTML('pub');
    S.bindForm(box.querySelector('[data-sform]'), {
      source: 'web',
      onDone: () => { box.hidden = true; thanks.hidden = false; window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
  }
  document.getElementById('again').addEventListener('click', show);
  show();
})();
