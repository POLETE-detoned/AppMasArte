/* ============================================================
   PRECIOS, DESCUENTOS Y RESERVAS (lógica pura, sin acceso a datos)
   La usan tanto la interfaz como el almacén de datos, así el importe
   que se ve en pantalla es exactamente el que se registra al comprar.
   ============================================================ */
(function () {
  'use strict';
  const cfg = window.MASARTE_CONFIG || {};

  const DISCOUNTS = [0, 10, 20, 30, 40, 50, 100];            // % permitidos por línea
  const TTL_MS = (cfg.reservationMinutes || 30) * 60000;      // duración de una reserva
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

  /* ---------- Reservas ---------- */
  // Unidades reservadas y vigentes en un producto, por cuentas distintas de "exclude"
  function reservedUnits(p, now, excludeCartId) {
    const res = (p && p.reservations) || {};
    return Object.keys(res).reduce((a, cid) => (cid !== excludeCartId && res[cid].exp > now ? a + (res[cid].qty || 0) : a), 0);
  }
  // Unidades que se pueden coger ahora: físicas − reservadas por otros
  const available = (p, now, excludeCartId) => Math.max(0, ((p && p.stock) || 0) - reservedUnits(p, now, excludeCartId));

  /* ---------- Promociones ---------- */
  // ¿Esta promoción aplica a la línea? (alcance, importe mínimo, activa)
  function promoMatches(promo, category, listSubtotal) {
    if (!promo || promo.active === false) return false;
    if (promo.scope && promo.scope !== 'all' && promo.scope !== category) return false;
    return listSubtotal >= (Number(promo.minSubtotal) || 0);
  }

  /* ---------- Cálculo de una línea ---------- */
  // line: { qty, discount }  product: { price, category }  promo: promoción elegida (o null)
  function priceLine(line, product, promo, listSubtotal) {
    const list = Number(product && product.price) || 0;
    const qty = Math.max(0, Math.floor(Number(line.qty) || 0));
    const d = DISCOUNTS.includes(Number(line.discount)) ? Number(line.discount) : 0;
    let promoPct = 0, note = '';
    if (promoMatches(promo, product && product.category, listSubtotal)) {
      if (d > 0 && !promo.stackable) note = 'La promoción no se suma al descuento manual (incompatibles).';
      else promoPct = Number(promo.percent) || 0;
    }
    const unitFinal = r2(list * (1 - d / 100) * (1 - promoPct / 100));
    const lineList = r2(list * qty), lineTotal = r2(unitFinal * qty);
    return {
      list, qty, discount: d, promoPct, note, unitFinal,
      unitSaving: r2(list - unitFinal), lineList, lineTotal, lineSaving: r2(lineList - lineTotal)
    };
  }

  // Totales de todo el carrito. products: mapa id → producto
  function cartTotals(items, products, promo) {
    const listSubtotal = r2(items.reduce((a, it) => {
      const p = products[it.productId]; return a + (p ? (Number(p.price) || 0) * it.qty : 0);
    }, 0));
    const lines = items.map(it => {
      const p = products[it.productId];
      return Object.assign({ item: it, missing: !p, product: p || null }, priceLine(it, p || { price: 0 }, promo, listSubtotal));
    });
    const total = r2(lines.reduce((a, l) => a + l.lineTotal, 0));
    const promoApplied = lines.some(l => l.promoPct > 0);
    return {
      lines, listSubtotal, total, saving: r2(listSubtotal - total), promoApplied,
      units: lines.reduce((a, l) => a + l.qty, 0)
    };
  }

  window.MasartePricing = { DISCOUNTS, TTL_MS, r2, reservedUnits, available, promoMatches, priceLine, cartTotals };
})();
