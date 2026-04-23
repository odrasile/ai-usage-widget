# AI Usage Widget

Widget desktop para Windows que muestra el uso disponible de Codex y Claude Code usando sus CLIs locales.

## Requisitos

- Windows
- Node.js 20 o superior
- Rust y Cargo para compilar Tauri
- CLI `codex` y/o `claude` instaladas si se quieren ver datos reales

## Instalacion

```powershell
npm install
```

## Desarrollo

```powershell
npm run tauri dev
```

La ventana se abre como widget flotante, sin bordes, transparente y siempre visible.

## Build Windows

```powershell
npm run tauri build
```

El ejecutable se genera bajo `src-tauri/target/release/bundle`.

No distribuyas solo el `.exe` suelto movido a otra carpeta. La app necesita recursos empaquetados junto al bundle, incluyendo el backend Node y `node-pty`. Para uso normal instala desde el `.msi` o el instalador NSIS generado por Tauri.

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
- `npm test`: valida parsers con outputs simulados

## Seguridad

El backend solo permite ejecutar comandos de la whitelist:

- `where codex`
- `where claude`
- `codex status`
- `echo /usage | claude`

Cada proceso usa timeout y los fallos de una CLI no bloquean el widget.
