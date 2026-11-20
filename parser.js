// Lee un recibo de sueldo y devuelve { periodo, haberes, descuentos, neto }.
// Funciona en el navegador (window.ReciboParser) y en Node (require) para probarlo.
(function (root) {
  const MESES = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12 };
  const MONTO = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/;
  const MONTO_G = /-?\d{1,3}(?:[.\s]\d{3})*,\d{2}/g;

  // Palabras que casi siempre son descuentos (para fotos, donde no hay columnas exactas).
  const PALABRAS_DESC = /mutual|mut\.|^ap\.|aporte|o\.?s\.?|obra soc|jubil|ley |sindic|cuota|prest|ganancia|impuesto|desc|retenc|seguro|embargo|crjp|ospe/i;

  const aNumero = s => parseFloat(String(s).replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  const redondear = n => Math.round(n * 100) / 100;

  function periodoDe(texto) {
    const m = String(texto).toUpperCase().match(/\b(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SET|OCT|NOV|DIC)[A-Z]*\.?\s*(?:DE\s+)?(\d{4})\b/);
    if (!m) return "";
    return m[2] + "-" + String(MESES[m[1]]).padStart(2, "0");
  }

  // items: [{ str, x, y }] con y creciendo hacia arriba (como da pdf.js).
  function desdePdf(items) {
    items = items.filter(i => i.str && i.str.trim()).map(i => ({ str: i.str.trim(), x: i.x, y: i.y }));
    const cab = items.find(i => /^haberes$/i.test(i.str));
    const cabD = items.find(i => /^descuentos$/i.test(i.str));
    if (!cab || !cabD) return desdeTexto(lineasDeItems(items).join("\n"));

    const debajo = items.filter(i => i.y < cab.y - 3).sort((a, b) => b.y - a.y || a.x - b.x);
    // Dónde empieza la columna de conceptos de descuentos: lo que está a la izquierda es de haberes.
    const etiquetas = debajo.filter(i => !MONTO.test(i.str));
    const x0 = Math.min(...etiquetas.map(i => i.x));
    const xsD = etiquetas.map(i => i.x).filter(x => x > x0 + 100 && x < cabD.x + 30);
    const corte = (xsD.length ? Math.min(...xsD) : cabD.x - 15) - 2;

    // Agrupa en filas por altura.
    const filas = [];
    for (const it of debajo) {
      const f = filas.find(f => Math.abs(f.y - it.y) < 2);
      f ? f.items.push(it) : filas.push({ y: it.y, items: [it] });
    }

    const haberes = [], descuentos = [];
    let empezo = false;
    for (const f of filas) {
      const conTexto = f.items.some(i => !MONTO.test(i.str));
      if (!conTexto) { if (empezo) break; else continue; }
      empezo = true;
      for (const [lado, lista] of [["h", haberes], ["d", descuentos]]) {
        const parte = f.items.filter(i => (lado === "h") === (i.x < corte));
        const etiqueta = parte.filter(i => !MONTO.test(i.str)).map(i => i.str).join(" ");
        const montos = parte.filter(i => MONTO.test(i.str)).map(i => aNumero(i.str));
        if (etiqueta) lista.push({ concepto: etiqueta, monto: redondear(montos.reduce((a, b) => a + b, 0)) });
      }
    }

    const todo = items.map(i => i.str).join(" ");
    let neto = 0;
    const liq = items.find(i => /l[ií]quido/i.test(i.str));
    if (liq) {
      const cand = items.filter(i => MONTO.test(i.str) && i.y < liq.y && liq.y - i.y < 40)
        .sort((a, b) => Math.abs(a.x - liq.x) - Math.abs(b.x - liq.x));
      if (cand[0]) neto = aNumero(cand[0].str);
    }
    const r = { periodo: periodoDe(todo), haberes, descuentos, neto, fuente: "pdf" };
    if (!r.haberes.length && !r.descuentos.length) return desdeTexto(lineasDeItems(items).join("\n"));
    return r;
  }

  function lineasDeItems(items) {
    const filas = [];
    for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
      const f = filas.find(f => Math.abs(f.y - it.y) < 2);
      f ? f.items.push(it) : filas.push({ y: it.y, items: [it] });
    }
    return filas.map(f => f.items.sort((a, b) => a.x - b.x).map(i => i.str).join(" "));
  }

  // Para texto de una foto (OCR): cada línea puede traer "concepto monto [concepto monto]".
  function desdeTexto(texto, conocidos) {
    conocidos = conocidos || {};
    const haberes = [], descuentos = [];
    let neto = 0;
    const lineas = String(texto).split(/\r?\n/).map(l => l.replace(/[|_—–]+/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);

    for (let n = 0; n < lineas.length; n++) {
      const linea = lineas[n];
      if (/l[ií]quido|a cobrar/i.test(linea)) {
        const m = (linea.match(MONTO_G) || []).concat(lineas[n + 1] ? lineas[n + 1].match(MONTO_G) || [] : []);
        if (m.length) neto = aNumero(m[m.length - 1]);
        if (!(linea.match(MONTO_G) || []).length) n++; // el monto venía en la línea siguiente
        continue;
      }
      if (/total|son pesos|importe|haberes|descuentos|dni|cuil|cuit/i.test(linea)) continue;

      // Separa en pares (concepto, montos).
      const pares = [];
      let resto = linea, m;
      const re = /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][^]*?)\s*((?:-?\d{1,3}(?:[.\s]\d{3})*,\d{2}\s*)+)/g;
      while ((m = re.exec(resto))) {
        const concepto = m[1].replace(/[\s.:-]+$/, "").trim();
        const montos = m[2].match(MONTO_G).map(aNumero);
        if (concepto.length >= 3) pares.push({ concepto, monto: redondear(montos.reduce((a, b) => a + b, 0)) });
      }
      if (!pares.length) continue;
      if (pares.length >= 2) {
        haberes.push(pares[0]);
        pares.slice(1).forEach(p => descuentos.push(p));
      } else {
        const p = pares[0];
        const tipo = conocidos[normalizar(p.concepto)] || (PALABRAS_DESC.test(p.concepto) ? "d" : "h");
        (tipo === "d" ? descuentos : haberes).push(p);
      }
    }
    return { periodo: periodoDe(texto), haberes, descuentos, neto, fuente: "foto" };
  }

  const normalizar = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

  const api = { desdePdf, desdeTexto, periodoDe, aNumero, normalizar };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ReciboParser = api;
})(typeof window !== "undefined" ? window : this);
