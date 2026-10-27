/* Agente Cashea · Uniformes Caracas
   Corre en la Mac mini. Cuando alguien pulsa "Cargar Cashea" en la página del cierre,
   abre la conciliación diaria de Cashea (con la sesión guardada en ./perfil-cashea),
   lee el cierre del día y los días anteriores del historial, y los guarda en Supabase.
   Solo LEE Cashea: nunca pulsa botones allí.

   Uso:
     node agente.js --login     abre Cashea con ventana para iniciar sesión (una vez)
     node agente.js --una-vez   lee Cashea una vez, guarda y termina (prueba)
     node agente.js             se queda escuchando solicitudes (modo normal)
*/
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const VERSION = "1.0.0";
const URL_CASHEA = "https://merchants.cashea.app/daily-conciliation";
const PERFIL = path.join(DIR, "perfil-cashea");
const CADA_MS = 3000;          // cada cuánto revisa si hay solicitudes
const LATIDO_MS = 30000;       // cada cuánto avisa que está vivo
const VENCE_MS = 10 * 60e3;    // solicitudes más viejas que esto se descartan
const DIAS_HISTORIAL = 2;      // días anteriores del historial que también guarda

/* ---------- configuración ---------- */
function cargarEnv() {
  const f = path.join(DIR, ".env");
  if (!fs.existsSync(f)) return;
  for (const linea of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
cargarEnv();
const log = (...a) => console.log(new Date().toLocaleString("es-VE"), "·", ...a);

const args = process.argv.slice(2);
const MODO_LOGIN = args.includes("--login");
const UNA_VEZ = args.includes("--una-vez");
const HEADLESS = (process.env.HEADLESS ?? "1") !== "0";

const { chromium } = require("playwright");

/* ---------- lectura de Cashea ---------- */
const num = (s) => parseFloat(String(s).replace(/[$\s,]/g, ""));
const aISO = (dmy) => { const [d, m, y] = dmy.split("/"); return `${y}-${m}-${d}`; };

function parsear(texto) {
  const t = texto.replace(/ /g, " ");
  const hoy = t.match(/Cierre de caja del d[ií]a:?\s*(\d{2}\/\d{2}\/\d{4})[\s\S]*?[ÓO]rdenes del d[ií]a:?\s*(\d+)[\s\S]*?Total facturado:?\s*\$\s*([\d.,]+)[\s\S]*?Total financiado por Cashea:?\s*\$\s*([\d.,]+)/i);
  if (!hoy) return null;
  const dias = [{ fecha: aISO(hoy[1]), ordenes: +hoy[2], facturado: num(hoy[3]), financiado: num(hoy[4]) }];
  const historial = t.slice(0, t.search(/Cierre de caja del d[ií]a/i));
  const re = /(\d{2}\/\d{2}\/\d{4})\s+\d{1,2}:\d{2}[^\n]*\s+[ÓO]rdenes del d[ií]a:?\s*(\d+)\s+Facturado\s*\/\s*Financiado:?\s*\$\s*([\d.,]+)\s*\/\s*\$\s*([\d.,]+)/gi;
  const vistos = new Set([dias[0].fecha]);
  const previos = [];
  for (const m of historial.matchAll(re)) {
    const fecha = aISO(m[1]);
    if (fecha >= dias[0].fecha || vistos.has(fecha)) continue; // el día de hoy sale solo del cierre del día
    vistos.add(fecha);
    previos.push({ fecha, ordenes: +m[2], facturado: num(m[3]), financiado: num(m[4]) });
  }
  previos.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  return dias.concat(previos.slice(0, DIAS_HISTORIAL));
}

let ctx = null;
async function contexto(headless = HEADLESS) {
  if (ctx) return ctx;
  ctx = await chromium.launchPersistentContext(PERFIL, { headless, viewport: { width: 1280, height: 900 }, locale: "es-VE" });
  ctx.on("close", () => { ctx = null; });
  return ctx;
}

async function leerCashea() {
  const c = await contexto();
  const page = await c.newPage();
  try {
    await page.goto(URL_CASHEA, { waitUntil: "domcontentloaded", timeout: 45000 });
    try {
      await page.waitForFunction(
        () => /Total financiado por Cashea[\s\S]*?\$\s*[\d.,]+/i.test(document.body.innerText),
        null, { timeout: 30000 });
    } catch {
      const url = page.url();
      const txt = (await page.innerText("body").catch(() => "")).slice(0, 400);
      if (!url.includes("daily-conciliation") || /iniciar sesi[oó]n|ingresa|contrase[ñn]a|login/i.test(txt))
        throw new Error("Cashea pide iniciar sesión de nuevo (corre: node agente.js --login)");
      throw new Error("La página de Cashea no mostró el cierre de caja");
    }
    await page.waitForTimeout(1500); // deja terminar de cargar los montos
    const dias = parsear(await page.innerText("body"));
    if (!dias) throw new Error("No se encontraron los datos del cierre en la página de Cashea");
    return dias;
  } finally {
    await page.close().catch(() => {});
  }
}

/* ---------- Supabase ---------- */
let sb = null;
async function conectar() {
  const { createClient } = require("@supabase/supabase-js");
  const { SUPABASE_URL, SUPABASE_ANON_KEY, AGENTE_EMAIL, AGENTE_CLAVE } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !AGENTE_EMAIL || !AGENTE_CLAVE)
    throw new Error("Falta llenar SUPABASE_URL, SUPABASE_ANON_KEY, AGENTE_EMAIL y AGENTE_CLAVE en el archivo .env");
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: true } });
  const { error } = await sb.auth.signInWithPassword({ email: AGENTE_EMAIL, password: AGENTE_CLAVE });
  if (error) throw new Error("No se pudo entrar a Supabase con el usuario del agente: " + error.message);
  log("Conectado a Supabase como", AGENTE_EMAIL);
}

