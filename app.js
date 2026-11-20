// Mis Cuentas — todo se guarda en este dispositivo (localStorage).
"use strict";
const P = window.ReciboParser;
const CLAVE = "misCuentas.v1";
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
const TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

// ---------- datos ----------
function cargar() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE));
    if (d && d.recibos) return Object.assign(base(), d);
  } catch (e) {}
  return base();
}
function base() {
  return { recibos: [], deudas: [], prestamos: [], gastos: {}, adicionales: {}, fijos:["Luz", "Gas", "Teléfono / wifi", "Netflix", "IA"] };
}
let db = cargar();
// Deudas viejas: si estaban atadas a un descuento del recibo, "recibo"; si no, se pagaban con el sueldo.
const migrar = () => db.deudas.forEach(d => { if (!d.paga) d.paga = d.concepto ? "recibo" : "sueldo"; });
migrar();
function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(db)); }
  catch (e) { aviso("No se pudo guardar: " + e.message); }
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------- utilidades ----------
const $ = s => document.querySelector(s);
const fmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plata = n => fmt.format(n || 0);
const numStr = n => (n || n === 0) ? new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : "";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const suma = a => Math.round(a.reduce((x, y) => x + (+y.monto || 0), 0) * 100) / 100;
const id = () => Math.random().toString(36).slice(2, 10);
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = p => { if (!p) return "—"; const [a, m] = p.split("-"); return MESES[+m - 1] + " " + a; };
const mesHoy = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const sumarMeses = (p, n) => { const [a, m] = p.split("-").map(Number); const t = a * 12 + (m - 1) + n; return Math.floor(t / 12) + "-" + String(t % 12 + 1).padStart(2, "0"); };
const mesAnterior = p => sumarMeses(p, -1);

// Acepta "1.234,56", "1234,56", "1234.56", "1234"
function leerMonto(s) {
  s = String(s || "").replace(/[$\s]/g, "");
  if (!s) return 0;
  if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  if (/^\d+\.\d{1,2}$/.test(s)) return parseFloat(s) || 0;
  return parseFloat(s.replace(/\./g, "")) || 0;
}

function aviso(t) {
  const el = $("#toast"); el.textContent = t; el.classList.add("on");
  clearTimeout(aviso.t); aviso.t = setTimeout(() => el.classList.remove("on"), 2600);
}

function cargarScript(src) {
  return new Promise((ok, mal) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement("script"); s.src = src; s.onload = ok;
    s.onerror = () => mal(new Error("No se pudo descargar " + src.split("/").pop() + ". Conectate a internet la primera vez."));
    document.head.appendChild(s);
  });
}

// ---------- navegación ----------
let tab = "resumen";
document.querySelectorAll("nav button").forEach(b => b.onclick = () => {
  tab = b.dataset.tab;
  document.querySelectorAll("nav button").forEach(x => x.classList.toggle("on", x === b));
  document.querySelectorAll("section.tab").forEach(s => s.classList.toggle("on", s.id === "t-" + tab));
  render(); scrollTo(0, 0);
});
const inMes = $("#mes");
inMes.value = db.recibos.length ? [...db.recibos].sort((a, b) => b.periodo.localeCompare(a.periodo))[0].periodo : mesHoy();
inMes.onchange = () => { if (!inMes.value) inMes.value = mesHoy(); render(); };

function render() {
  if (tab === "resumen") renderResumen();
  if (tab === "recibos") renderRecibos();
  if (tab === "deudas") renderDeudas();
  if (tab === "gastos") renderGastos();
  if (tab === "prestamos") renderPrestamos();
  if (tab === "adicional") renderAdicional();
}

// ---------- cálculos ----------
const reciboDe = p => db.recibos.find(r => r.periodo === p);
const gastosDe = p => db.gastos[p] || [];
const adicionalesDe = p => db.adicionales[p] || [];
const COMO_PAGA = { recibo: "Te la descuentan del recibo", sueldo: "La pagás con el sueldo", adicional: "La pagás con el adicional" };
const restantes = d => Math.max(0, (+d.cuotas || 0) - (+d.pagadas || 0));
const activa = d => restantes(d) > 0;
function finDeuda(d) {
  if (!activa(d)) return null;
  if (d.inicio) return sumarMeses(d.inicio, (+d.cuotas || 1) - 1);
  return sumarMeses(mesHoy(), restantes(d) - 1);
}

