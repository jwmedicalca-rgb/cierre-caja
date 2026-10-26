# Cierre de caja · Uniformes Caracas

Cierre de caja diario de la tienda física: trae las ventas del POS de Shopify por forma de pago, los datos de Cashea del día, y los compara con lo contado en gaveta y banco. Guarda el historial en Supabase.

Página: https://arfe5555.github.io/cierre-caja/

## Cómo está armado

| Parte | Dónde vive | Qué hace |
|---|---|---|
| `index.html` | GitHub Pages | La página del cierre, con inicio de sesión |
| `config.js` | GitHub Pages | URL y anon key de Supabase (públicas) |
| `supabase/schema.sql` | Supabase | Tablas `cierres` y `cashea`, con acceso solo para usuarios con sesión |
| `supabase/functions/shopify-pos` | Supabase Edge Functions | Lee las ventas del POS en Shopify con credenciales que nunca salen del servidor |

## Puesta en marcha

1. **Base de datos.** Supabase → SQL Editor → pega `supabase/schema.sql` → Run.
2. **Usuarios.** Supabase → Authentication → Users → *Add user* con correo y clave para cada persona que hace el cierre. Luego en Authentication → Sign In / Providers desactiva *Allow new users to sign up*, para que nadie más pueda crearse una cuenta.
3. **Acceso a Shopify.** En el Dev Dashboard de Shopify crea una app para la tienda con el permiso `read_orders`, instálala en la tienda y copia su *Client ID* y *Client secret*.
4. **Función.** Supabase → Edge Functions → *Deploy a new function* → *Via Editor*, nómbrala `shopify-pos` y pega `supabase/functions/shopify-pos/index.ts`. En Edge Functions → Secrets agrega:
   - `SHOPIFY_STORE` = `6f6290.myshopify.com`
   - `SHOPIFY_CLIENT_ID` = el Client ID
   - `SHOPIFY_CLIENT_SECRET` = el Client secret
5. **Config.** Pon la Project URL y la anon key en `config.js`.

## Datos de Cashea

Cashea no tiene API pública. Una tarea programada de Claude lee la conciliación diaria en Chrome y la guarda con `window.cierreAPI.guardarCashea({fecha, facturado, financiado, ordenes})` desde esta página abierta con sesión iniciada. También se pueden escribir a mano en la fila de Cashea.
