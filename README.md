# AI Usage Widget

Widget desktop para macOS, Windows y Ubuntu que muestra el uso disponible de Codex, Claude Code y Gemini usando sus CLIs locales.

## Estado del repositorio

- Licencia: MIT
- Autor: Elisardo González Agulla
- Stack: Tauri + TypeScript + backend Node local

## Publicacion en GitHub

El repositorio queda preparado para publicarse con:

- `README.md`
- `LICENSE`
- `.gitignore`
- `.gitattributes`
- `CONTRIBUTING.md`
- `SECURITY.md`
- plantillas basicas de issues y pull request en `.github/`

## Requisitos

- macOS, Windows o Ubuntu
- Node.js 20 o superior
- Rust y Cargo para compilar Tauri
- CLI `codex` y/o `claude` instaladas si se quieren ver datos reales

### Politica de Node.js

Node.js es necesario en los tres sistemas operativos soportados porque la app usa un backend local en Node para detectar CLIs, lanzar procesos auxiliares y parsear la salida de `codex`, `claude` y `gemini`.

Los imports como `node:fs`, `node:path` o `node:child_process` son modulos nativos incluidos en Node.js. No son paquetes de npm y por eso no aparecen en `node_modules`.

Instalacion recomendada:

- Windows: instalar Node.js 20+ desde el instalador oficial o mediante `winget`.
- macOS: instalar Node.js 20+ mediante Homebrew, Volta, nvm o el instalador oficial.
- Ubuntu: instalar Node.js 20+ desde NodeSource, nvm o el gestor de paquetes que garantice una version 20 o superior.

La app resuelve el binario `node` siguiendo una politica comun:

1. `MONITORAI_NODE_BIN`, si esta definido.
2. runtime empaquetado junto a la app, si existe.
3. `node` o `nodejs` disponible en `PATH`.
4. rutas habituales del sistema.

Si la app empaquetada no encuentra Node, define `MONITORAI_NODE_BIN` con la ruta absoluta del binario:

```bash
MONITORAI_NODE_BIN=/usr/bin/node ./AI-Usage-Widget.AppImage
```

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

## Notas macOS

En macOS la app puede arrancar desde Finder/Dock con un `PATH` distinto al de la terminal. El backend anade rutas habituales de Homebrew, MacPorts, npm global, `~/.local/bin`, Cargo, nvm, Volta y asdf antes de detectar o lanzar CLIs.

Si Node no esta en una ruta del sistema, define `MONITORAI_NODE_BIN` con la ruta absoluta del binario `node`.

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

### macOS

```bash
npm run tauri build
```

En macOS el bundle saldra bajo `src-tauri/target/release/bundle`, normalmente como `.app` y/o `.dmg` segun tu entorno.

## Configuracion opcional

Crear `config.json` en la raiz:

```json
{
  "refresh_interval_sec": 45
}
```

El valor se limita entre 30 y 120 segundos.

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
- `where gemini` / `which gemini`
- `codex ...`
- `claude ...`
- `gemini ...`

Cada proceso usa timeout y los fallos de una CLI no bloquean el widget.