// ---------- RESUMEN ----------
function renderResumen() {
  const p = inMes.value, r = reciboDe(p), rAnt = reciboDe(mesAnterior(p));
  const gastos = suma(gastosDe(p));
  const adicional = suma(adicionalesDe(p));
  const conSueldo = db.deudas.filter(d => activa(d) && d.paga === "sueldo");
  const conAdic = db.deudas.filter(d => activa(d) && d.paga === "adicional");
  const cuotasSueldo = suma(conSueldo.map(d => ({ monto: d.cuota })));
  const cuotasAdic = suma(conAdic.map(d => ({ monto: d.cuota })));
  const neto = r ? r.neto : 0;
  const quedaSueldo = neto - gastos - cuotasSueldo;
  const quedaAdic = adicional - cuotasAdic;
  const queda = quedaSueldo + quedaAdic;
  const deudaTotal = suma(db.deudas.filter(activa).map(d => ({ monto: d.cuota * restantes(d) })));
  const colorN = n => n < 0 ? "bad" : "";

  let h = `<div class="card"><h2>Te queda en ${esc(nombreMes(p))}</h2>`;
  if (r || adicional) {
    h += `<div class="big ${queda < 0 ? "bad" : "good"}">${plata(queda)}</div>
      <div class="row" style="margin-top:6px"><span>Del sueldo<br><span class="muted">${r ? plata(neto) : "sin recibo"} − gastos ${plata(gastos)} − cuotas ${plata(cuotasSueldo)}</span></span><span class="n ${colorN(quedaSueldo)}">${plata(quedaSueldo)}</span></div>
      <div class="row"><span>Del adicional<br><span class="muted">${plata(adicional)} − cuotas ${plata(cuotasAdic)}</span></span><span class="n ${colorN(quedaAdic)}">${plata(quedaAdic)}</span></div>`;
    if (!r) h += `<div class="muted" style="margin-top:6px">Todavía no cargaste el recibo de este mes.</div>`;
  } else {
    h += `<div class="big">—</div><div class="muted">Todavía no cargaste el recibo de este mes.</div>
      <div class="acciones" style="margin-top:10px"><button onclick="irA('recibos')">Cargar recibo</button></div>`;
  }
  h += `</div>`;

  h += `<div class="grid2">
    <div class="card"><h2>Sueldo neto</h2><div class="mid">${r ? plata(neto) : "—"}</div>
      ${r && rAnt ? difHTML(neto - rAnt.neto, "vs. mes anterior") : ""}</div>
    <div class="card"><h2>Adicional</h2><div class="mid">${plata(adicional)}</div>
      <div class="muted">${adicionalesDe(p).length} cargados</div></div>
    <div class="card"><h2>Gastos</h2><div class="mid">${plata(gastos)}</div>
      <div class="muted">${gastosDe(p).length} cargados</div></div>
    <div class="card"><h2>Cuotas aparte</h2><div class="mid">${plata(cuotasSueldo + cuotasAdic)}</div>
      <div class="muted">${conSueldo.length} con sueldo · ${conAdic.length} con adicional</div></div>
    <div class="card" style="grid-column:1/-1"><h2>Deuda total</h2><div class="mid">${plata(deudaTotal)}</div>
      <div class="muted">${db.deudas.filter(activa).length} deudas activas</div></div>
  </div><div style="height:12px"></div>`;

  if (r && r.descuentos.length) {
    const bruto = suma(r.haberes);
    h += `<div class="card"><h2>Qué te descuentan del sueldo</h2>`;
    for (const d of [...r.descuentos].sort((a, b) => b.monto - a.monto)) {
      const pct = bruto ? d.monto / bruto * 100 : 0;
      h += `<div style="margin:8px 0"><div class="row" style="border:0;padding:0"><span>${esc(d.concepto)}</span><span class="n">${plata(d.monto)}</span></div>
        <div class="bar"><i style="width:${Math.min(100, pct).toFixed(1)}%"></i></div><div class="muted">${pct.toFixed(1)}% del bruto</div></div>`;
    }
    h += `<div class="row"><b>Total descuentos</b><span class="n">${plata(suma(r.descuentos))}</span></div></div>`;
  }

  const prox = db.deudas.filter(activa).sort((a, b) => restantes(a) - restantes(b)).slice(0, 4);
  if (prox.length) {
    h += `<div class="card"><h2>Deudas más cerca de terminar</h2>`;
    for (const d of prox) h += `<div class="row"><span>${esc(d.nombre)}<br><span class="muted">faltan ${restantes(d)} cuotas · termina ${esc(nombreMes(finDeuda(d)))}</span></span><span class="n">${plata(d.cuota * restantes(d))}</span></div>`;
    h += `</div>`;
  }

  h += `<div class="card"><h2>Copia de seguridad</h2>
    <div class="muted" style="margin-bottom:10px">Los datos están solo en este teléfono. Bajá una copia de vez en cuando por si cambiás de celular o borrás el navegador.</div>
    <div class="acciones"><button class="sec" onclick="exportar()">⬇ Bajar copia</button>
    <label class="btn sec">⬆ Restaurar<input type="file" accept="application/json,.json" hidden onchange="importar(this)"></label></div></div>`;
  $("#t-resumen").innerHTML = h;
}
function difHTML(n, txt) {
  if (Math.abs(n) < 0.005) return `<div class="muted">igual que el mes anterior</div>`;
  return `<div class="muted"><span class="${n > 0 ? "good" : "bad"}">${n > 0 ? "▲" : "▼"} ${plata(Math.abs(n))}</span> ${esc(txt)}</div>`;
}
window.irA = t => document.querySelector(`nav button[data-tab="${t}"]`).click();