async function guardarDias(dias) {
  const ahora = new Date().toISOString();
  const filas = dias.map((d) => ({ ...d, leido_en: ahora }));
  const { error } = await sb.from("cashea").upsert(filas);
  if (error) throw new Error("Supabase no aceptó los datos: " + error.message);
}

async function latido() {
  const { error } = await sb.from("agente_cashea").upsert({ id: 1, visto_en: new Date().toISOString(), version: VERSION });
  if (error) log("No se pudo marcar el latido:", error.message);
}

const resumen = (dias) => dias.map((d) => `${d.fecha.split("-").reverse().join("/")}: ${d.ordenes} órdenes · $${d.facturado.toFixed(2)} / $${d.financiado.toFixed(2)}`).join(" | ");

let ocupado = false;
async function atender() {
  if (ocupado) return;
  ocupado = true;
  try {
    const { data, error } = await sb.from("solicitudes_cashea").select("id,creada_en")
      .eq("estado", "pendiente").order("creada_en", { ascending: true }).limit(5);
    if (error) { log("Error leyendo solicitudes:", error.message); return; }
    for (const s of data || []) {
      if (Date.now() - new Date(s.creada_en).getTime() > VENCE_MS) {
        await sb.from("solicitudes_cashea").update({ estado: "vencida", mensaje: "El agente no estaba encendido cuando se pidió", atendida_en: new Date().toISOString() }).eq("id", s.id);
        continue;
      }
      // La toma (solo si sigue pendiente, por si hay dos agentes)
      const { data: tomada } = await sb.from("solicitudes_cashea").update({ estado: "procesando" })
        .eq("id", s.id).eq("estado", "pendiente").select("id");
      if (!tomada || !tomada.length) continue;
      log("Solicitud", s.id, "→ leyendo Cashea…");
      try {
        const dias = await leerCashea();
        await guardarDias(dias);
        const msg = resumen(dias);
        await sb.from("solicitudes_cashea").update({ estado: "listo", mensaje: msg, resultado: dias, atendida_en: new Date().toISOString() }).eq("id", s.id);
        log("Solicitud", s.id, "lista:", msg);
      } catch (e) {
        await sb.from("solicitudes_cashea").update({ estado: "error", mensaje: e.message, atendida_en: new Date().toISOString() }).eq("id", s.id);
        log("Solicitud", s.id, "con error:", e.message);
        if (ctx && /Target closed|browser has been closed/i.test(e.message)) ctx = null;
      }
    }
  } finally {
    ocupado = false;
  }
}

/* ---------- modos ---------- */
async function modoLogin() {
  const c = await contexto(false);
  const page = c.pages()[0] || (await c.newPage());
  await page.goto(URL_CASHEA);
  log("Inicia sesión en Cashea en la ventana que se abrió.");
  log("Cuando veas el \"Cierre de caja del día\", cierra esa ventana. La sesión queda guardada para el agente.");
  await new Promise((r) => c.on("close", r));
  log("Listo. Ya puedes correr: node agente.js --una-vez");
}

async function modoUnaVez() {
  await conectar();
  const dias = await leerCashea();
  await guardarDias(dias);
  log("Guardado en Supabase:", resumen(dias));
}

async function modoAgente() {
  await conectar();
  await latido();
  setInterval(latido, LATIDO_MS);
  log("Escuchando solicitudes de \"Cargar Cashea\"…");
  setInterval(() => atender().catch((e) => log("Error:", e.message)), CADA_MS);
  atender().catch((e) => log("Error:", e.message));
}

const salir = async (code) => { if (ctx) await ctx.close().catch(() => {}); process.exit(code); };
process.on("SIGINT", () => salir(0));
process.on("SIGTERM", () => salir(0));

if (require.main === module) {
  (MODO_LOGIN ? modoLogin() : UNA_VEZ ? modoUnaVez() : modoAgente())
    .then(() => { if (MODO_LOGIN || UNA_VEZ) salir(0); })
    .catch((e) => { log("Error:", e.message); salir(1); });
}

module.exports = { parsear };
