/* ============================================================
   CONFIGURACIÓN DE LA TIENDA
   ------------------------------------------------------------
   1) Rellena "firebase" con los datos de tu proyecto (ver README.md).
      Mientras tenga los valores de ejemplo, la app funciona en
      MODO LOCAL (datos solo en este navegador, útil para probar).
   2) Cambia el PIN de la tienda.
   ============================================================ */
window.MASARTE_CONFIG = {
  storeName: "+Arte Home",
  tagline: "",

  // PIN que deben teclear los dependientes al entrar. Déjalo vacío ("") para no pedirlo.
  shopPin: "2010",

  // Minutos que una unidad queda reservada en un carrito antes de volver a estar disponible.
  reservationMinutes: 30,

  // Nombres de los dependientes (aparecen como botones rápidos al entrar). Opcional.
  staff: [],

  // Se avisa de "Últimas unidades" cuando quedan estas unidades o menos.
  lowStock: 2,

  currency: "EUR",

  // Protección de datos (se muestra en el formulario de Estilismos). Revisa estos datos con tu asesor legal.
  privacy: {
    controller: "+Arte Home",      // responsable del tratamiento (razón social)
    contactEmail: "",              // correo para ejercer derechos (acceso, supresión…)
    retentionMonths: 24            // meses que se conservan las solicitudes
  },

  // Datos de Firebase → Configuración del proyecto → Tus apps → SDK de la app web
  firebase: {
    apiKey: "AIzaSyAM8Qk9GLUBGpPFhEdtcs0CI4D98BldpSs",
    authDomain: "appmasarte.firebaseapp.com",
    projectId: "appmasarte",
    storageBucket: "appmasarte.firebasestorage.app",
    messagingSenderId: "948064547452",
    appId: "1:948064547452:web:4fade5e8f8d6a82fbfcff9"
  }
};