window.exportar = () => {
  const blob = new Blob([JSON.stringify(db, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = "mis-cuentas-" + new Date().toISOString().slice(0, 10) + ".json"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
window.importar = async input => {
  const f = input.files[0]; input.value = ""; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d.recibos || !d.deudas) throw new Error("no es una copia de Mis Cuentas");
    if (!confirm("Esto reemplaza todos los datos actuales por los de la copia. ¿Seguir?")) return;
    db = Object.assign(base(), d); migrar(); guardar(); render(); aviso("Copia restaurada");
  } catch (e) { alert("No se pudo leer el archivo: " + e.message); }
};

// ---------- RECIBOS ----------
function renderRecibos() {
  const lista = [...db.recibos].sort((a, b) => b.periodo.localeCompare(a.periodo));
  if (!lista.length) {
    $("#lista-recibos").innerHTML = `<div class="card vacio">Cargá el PDF de tu recibo de sueldo (o sacale una foto) y la app lee sola los montos.<br><br>Antes de guardar vas a poder revisar y corregir todo.</div>`;
    return;
  }
  $("#lista-recibos").innerHTML = lista.map(r => {
    const ant = reciboDe(mesAnterior(r.periodo));
    const mapaAnt = {};
    if (ant) [...ant.haberes, ...ant.descuentos].forEach(x => mapaAnt[P.normalizar(x.concepto)] = (mapaAnt[P.normalizar(x.concepto)] || 0) + x.monto);
    const fila = x => {
      const k = P.normalizar(x.concepto); let dif = "";
      if (ant) {
        if (!(k in mapaAnt)) dif = `<span class="chip">nuevo</span>`;
        else if (Math.abs(x.monto - mapaAnt[k]) > 0.005) { const n = x.monto - mapaAnt[k]; dif = `<div class="muted">${n > 0 ? "▲" : "▼"} ${plata(Math.abs(n))}</div>`; }
      }
      return `<div class="row"><span>${esc(x.concepto)}${dif}</span><span class="n">${plata(x.monto)}</span></div>`;
    };
    return `<details class="card"><summary><div class="row" style="border:0;padding:0">
        <span><b style="text-transform:capitalize">${esc(nombreMes(r.periodo))}</b><span class="chip">${r.fuente === "foto" ? "foto" : "PDF"}</span>
        ${ant ? difHTML(r.neto - ant.neto, "vs. mes anterior") : ""}</span>
        <span class="n">${plata(r.neto)}</span></div></summary>
      <h2 style="margin-top:14px">Haberes</h2>${r.haberes.map(fila).join("")}
      <div class="row"><b>Bruto</b><span class="n">${plata(suma(r.haberes))}</span></div>
      <h2 style="margin-top:14px">Descuentos</h2>${r.descuentos.map(fila).join("")}
      <div class="row"><b>Total descuentos</b><span class="n">${plata(suma(r.descuentos))}</span></div>
      <div class="row"><b>Líquido a cobrar</b><span class="n">${plata(r.neto)}</span></div>
      <div class="acciones" style="margin-top:10px"><button class="sec" onclick="editarRecibo('${r.periodo}')">Editar</button>
      <button class="sec" onclick="borrarRecibo('${r.periodo}')">Borrar</button></div></details>`;
  }).join("");
}

window.borrarRecibo = p => {
  if (!confirm("¿Borrar el recibo de " + nombreMes(p) + "?")) return;
  db.recibos = db.recibos.filter(r => r.periodo !== p);
  for (const d of db.deudas) if (d.pagos && d.pagos.includes(p)) { d.pagos = d.pagos.filter(x => x !== p); d.pagadas = Math.max(0, d.pagadas - 1); }
  guardar(); render();
};
window.editarRecibo = p => abrirRevision(JSON.parse(JSON.stringify(reciboDe(p))), p);

$("#f-pdf").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  progreso("Leyendo el PDF…");
  try {
    await cargarScript(PDFJS + "pdf.min.js");
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js";
    const doc = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise;
    const pag = await doc.getPage(1);
    const tc = await pag.getTextContent();
    const items = tc.items.map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5] })).filter(i => i.str.trim());
    if (items.length < 5) {
      // PDF escaneado (es una imagen): lo dibujo y lo leo como foto.
      const vp = pag.getViewport({ scale: 2.5 });
      const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
      await pag.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      return leerImagen(c);
    }
    abrirRevision(P.desdePdf(items));
  } catch (err) { cerrar(); alert("No pude leer el PDF: " + err.message); }
};

$("#f-foto").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    progreso("Preparando la foto…");
    const img = await createImageBitmap(f);
    const max = 2400, k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = img.width * k; c.height = img.height * k;
    const g = c.getContext("2d"); g.filter = "grayscale(1) contrast(1.4)"; g.drawImage(img, 0, 0, c.width, c.height);
    await leerImagen(c);
  } catch (err) { cerrar(); alert("No pude leer la foto: " + err.message); }
};

async function leerImagen(canvas) {
  progreso("Descargando el lector de texto (solo la primera vez)…");
  await cargarScript(TESSERACT);
  const worker = await Tesseract.createWorker("spa", 1, {
    logger: m => { if (m.status === "recognizing text") progreso("Leyendo la foto… " + Math.round(m.progress * 100) + "%", m.progress); }
  });
  const { data } = await worker.recognize(canvas);
  await worker.terminate();
  abrirRevision(corregirConConocidos(P.desdeTexto(data.text, tiposConocidos())));
}

