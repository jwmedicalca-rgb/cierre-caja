// Función de Supabase: suma las ventas del POS de Shopify de un día, por forma de pago.
// Secretos (Edge Functions → Secrets):
//   SHOPIFY_STORE          6f6290.myshopify.com
//   SHOPIFY_CLIENT_ID      Client ID de la app del Dev Dashboard de Shopify
//   SHOPIFY_CLIENT_SECRET  Client secret de esa app
//   (opcional) SHOPIFY_ADMIN_TOKEN  si ya tienes un token shpat_ de una app antigua, se usa en lugar de los dos anteriores
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const API_VERSION = "2026-04";
const STORE = Deno.env.get("SHOPIFY_STORE") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

let cache: { token: string; exp: number } | null = null;
async function shopifyToken(): Promise<string> {
  const fijo = Deno.env.get("SHOPIFY_ADMIN_TOKEN");
  if (fijo) return fijo;
  if (cache && cache.exp > Date.now() + 60_000) return cache.token;
  const r = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: Deno.env.get("SHOPIFY_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "",
    }),
  });
  if (!r.ok) throw new Error(`Shopify no entregó el acceso (${r.status}). Revisa SHOPIFY_CLIENT_ID y SHOPIFY_CLIENT_SECRET.`);
  const j = await r.json();
  cache = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 86399) * 1000 };
  return cache.token;
}

const QUERY = `query($q:String,$after:String){ orders(first:100, after:$after, sortKey:CREATED_AT, query:$q){
  pageInfo{ hasNextPage endCursor }
  nodes{ cancelledAt transactions(first:20){ gateway kind status amountSet{ shopMoney{ amount } } } } } }`;

function diaSiguiente(f: string) {
  const d = new Date(f + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Usa POST" }, 405);

  // Solo usuarios con sesión iniciada en la página.
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "Tu sesión venció. Sal y vuelve a entrar." }, 401);

  const { fecha } = await req.json().catch(() => ({}));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? "")) return json({ error: "Fecha inválida." }, 400);
  if (!STORE) return json({ error: "Falta el secreto SHOPIFY_STORE en Supabase." }, 500);

  const q = `source_name:pos created_at:>='${fecha}T00:00:00-04:00' created_at:<'${diaSiguiente(fecha)}T00:00:00-04:00'`;
  const porGateway: Record<string, number> = {};
  let pedidos = 0, after: string | null = null;
  try {
    const token = await shopifyToken();
    for (let i = 0; i < 20; i++) {
      const r = await fetch(`https://${STORE}/admin/api/${API_VERSION}/graphql.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
        body: JSON.stringify({ query: QUERY, variables: { q, after } }),
      });
      if (r.status === 401 || r.status === 403) { cache = null; throw new Error("Shopify rechazó el acceso. La app necesita el permiso read_orders."); }
      if (!r.ok) throw new Error(`Shopify respondió ${r.status}. Intenta de nuevo.`);
      const j = await r.json();
      if (j.errors) throw new Error("Shopify rechazó la consulta: " + (j.errors[0]?.message ?? "error"));
      const o = j.data.orders;
      for (const ord of o.nodes) {
        if (ord.cancelledAt) continue;
        pedidos++;
        for (const t of ord.transactions ?? []) {
          if (t.status !== "SUCCESS") continue;
          const signo = t.kind === "SALE" || t.kind === "CAPTURE" ? 1 : t.kind === "REFUND" ? -1 : 0;
          if (!signo) continue;
          const g = (t.gateway ?? "Otro").trim();
          porGateway[g] = (porGateway[g] ?? 0) + signo * Number(t.amountSet?.shopMoney?.amount ?? 0);
        }
      }
      if (!o.pageInfo.hasNextPage) break;
      after = o.pageInfo.endCursor;
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
  const gateways = Object.entries(porGateway).map(([gateway, monto]) => ({ gateway, monto: Math.round(monto * 100) / 100 }));
  return json({ fecha, pedidos, gateways });
});
