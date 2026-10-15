# +Arte Home · Control de stock y ventas

App web (HTML + CSS + JS, sin build) para una tienda de interiorismo: inventario por categorías, botón **Vender**, historial con quién hizo qué, resumen y **sincronización en tiempo real** entre móviles y ordenadores.

```
index.html        → la app
css/styles.css    → diseño
img/              → logo e iconos (+Arte Home)
js/config.js      → ⚙️ aquí pones tu Firebase y el PIN
js/store.js       → capa de datos (Firestore o modo local)
js/app.js         → lógica de la interfaz
js/market.js      → tienda, carrito y administración
js/styling.js     → solicitudes de estilismo (datos, seguridad, formulario)
js/styling-ui.js  → pestaña «Estilismos» y panel de gestión
estilismos.html   → formulario público para clientes
firestore.rules   → reglas de seguridad de la base de datos
firebase.json     → publicación en Firebase Hosting
```

## Tienda, carritos y administración

Pestañas: **Inventario** (gestión), **Tienda** (catálogo para vender), **Carrito** (uno por cuenta de cliente), **Ventas**, **Resumen** y **Admin** (PIN `adminPin` de `js/config.js`).

- **Cuentas**: cada cliente tiene su cuenta y su carrito independiente. Atiende el dependiente identificado.
- **Stock** = físico · reservado · disponible. Al añadir al carrito se **reservan** las unidades (`reservationMinutes`, 30 por defecto). Quitar un artículo, vaciar el carrito o dejar caducar la reserva las libera. Al **Finalizar compra** se descuentan definitivamente y se guarda el pedido. La reserva se decide dentro de una transacción de Firestore: dos cuentas no pueden quedarse con la misma unidad.
- **Descuentos**: 0, 10, 20, 30, 40, 50 y 100 % (gratis) por línea. Cada producto tiene su apartado "Descuentos" con el desglose original · descuento · final.
- **Promociones** (las crea el administrador): un % para todo o para una categoría, con importe mínimo opcional. **No se suman** a un descuento manual de la línea salvo que la promoción esté marcada como *acumulable* (autorización expresa).
- **Admin**: carritos activos, compras finalizadas, promociones y descuento por producto, reservas (con liberación manual) y stock físico/reservado/disponible.

> Si ya tenías la base de datos en marcha, **vuelve a pegar `firestore.rules`** en Firestore → Reglas → Publicar: hay colecciones nuevas (`customers`, `carts`, `orders`, `promos`).

## Estilismos (solicitudes de clientes)

- **Formulario público**: `estilismos.html` (por ejemplo `https://tu-dominio/estilismos.html`). El cliente solo ve el formulario, sin acceso al resto de la app. El mismo formulario está en la pestaña **Estilismos → Nueva solicitud**, para rellenarlo en tienda.
- **Panel de gestión**: pestaña **Estilismos → Solicitudes**. Lista, busca y filtra por estado (pendiente, en proceso, finalizada), abre la ficha del cliente, edita sus datos y su petición, cambia el estado y anota el **seguimiento** (notas con fecha y autor). También permite eliminar una solicitud (derecho de supresión).
- Todo se guarda en la colección `styling_requests` de Firestore, no en el navegador.

### Cómo se protegen los datos personales

| Medida | Dónde |
|---|---|
| Solo los administradores pueden **leer, editar o borrar** solicitudes (cuenta de correo y contraseña de una lista cerrada) | `firestore.rules` (lo impone el servidor, no la página) |
| Cualquiera puede **enviar**, pero con los campos, tipos y límites exactos del formulario; el estado inicial siempre es *pendiente*; fecha de creación y de consentimiento puestas por el servidor | `firestore.rules` |
| Consentimiento expreso (casilla obligatoria) con fecha guardada, e información de protección de datos en el formulario | `js/styling.js`, `js/config.js` → `privacy` |
| Anti-spam (campo trampa) y validación en el navegador y en el servidor | `js/styling.js`, `firestore.rules` |
| Los textos se escapan al mostrarse (sin inyección de código) | `js/styling-ui.js` |
| Páginas sin indexar (`noindex`) y conexión cifrada (HTTPS) | `index.html`, `estilismos.html` |
| Derecho de supresión | botón «Eliminar solicitud y datos personales» |

### Puesta en marcha (una vez)