// Conceptos de recibos anteriores: sirven para saber si algo es haber o descuento
// y para corregir lo que el OCR leyó mal ("Sueldo Bas1co" → "Sueldo Básico").
function tiposConocidos() {
  const t = {};
  for (const r of db.recibos) { r.haberes.forEach(x => t[P.normalizar(x.concepto)] = "h"); r.descuentos.forEach(x => t[P.normalizar(x.concepto)] = "d"); }
  return t;
}
function corregirConConocidos(r) {
  const conocidos = [];
  for (const x of db.recibos) { x.haberes.forEach(c => conocidos.push([c.concepto, "h"])); x.descuentos.forEach(c => conocidos.push([c.concepto, "d"])); }
  if (!conocidos.length) return r;
  const todos = [...r.haberes.map(x => [x, "h"]), ...r.descuentos.map(x => [x, "d"])];
  const h = [], d = [];
  for (const [x, tipo] of todos) {
    let mejor = null, puntaje = 0;
    for (const [c, t] of conocidos) { const s = parecido(P.normalizar(x.concepto), P.normalizar(c)); if (s > puntaje) { puntaje = s; mejor = [c, t]; } }
    if (mejor && puntaje >= 0.75) (mejor[1] === "h" ? h : d).push({ concepto: mejor[0], monto: x.monto });
    else (tipo === "h" ? h : d).push(x);
  }
  return Object.assign(r, { haberes: h, descuentos: d });
}
function parecido(a, b) {
  if (!a || !b) return 0;
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - m[a.length][b.length] / Math.max(a.length, b.length);
}

// ---------- diálogo ----------
const dlg = $("#dlg");
function progreso(txt, v) {
  $("#dlg-in").innerHTML = `<h3>Un momento…</h3><div class="prog">${esc(txt)}</div>${v != null ? `<div class="bar"><i style="width:${(v * 100).toFixed(0)}%"></i></div>` : ""}`;
  if (!dlg.open) dlg.showModal();
}
function cerrar() { if (dlg.open) dlg.close(); }

// Pantalla para revisar y corregir antes de guardar.
let rev = null, revOriginal = null;
function abrirRevision(r, original) {
  rev = r; revOriginal = original || null;
  if (!rev.periodo) rev.periodo = inMes.value;
  pintarRevision();
  if (!dlg.open) dlg.showModal();
}
function pintarRevision() {
  const filas = (lista, tipo) => lista.map((x, i) => `<div class="edit" style="grid-template-columns:1fr 112px 30px 30px">
      <input value="${esc(x.concepto)}" oninput="rev.${tipo}[${i}].concepto=this.value">
      <input class="num" inputmode="decimal" value="${numStr(x.monto)}" onchange="rev.${tipo}[${i}].monto=leerMonto(this.value);this.value=numStr(rev.${tipo}[${i}].monto);verificar()">
      <button title="Pasar a ${tipo === "haberes" ? "descuentos" : "haberes"}" onclick="moverFila('${tipo}',${i})" style="color:var(--muted)">⇅</button>
      <button title="Quitar" onclick="rev.${tipo}.splice(${i},1);pintarRevision()">✕</button></div>`).join("");
  const hayAnterior = revOriginal || reciboDe(rev.periodo);
  $("#dlg-in").innerHTML = `<h3>Revisá los datos</h3>
    <div class="muted">${rev.fuente === "foto" ? "Leído de una foto: revisá bien los números." : "Leído del PDF."} Corregí lo que haga falta y guardá.</div>
    <label class="f">Mes del recibo</label><input type="month" value="${esc(rev.periodo)}" onchange="rev.periodo=this.value">
    <h2 style="margin:16px 0 8px;font-size:14px;color:var(--muted)">HABERES</h2>${filas(rev.haberes, "haberes")}
    <button class="link" onclick="rev.haberes.push({concepto:'',monto:0});pintarRevision()">＋ agregar haber</button>
    <h2 style="margin:16px 0 8px;font-size:14px;color:var(--muted)">DESCUENTOS</h2>${filas(rev.descuentos, "descuentos")}
    <button class="link" onclick="rev.descuentos.push({concepto:'',monto:0});pintarRevision()">＋ agregar descuento</button>
    <label class="f">Líquido a cobrar (lo que dice el recibo)</label>
    <input class="num" inputmode="decimal" value="${numStr(rev.neto)}" onchange="rev.neto=leerMonto(this.value);this.value=numStr(rev.neto);verificar()">
    <div id="verif"></div>
    ${hayAnterior && !revOriginal ? `<div class="check no">Ya hay un recibo de ese mes: si guardás, se reemplaza.</div>` : ""}
    <div class="acciones" style="margin-top:12px"><button onclick="guardarRevision()">Guardar</button><button class="sec" onclick="cerrar()">Cancelar</button></div>`;
  verificar();
}
window.moverFila = (tipo, i) => {
  const otro = tipo === "haberes" ? "descuentos" : "haberes";
  rev[otro].push(rev[tipo].splice(i, 1)[0]); pintarRevision();
};
window.verificar = () => {
  const calc = Math.round((suma(rev.haberes) - suma(rev.descuentos)) * 100) / 100;
  const el = $("#verif"); if (!el) return;
  if (!rev.neto) { rev.neto = calc; }
  const ok = Math.abs(calc - rev.neto) < 0.02;
  el.innerHTML = `<div class="check ${ok ? "ok" : "no"}">${ok
    ? "✓ Las cuentas cierran: bruto " + plata(suma(rev.haberes)) + " − descuentos " + plata(suma(rev.descuentos)) + " = " + plata(calc)
    : "⚠ Haberes − descuentos da " + plata(calc) + ", pero el líquido dice " + plata(rev.neto) + ". Diferencia: " + plata(calc - rev.neto) + ". Revisá algún número."}</div>`;
};
window.guardarRevision = () => {
  if (!rev.periodo) return alert("Elegí el mes del recibo.");
  rev.haberes = rev.haberes.filter(x => x.concepto.trim() || x.monto);
  rev.descuentos = rev.descuentos.filter(x => x.concepto.trim() || x.monto);
  if (revOriginal && revOriginal !== rev.periodo) db.recibos = db.recibos.filter(r => r.periodo !== revOriginal);
  db.recibos = db.recibos.filter(r => r.periodo !== rev.periodo);
  rev.guardado = new Date().toISOString();
  db.recibos.push(rev);

  // Las deudas que se descuentan del sueldo suman una cuota pagada (una vez por mes).
  const marcadas = [];
  for (const d of db.deudas) {
    if (d.paga !== "recibo" || !d.concepto) continue;
    const linea = rev.descuentos.find(x => P.normalizar(x.concepto) === P.normalizar(d.concepto));
    d.pagos = d.pagos || [];
    if (linea && !d.pagos.includes(rev.periodo) && activa(d)) {
      d.pagos.push(rev.periodo); d.pagadas = (+d.pagadas || 0) + 1; marcadas.push(d.nombre);
    }
  }
  guardar(); cerrar();
  inMes.value = rev.periodo;
  render();
  aviso("Recibo guardado" + (marcadas.length ? " · cuota sumada en: " + marcadas.join(", ") : ""));
};
window.leerMonto = leerMonto; window.numStr = numStr; window.cerrar = cerrar; window.pintarRevision = pintarRevision;
Object.defineProperty(window, "rev", { get: () => rev });

