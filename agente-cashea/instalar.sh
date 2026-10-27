#!/bin/bash
# Instala el agente de Cashea en esta Mac y lo deja corriendo siempre (también al reiniciar).
# Uso:  bash instalar.sh
set -e
cd "$(dirname "$0")"
DIR="$(pwd)"
ETIQUETA="com.uniformescaracas.agente-cashea"
PLIST="$HOME/Library/LaunchAgents/$ETIQUETA.plist"

echo "== Agente Cashea · Uniformes Caracas =="

NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "Falta Node.js. Descárgalo de https://nodejs.org (botón LTS), instálalo y vuelve a correr: bash instalar.sh"
  exit 1
fi
echo "Node: $("$NODE" -v)"

echo "1/4 Instalando dependencias…"
npm install --no-fund --no-audit
npx playwright install chromium

if [ ! -f .env ] || ! grep -q '^AGENTE_CLAVE=.\+' .env; then
  [ -f .env ] || cp .env.example .env
  echo
  echo "2/4 Llena el archivo .env que se va a abrir: AGENTE_EMAIL y AGENTE_CLAVE"
  echo "    (el usuario de Supabase con el que el agente entra). Guarda y cierra el archivo."
  open -e .env || true
  read -r -p "    Cuando hayas guardado .env, pulsa Enter… " _
fi

echo
launchctl unload "$PLIST" 2>/dev/null || true   # por si ya estaba corriendo (usa el mismo perfil)
echo "3/4 Inicia sesión en Cashea en la ventana que se abre y luego ciérrala."
"$NODE" agente.js --login

echo
echo "    Probando una lectura…"
"$NODE" agente.js --una-vez

echo
echo "4/4 Dejando el agente corriendo en segundo plano…"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ETIQUETA</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$DIR/agente.js</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$DIR/agente.log</string>
  <key>StandardErrorPath</key><string>$DIR/agente.log</string>
</dict>
</plist>
EOF
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo
echo "Listo. El agente queda escuchando el botón \"Cargar Cashea\" de la página."
echo "Ver lo que hace:      tail -f \"$DIR/agente.log\""
echo "Detenerlo:            launchctl unload \"$PLIST\""
echo "Si Cashea cierra la sesión: launchctl unload \"$PLIST\" && node agente.js --login && launchctl load \"$PLIST\""
