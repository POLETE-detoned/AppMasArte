/* ============================================================
   CONFIGURACIÓN DE LA TIENDA
   ------------------------------------------------------------
   1) Rellena "firebase" con los datos de tu proyecto (ver README.md).
      Mientras tenga los valores de ejemplo, la app funciona en
      MODO LOCAL (datos solo en este navegador, útil para probar).
   2) Cambia el PIN de la tienda.
   ============================================================ */
window.MASARTE_CONFIG = {
  storeName: "MasArte",
  tagline: "Interiorismo",

  // PIN que deben teclear los dependientes al entrar. Déjalo vacío ("") para no pedirlo.
  shopPin: "1234",

  // Nombres de los dependientes (aparecen como botones rápidos al entrar). Opcional.
  staff: [],

  // Se avisa de "Últimas unidades" cuando quedan estas unidades o menos.
  lowStock: 2,

  currency: "EUR",

  // Datos de Firebase → Configuración del proyecto → Tus apps → SDK de la app web
  firebase: {
    apiKey: "TU_API_KEY",
    authDomain: "TU_PROYECTO.firebaseapp.com",
    projectId: "TU_PROYECTO",
    storageBucket: "TU_PROYECTO.appspot.com",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:0000000000000000"
  }
};
