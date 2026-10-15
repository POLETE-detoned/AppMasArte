# MasArte · Control de stock y ventas

App web (HTML + CSS + JS, sin build) para una tienda de interiorismo: inventario por categorías, botón **Vender**, historial con quién hizo qué, resumen y **sincronización en tiempo real** entre móviles y ordenadores.

```
index.html        → la app
css/styles.css    → diseño
js/config.js      → ⚙️ aquí pones tu Firebase y el PIN
js/store.js       → capa de datos (Firestore o modo local)
js/app.js         → lógica de la interfaz
firestore.rules   → reglas de seguridad de la base de datos
firebase.json     → publicación en Firebase Hosting
```

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
