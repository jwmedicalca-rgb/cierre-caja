# Cierre de caja · Uniformes Caracas

Cierre de caja diario de la tienda física: trae las ventas del POS de Shopify por forma de pago, los datos de Cashea del día, y los compara con lo contado en gaveta y banco. Guarda el historial en Supabase.

Página: https://jwmedicalca-rgb.github.io/cierre-caja/

## Cómo está armado

| Parte | Dónde vive | Qué hace |
|---|---|---|
| `index.html` | GitHub Pages | La página del cierre, con inicio de sesión |
| `config.js` | GitHub Pages | URL y anon key de Supabase (públicas) |
| `supabase/schema.sql` | Supabase | Tablas `cierres` y `cashea`, con acceso solo para usuarios con sesión |
| `supabase/functions/shopify-pos` | Supabase Edge Functions | Lee las ventas del POS en Shopify con credenciales que nunca salen del servidor |
| `supabase/cashea-agente.sql` | Supabase | Tablas `solicitudes_cashea` y `agente_cashea` para el botón "Cargar Cashea" |
| `agente-cashea/` | Mac mini | Agente que lee Cashea cuando se pulsa el botón y lo guarda en Supabase |

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

Cashea no tiene API pública, así que los datos se leen de su portal (merchants.cashea.app) con la sesión de la tienda. Hay dos caminos, y los dos guardan en la tabla `cashea`:

- **Botón "Cargar Cashea" (agente en la Mac mini).** La página deja una fila en `solicitudes_cashea`; el agente de `agente-cashea/`, que corre en la Mac mini, la ve en segundos, abre la conciliación diaria con la sesión guardada, guarda el cierre del día y los dos días anteriores del historial, y marca la solicitud como lista. Solo lee Cashea; nunca pulsa botones allí.
- **Tarea de Claude** que lee Cashea en Chrome y llama a `window.cierreAPI.guardarCashea({fecha, facturado, financiado, ordenes})` desde esta página abierta con sesión.

También se pueden escribir a mano en la fila de Cashea.

### Instalar el agente en la Mac mini

1. **Tablas.** Supabase → SQL Editor → pega `supabase/cashea-agente.sql` → Run.
2. **Usuario del agente.** Supabase → Authentication → Users → *Add user*, por ejemplo `agente@uniformescaracas.com` con una clave larga (marca *Auto Confirm User*).
3. **Node.js.** Si la Mac no lo tiene, instálalo desde https://nodejs.org (LTS).
4. **Instalar.** En Terminal:
   ```bash
   git clone https://github.com/jwmedicalca-rgb/cierre-caja.git ~/cierre-caja
   cd ~/cierre-caja/agente-cashea
   bash instalar.sh
   ```
   El script instala lo necesario, abre `.env` para que pongas el correo y la clave del usuario del agente, abre Cashea para que inicies sesión una vez, hace una lectura de prueba y deja el agente corriendo siempre (arranca solo al reiniciar la Mac).

El `.env`, la sesión de Cashea (`perfil-cashea/`) y el registro (`agente.log`) se quedan solo en la Mac; nunca se suben a GitHub.

- Ver qué hace: `tail -f ~/cierre-caja/agente-cashea/agente.log`
- Si Cashea cierra la sesión: `launchctl unload ~/Library/LaunchAgents/com.uniformescaracas.agente-cashea.plist && node agente.js --login && launchctl load ~/Library/LaunchAgents/com.uniformescaracas.agente-cashea.plist`
- Actualizar el agente: `cd ~/cierre-caja && git pull`, y luego `launchctl unload …plist && launchctl load …plist`.