// ---------- DEUDAS ----------
function renderDeudas() {
  const ds = [...db.deudas].sort((a, b) => (activa(b) - activa(a)) || restantes(a) - restantes(b));
  if (!ds.length) { $("#lista-deudas").innerHTML = `<div class="card vacio">Cargá tus deudas en cuotas: tarjeta, préstamos de la mutual, etc. Si una se descuenta del sueldo, la app suma la cuota sola cada vez que guardás el recibo.</div>`; return; }
  const total = suma(ds.filter(activa).map(d => ({ monto: d.cuota * restantes(d) })));
  $("#lista-deudas").innerHTML = `<div class="card"><h2>Total que falta pagar</h2><div class="big">${plata(total)}</div>
    <div class="muted">Por mes: ${plata(suma(ds.filter(activa).map(d => ({ monto: d.cuota }))))} en cuotas</div></div>` +
    ds.map(d => {
      const pct = d.cuotas ? Math.min(100, d.pagadas / d.cuotas * 100) : 0;
      return `<div class="card" style="${activa(d) ? "" : "opacity:.6"}">
        <div class="row" style="border:0;padding:0"><b>${esc(d.nombre)}</b><span class="n">${plata(d.cuota)}/mes</span></div>
        <div class="muted">${esc(COMO_PAGA[d.paga] || "")}${d.paga === "recibo" ? ": " + esc(d.concepto) : ""}</div>
        <div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
        <div class="row" style="border:0"><span class="muted">${d.pagadas || 0} de ${d.cuotas} cuotas pagadas</span>
          <span class="muted">${activa(d) ? "termina " + esc(nombreMes(finDeuda(d))) : "<span class='good'>✓ terminada</span>"}</span></div>
        ${activa(d) ? `<div class="row"><span>Falta pagar (${restantes(d)} cuotas)</span><span class="n">${plata(d.cuota * restantes(d))}</span></div>` : ""}
        ${d.nota ? `<div class="muted">${esc(d.nota)}</div>` : ""}
        <div class="acciones" style="margin:8px 0 0">
          ${activa(d) && d.paga !== "recibo" ? `<button class="sec" onclick="pagarCuota('${d.id}')">✓ Pagué una cuota</button>` : ""}
          <button class="sec" onclick="editarDeuda('${d.id}')">Editar</button></div></div>`;
    }).join("");
}
window.pagarCuota = i => { const d = db.deudas.find(x => x.id === i); d.pagadas = Math.min(d.cuotas, (+d.pagadas || 0) + 1); guardar(); render(); aviso("Cuota " + d.pagadas + " de " + d.cuotas); };
$("#nueva-deuda").onclick = () => editarDeuda(null);
window.editarDeuda = i => {
  const d = i ? db.deudas.find(x => x.id === i) : { id: id(), nombre: "", cuota: 0, cuotas: 12, pagadas: 0, inicio: "", paga: "sueldo", concepto: "", nota: "", pagos: [] };
  const ultimo = [...db.recibos].sort((a, b) => b.periodo.localeCompare(a.periodo))[0];
  const conceptos = ultimo ? ultimo.descuentos.map(x => x.concepto) : [];
  if (d.concepto && !conceptos.includes(d.concepto)) conceptos.push(d.concepto);
  $("#dlg-in").innerHTML = `<h3>${i ? "Editar deuda" : "Nueva deuda"}</h3>
    <label class="f">Nombre</label><input id="d-nombre" value="${esc(d.nombre)}" placeholder="Ej: Tarjeta Banco Ciudad">
    <div class="grid2"><div><label class="f">Monto de la cuota</label><input id="d-cuota" class="num" inputmode="decimal" value="${numStr(d.cuota)}"></div>
    <div><label class="f">Primera cuota (mes)</label><input id="d-inicio" type="month" value="${esc(d.inicio)}"></div>
    <div><label class="f">Cantidad de cuotas</label><input id="d-cuotas" type="number" min="1" value="${d.cuotas}"></div>
    <div><label class="f">Cuotas ya pagadas</label><input id="d-pagadas" type="number" min="0" value="${d.pagadas || 0}"></div></div>
    <label class="f">¿Con qué la pagás?</label>
    <select id="d-paga">
      <option value="sueldo" ${d.paga === "sueldo" ? "selected" : ""}>Con el sueldo</option>
      <option value="adicional" ${d.paga === "adicional" ? "selected" : ""}>Con el adicional</option>
      ${conceptos.length ? `<optgroup label="Me la descuentan del recibo">${conceptos.map((c, n) => `<option value="r${n}" ${d.paga === "recibo" && c === d.concepto ? "selected" : ""}>${esc(c)}</option>`).join("")}</optgroup>` : ""}
    </select>
    <div class="muted" style="margin-top:4px">Si te la descuentan del recibo, ya viene restada en el sueldo neto y suma la cuota sola cada mes.</div>
    <label class="f">Nota</label><input id="d-nota" value="${esc(d.nota)}" placeholder="Ej: ver si conviene pagar todo junto">
    <div class="acciones" style="margin-top:14px"><button id="d-ok">Guardar</button><button class="sec" onclick="cerrar()">Cancelar</button></div>
    ${i ? `<button class="danger" id="d-borrar">Borrar deuda</button>` : ""}`;
  dlg.showModal();
  $("#d-ok").onclick = () => {
    d.nombre = $("#d-nombre").value.trim() || "Deuda";
    d.cuota = leerMonto($("#d-cuota").value);
    d.cuotas = Math.max(1, parseInt($("#d-cuotas").value) || 1);
    d.pagadas = Math.min(d.cuotas, Math.max(0, parseInt($("#d-pagadas").value) || 0));
    const v = $("#d-paga").value;
    if (v[0] === "r") { d.paga = "recibo"; d.concepto = conceptos[+v.slice(1)]; } else { d.paga = v; d.concepto = ""; }
    d.inicio = $("#d-inicio").value; d.nota = $("#d-nota").value.trim();
    if (!i) db.deudas.push(d);
    guardar(); cerrar(); render();
  };
  if (i) $("#d-borrar").onclick = () => { if (confirm("¿Borrar " + d.nombre + "?")) { db.deudas = db.deudas.filter(x => x.id !== i); guardar(); cerrar(); render(); } };
};

