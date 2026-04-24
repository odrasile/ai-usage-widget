# AI Usage Widget

Widget desktop para Windows y Ubuntu que muestra el uso disponible de Codex y Claude Code usando sus CLIs locales.

## Requisitos

- Windows o Ubuntu
- Node.js 20 o superior
- Rust y Cargo para compilar Tauri
- CLI `codex` y/o `claude` instaladas si se quieren ver datos reales

## Dependencias Ubuntu

En Ubuntu, instala ademas las dependencias habituales de Tauri/WebKitGTK:

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

## Instalacion

```bash
npm install
```

## Desarrollo

```bash
npm run tauri dev
```

La ventana se abre como widget flotante, sin bordes y siempre visible.

En Windows la transparencia del widget es un objetivo razonable. En Linux no debe asumirse transparencia real: Tauri depende de WebKitGTK y el resultado final tambien depende del compositor y del entorno grafico. El fallback soportado en Linux es un panel oscuro estable y legible.

## Build

### Windows

```bash
npm run tauri build
```

El ejecutable se genera bajo `src-tauri/target/release/bundle`.

No distribuyas solo el `.exe` suelto movido a otra carpeta. La app necesita recursos empaquetados junto al bundle, incluyendo el backend Node y `node-pty`. Para uso normal instala desde el `.msi` o el instalador NSIS generado por Tauri.

### Ubuntu

```bash
npm run tauri build
```

En Ubuntu el bundle saldra bajo `src-tauri/target/release/bundle`, normalmente como `.deb` y/o AppImage segun tu entorno.

## Configuracion opcional

Crear `config.json` en la raiz:

```json
{
  "refresh_interval_sec": 45
}
```

El valor se limita entre 30 y 60 segundos.

## Scripts

- `npm run dev`: servidor Vite del frontend
- `npm run build`: compila TypeScript y genera `dist`
- `npm run tauri dev`: ejecuta la app Tauri
- `npm run tauri build`: genera build Windows
- `npm run tauri build`: genera build para la plataforma actual
- `npm test`: valida parsers con outputs simulados

## Seguridad

El backend solo permite ejecutar comandos de la whitelist:

- `where codex` / `which codex`
- `where claude` / `which claude`
- `codex ...`
- `claude ...`

Cada proceso usa timeout y los fallos de una CLI no bloquean el widget.