1. **Firebase → Authentication → Método de acceso → Correo electrónico/Contraseña → Activar.**
2. **Authentication → Usuarios → Agregar usuario**: crea una cuenta (correo + contraseña) para cada persona que pueda ver las solicitudes.
3. **Authentication → Configuración → Acciones del usuario**: desactiva *Habilitar creación (registro)* para que nadie pueda crearse una cuenta por su cuenta.
4. En `firestore.rules`, sustituye `'TU_CORREO@ejemplo.com'` de la función `isAdmin()` por los correos de esas cuentas (separados por comas), pega **todo el archivo** en Firestore → Reglas y pulsa **Publicar**.
5. En `js/config.js` → `privacy`, rellena el responsable y el correo para ejercer derechos. Pide a tu asesor que revise el texto legal.
6. Añade tu dominio en Authentication → Configuración → **Dominios autorizados** (para GitHub Pages: `polete-detoned.github.io`).

> ⚠️ **Limitación importante**: el resto de la app (clientes, carritos, compras) sigue usando sesiones anónimas y el PIN, que se comprueba en el navegador. Esos datos (nombre, teléfono y correo de las cuentas de clientes) **no** tienen el nivel de protección de Estilismos. Para protegerlos igual hay que pasar a todo el personal a cuentas de correo/contraseña y limitar también esas colecciones a `isAdmin()`.
> Recomendado además: activar **Firebase App Check** (reCAPTCHA) para frenar el spam automático en el formulario público.

## Probarla ya (sin configurar nada)

Con `js/config.js` tal cual, la app corre en **modo local** (etiqueta naranja "Modo local"): los datos viven solo en ese navegador. Sirve para ver el diseño y probar el flujo.

```bash
npx serve .      # o abre index.html directamente
```
PIN por defecto: `2010`. En un inventario vacío pulsa **Cargar ejemplos**.

## Base de datos compartida (Firebase · gratis)

Usamos **Cloud Firestore**: guarda los datos en la nube y empuja los cambios a todos los dispositivos al instante (`onSnapshot`). El plan gratuito (Spark) sobra para una tienda.

1. Entra en <https://console.firebase.google.com> → **Añadir proyecto** (puedes desactivar Google Analytics).
2. **Compilación → Firestore Database → Crear base de datos**. Elige región europea (`eur3` o `europe-west1`) y modo producción.
3. **Compilación → Authentication → Comenzar → Método de acceso → Anónimo → Activar**.
4. **Firestore → pestaña Reglas**: pega el contenido de `firestore.rules` y **Publicar**.
5. **Configuración del proyecto (⚙️) → Tus apps → icono `</>` (Web)** → registra la app y copia el objeto `firebaseConfig`. Pégalo en `js/config.js`, dentro de `firebase: { … }`.
6. Cambia `shopPin` por el PIN de tu tienda (y, si quieres, rellena `staff` con los nombres de los dependientes).

Al recargar, la etiqueta pasará a verde **"En vivo"**. Abre la app en dos dispositivos y vende en uno: el otro lo verá al momento.

## Publicarla

**Opción A · Firebase Hosting** (recomendada, ya está todo configurado)
```bash
npm i -g firebase-tools
firebase login
firebase use --add        # elige tu proyecto
firebase deploy           # sube la web y las reglas
```
Te dará una URL `https://tu-proyecto.web.app`. Ábrela en el móvil y usa **Compartir → Añadir a pantalla de inicio**.

**Opción B · Netlify / Vercel / GitHub Pages**: sube la carpeta tal cual (no hay build). Después, en Firebase → Authentication → Configuración → **Dominios autorizados**, añade tu dominio.

## Cómo funciona

| Colección | Contenido |
|---|---|
| `products` | nombre, código, categoría, variante, precio, stock, foto (JPEG reducido, base64), notas, `lastSale`, `soldOutBy` |
| `movements` | cada acción: venta, reposición, ajuste, alta, edición, baja, venta deshecha — con usuario y marca de tiempo |

- **Vender / reponer / deshacer** usan transacciones: si dos dependientes pulsan Vender a la vez sobre la última unidad, solo una venta se acepta (el stock nunca baja de 0).
- **Deshacer venta** anula la última venta del producto (queda tachada en el historial, con quién la deshizo) y restaura la "última venta" anterior.
- Las ventas deshechas no cuentan en el resumen.

## Seguridad: qué esperar

- El PIN se comprueba en el navegador: sirve para que un cliente curioso no toque el stock, **no** como seguridad fuerte. Las reglas exigen una sesión anónima válida, y la URL no está indexada ni enlazada.
- Si necesitas control real (altas/bajas de usuarios, roles), cambia a Firebase Auth con email y contraseña y ajusta `firestore.rules` con `request.auth.uid`.
- No pegues claves privadas: la `apiKey` de Firebase web es pública por diseño; lo que protege los datos son las reglas.
- Las fotos se guardan dentro del documento (≈40 KB c/u, límite de Firestore 1 MB). Para catálogos grandes con muchas fotos conviene migrar a Firebase Storage.