// ---------- ADICIONAL (plata extra que entra en el mes) ----------
function renderAdicional() {
  const p = inMes.value, lista = adicionalesDe(p);
  const conAdic = db.deudas.filter(d => activa(d) && d.paga === "adicional");
  const total = suma(lista), cuotas = suma(conAdic.map(d => ({ monto: d.cuota })));
  let h = `<div class="card"><h2>Adicional de ${esc(nombreMes(p))}</h2><div class="big">${plata(total)}</div>
    <div class="muted">${lista.length ? lista.length + " ingreso" + (lista.length > 1 ? "s" : "") : "Todavía no cargaste nada este mes"}</div></div>
    <div class="card"><h2>Lo que entró</h2>`;
  h += lista.length ? lista.map(a => `<div class="row"><span>${esc(a.concepto)}</span><span><span class="n">${plata(a.monto)}</span>
      <button class="danger" onclick="borrarAdicional('${a.id}')">✕</button></span></div>`).join("") : `<div class="muted">Nada cargado.</div>`;
  h += `<div class="edit" style="grid-template-columns:1fr 120px;margin-top:12px"><input id="a-concepto" placeholder="De dónde (ej: horas extra)">
      <input id="a-monto" class="num" inputmode="decimal" placeholder="0,00"></div>
    <button onclick="agregarAdicional()" style="width:100%">Agregar adicional</button></div>`;
  if (conAdic.length) {
    h += `<div class="card"><h2>Cuotas que pagás con el adicional</h2>`;
    h += conAdic.map(d => `<div class="row"><span>${esc(d.nombre)}<br><span class="muted">cuota ${(+d.pagadas || 0) + 1} de ${d.cuotas}</span></span><span class="n">${plata(d.cuota)}</span></div>`).join("");
    const queda = total - cuotas;
    h += `<div class="row"><b>Te queda del adicional</b><span class="n ${queda < 0 ? "bad" : "good"}">${plata(queda)}</span></div></div>`;
  }
  $("#t-adicional").innerHTML = h;
}
window.agregarAdicional = () => {
  const concepto = $("#a-concepto").value.trim() || "Adicional", m = leerMonto($("#a-monto").value);
  if (!m) return aviso("Poné el monto");
  const p = inMes.value; (db.adicionales[p] = db.adicionales[p] || []).push({ id: id(), concepto, monto: m });
  guardar(); render(); aviso("Adicional agregado");
};
window.borrarAdicional = i => { const p = inMes.value; db.adicionales[p] = adicionalesDe(p).filter(a => a.id !== i); guardar(); render(); };

// ---------- PRÉSTAMOS (mutuales) ----------
// Las cuotas se cuentan solas por mes desde la primera cuota hasta el mes elegido arriba.
const mesesEntre = (a, b) => { const [ya, ma] = a.split("-").map(Number), [yb, mb] = b.split("-").map(Number); return (yb * 12 + mb) - (ya * 12 + ma); };
const pagadasEn = (p, m) => !p.inicio || p.inicio > m ? 0 : Math.min(p.cuotas, mesesEntre(p.inicio, m) + 1);
const ultimaCuota = p => sumarMeses(p.inicio, p.cuotas - 1);

function renderPrestamos() {
  const m = inMes.value, ps = db.prestamos;
  if (!ps.length) {
    $("#lista-prestamos").innerHTML = `<div class="card vacio">Cargá los préstamos de las mutuales: cuánto es la cuota, cuántas cuotas son y cuándo es la primera.<br><br>La app cuenta sola cuántas vas pagando cada mes y cuántas te faltan.</div>`;
    return;
  }
  const estado = p => pagadasEn(p, m) >= p.cuotas ? 2 : p.inicio > m ? 1 : 0; // 0 en curso, 1 por empezar, 2 terminado
  const lista = [...ps].sort((a, b) => estado(a) - estado(b) || (a.cuotas - pagadasEn(a, m)) - (b.cuotas - pagadasEn(b, m)));
  const enCurso = ps.filter(p => estado(p) === 0);
  const falta = suma(ps.map(p => ({ monto: p.cuota * (p.cuotas - pagadasEn(p, m)) })));
  let h = `<div class="card"><h2>Préstamos a ${esc(nombreMes(m))}</h2>
    <div class="big">${plata(falta)}</div><div class="muted">en total te falta pagar</div>
    <div class="row" style="margin-top:8px"><span>Cuotas de este mes (${enCurso.length})</span><span class="n">${plata(suma(enCurso.map(p => ({ monto: p.cuota }))))}</span></div>
    <div class="muted" style="margin-top:6px">Cambiá el mes de arriba para ver cómo vas a estar más adelante.</div></div>`;
  for (const p of lista) {
    const pag = pagadasEn(p, m), faltan = p.cuotas - pag, e = estado(p);
    h += `<div class="card" style="${e === 2 ? "opacity:.6" : ""}">
      <div class="row" style="border:0;padding:0"><b>${esc(p.nombre)}</b><span class="n">${plata(p.cuota)}/mes</span></div>
      ${e === 1 ? `<div class="mid warn" style="margin-top:6px">Empieza en ${esc(nombreMes(p.inicio))}</div>
          <div class="muted">${p.cuotas} cuotas · la última en ${esc(nombreMes(ultimaCuota(p)))}</div>`
        : e === 2 ? `<div class="mid good" style="margin-top:6px">✓ Terminado</div><div class="muted">Pagaste las ${p.cuotas} cuotas (la última en ${esc(nombreMes(ultimaCuota(p)))})</div>`
        : `<div class="mid" style="margin-top:6px">Vas ${pag} de ${p.cuotas} cuotas</div>
          <div class="bar"><i style="width:${(pag / p.cuotas * 100).toFixed(1)}%"></i></div>
          <div class="muted" style="margin-top:4px">Faltan ${faltan} · la última es en ${esc(nombreMes(ultimaCuota(p)))}</div>`}
      ${e !== 2 ? `<div class="row"><span>Falta pagar</span><span class="n">${plata(p.cuota * faltan)}</span></div>` : ""}
      <div class="acciones" style="margin:8px 0 0"><button class="sec" onclick="editarPrestamo('${p.id}')">Editar</button></div></div>`;
  }
  $("#lista-prestamos").innerHTML = h;
}
$("#nuevo-prestamo").onclick = () => editarPrestamo(null);
window.editarPrestamo = i => {
  const m = inMes.value;
  const p = i ? db.prestamos.find(x => x.id === i) : { id: id(), nombre: "", cuota: 0, cuotas: 12, inicio: "" };
  $("#dlg-in").innerHTML = `<h3>${i ? "Editar préstamo" : "Nuevo préstamo"}</h3>
    <label class="f">Mutual / préstamo</label><input id="p-nombre" value="${esc(p.nombre)}" placeholder="Ej: Mutual Hospital">
    <div class="grid2"><div><label class="f">Monto de la cuota</label><input id="p-cuota" class="num" inputmode="decimal" value="${numStr(p.cuota)}"></div>
    <div><label class="f">Cantidad de cuotas</label><input id="p-cuotas" type="number" min="1" value="${p.cuotas}"></div></div>
    <label class="f">Primera cuota (mes)</label><input id="p-inicio" type="month" value="${esc(p.inicio)}">
    <label class="f">…o si no te acordás: ¿cuántas cuotas pagaste hasta ${esc(nombreMes(m))} inclusive?</label>
    <input id="p-pagadas" type="number" min="0" value="${p.inicio ? pagadasEn(p, m) : ""}" placeholder="Ej: 5">
    <div class="muted" id="p-info" style="margin-top:8px"></div>
    <div class="acciones" style="margin-top:14px"><button id="p-ok">Guardar</button><button class="sec" onclick="cerrar()">Cancelar</button></div>
    ${i ? `<button class="danger" id="p-borrar">Borrar préstamo</button>` : ""}`;
  dlg.showModal();
  const info = () => {
    const t = { inicio: $("#p-inicio").value, cuotas: Math.max(1, parseInt($("#p-cuotas").value) || 1) };
    $("#p-info").textContent = t.inicio ? (t.inicio > m ? "Empieza en " + nombreMes(t.inicio) + "." : "Vas " + pagadasEn(t, m) + " de " + t.cuotas + ".") + " Última cuota: " + nombreMes(ultimaCuota(t)) + "." : "";
  };
  // Si pone cuántas pagó, calculo el mes de la primera cuota (y al revés).
  $("#p-pagadas").oninput = () => {
    const n = parseInt($("#p-pagadas").value);
    if (n >= 0) $("#p-inicio").value = sumarMeses(m, 1 - n);
    info();
  };
  $("#p-inicio").oninput = () => { const t = { inicio: $("#p-inicio").value, cuotas: parseInt($("#p-cuotas").value) || 1 }; $("#p-pagadas").value = t.inicio ? pagadasEn(t, m) : ""; info(); };
  $("#p-cuotas").oninput = info;
  info();
  $("#p-ok").onclick = () => {
    if (!$("#p-inicio").value) return alert("Poné el mes de la primera cuota o cuántas pagaste.");
    p.nombre = $("#p-nombre").value.trim() || "Préstamo";
    p.cuota = leerMonto($("#p-cuota").value);
    p.cuotas = Math.max(1, parseInt($("#p-cuotas").value) || 1);
    p.inicio = $("#p-inicio").value;
    if (!i) db.prestamos.push(p);
    guardar(); cerrar(); render();
  };
  if (i) $("#p-borrar").onclick = () => { if (confirm("¿Borrar " + p.nombre + "?")) { db.prestamos = db.prestamos.filter(x => x.id !== i); guardar(); cerrar(); render(); } };
};

// ---------- GASTOS ----------
function renderGastos() {
  const p = inMes.value, lista = gastosDe(p);
  const fijo = c => lista.find(g => g.fijo && g.cat === c);
  let h = `<div class="card"><h2>Gastos de ${esc(nombreMes(p))}</h2><div class="big">${plata(suma(lista))}</div></div>
    <div class="card"><h2>Gastos fijos</h2>`;
  db.fijos.forEach((c, n) => {
    const g = fijo(c);
    h += `<div class="edit" style="grid-template-columns:1fr 130px 34px"><span>${esc(c)}</span>
      <input class="num" inputmode="decimal" placeholder="0,00" value="${g ? numStr(g.monto) : ""}" onchange="ponerFijo(db.fijos[${n}], this.value)">
      <button title="Quitar de la lista" onclick="quitarFijo(db.fijos[${n}])">✕</button></div>`;
  });
  h += `<div class="acciones" style="margin-top:8px"><button class="sec" onclick="copiarFijos()">Copiar del mes anterior</button>
    <button class="sec" onclick="nuevoFijo()">＋ Otro fijo</button></div></div>
    <div class="card"><h2>Otros gastos</h2>`;
  const otros = lista.filter(g => !g.fijo);
  h += otros.length ? otros.map(g => `<div class="row"><span>${esc(g.cat)}</span><span><span class="n">${plata(g.monto)}</span>
      <button class="danger" onclick="borrarGasto('${g.id}')">✕</button></span></div>`).join("") : `<div class="muted">Nada cargado.</div>`;
  h += `<div class="edit" style="grid-template-columns:1fr 120px;margin-top:12px"><input id="g-cat" placeholder="Concepto (ej: farmacia)">
      <input id="g-monto" class="num" inputmode="decimal" placeholder="0,00"></div>
    <button onclick="agregarGasto()" style="width:100%">Agregar gasto</button></div>`;
  $("#t-gastos").innerHTML = h;
}
function listaMes(p) { return db.gastos[p] = db.gastos[p] || []; }
window.ponerFijo = (c, v) => {
  const l = listaMes(inMes.value), m = leerMonto(v), g = l.find(x => x.fijo && x.cat === c);
  if (!m) db.gastos[inMes.value] = l.filter(x => x !== g);
  else if (g) g.monto = m; else l.push({ id: id(), cat: c, monto: m, fijo: true });
  guardar(); render();
};
window.copiarFijos = () => {
  const ant = gastosDe(mesAnterior(inMes.value)).filter(g => g.fijo);
  if (!ant.length) return aviso("El mes anterior no tiene fijos cargados");
  const l = listaMes(inMes.value);
  for (const g of ant) if (!l.find(x => x.fijo && x.cat === g.cat)) l.push({ id: id(), cat: g.cat, monto: g.monto, fijo: true });
  guardar(); render(); aviso("Copiados. Ajustá los que cambiaron.");
};
window.nuevoFijo = () => { const c = (prompt("Nombre del gasto fijo (ej: Alquiler)") || "").trim(); if (c && !db.fijos.includes(c)) { db.fijos.push(c); guardar(); render(); } };
window.quitarFijo = c => { if (confirm("¿Sacar \"" + c + "\" de la lista de fijos? Los montos ya cargados se mantienen en otros meses.")) { db.fijos = db.fijos.filter(x => x !== c); const l = listaMes(inMes.value); db.gastos[inMes.value] = l.filter(x => !(x.fijo && x.cat === c)); guardar(); render(); } };
window.agregarGasto = () => {
  const cat = $("#g-cat").value.trim(), m = leerMonto($("#g-monto").value);
  if (!cat || !m) return aviso("Poné concepto y monto");
  listaMes(inMes.value).push({ id: id(), cat, monto: m }); guardar(); render();
};
window.borrarGasto = i => { db.gastos[inMes.value] = gastosDe(inMes.value).filter(g => g.id !== i); guardar(); render(); };

// ---------- inicio ----------
render();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
