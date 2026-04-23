# SPECIFICATIONS.md

## Nombre del producto

AI Usage Widget

---

## Objetivo

Aplicacion de escritorio para Windows que muestra en tiempo casi real el uso disponible de herramientas AI coding locales, empezando por Codex y Claude Code.

La aplicacion debe funcionar como un widget flotante, always-on-top, discreto y facil de ocultar/restaurar.

---

## Plataforma

Primera version:

- Windows unicamente.

Tecnologia:

- Tauri.
- TypeScript en frontend.
- Backend local Node.
- Rust solo para integracion Tauri y ventana.

---

## Funcionalidades

### 1. Deteccion de herramientas

El sistema debe detectar si estan instalados:

- `codex`
- `claude`

Metodo en Windows:

```powershell
where.exe codex
where.exe claude
```

Si una herramienta esta instalada pero falla al obtener uso, debe mostrarse como detectada con estado no disponible, no como ausente.

---

### 2. Obtencion de datos

#### Codex

Codex requiere un TTY real para ejecutar comandos internos.

Flujo:

1. Lanzar `codex --no-alt-screen` dentro de un pseudo-terminal.
2. Enviar `/status`.
3. Capturar salida.
4. Enviar `/quit`.
5. Parsear datos.

Ejemplo de salida esperada:

```text
5h limit: [bars] 61% left (resets 20:45)
Weekly limit: [bars] 81% left (resets 09:24 on 29 Apr)
```

Datos a extraer:

- porcentaje restante de limite 5h.
- tiempo de reset 5h.
- porcentaje semanal.
- tiempo de reset semanal.

No usar:

- `codex status`
- `codex exec /status`

---

#### Claude Code

Flujo:

```powershell
echo /usage | claude
```

Datos a extraer:

- remaining requests.
- total requests.
- tiempo de reset.

Calculo:

```text
percent_left = remaining / total * 100
```

---

### 3. Modelo de datos unificado

Provider con datos:

```json
{
  "provider": "codex",
  "available": true,
  "usage": {
    "primary": {
      "percent_left": 61,
      "reset": "20:45"
    },
    "weekly": {
      "percent_left": 81,
      "reset": "09:24 on 29 Apr"
    }
  }
}
```

Provider detectado sin datos disponibles:

```json
{
  "provider": "codex",
  "available": false,
  "usage": null,
  "status": "CLI detected; usage unavailable"
}
```

Snapshot completo:

```json
{
  "providers": [],
  "refresh_interval_sec": 45,
  "updated_at": "2026-04-23T16:00:00.000Z"
}
```

---

### 4. UI

Widget flotante con:

- always-on-top.
- sin bordes nativos.
- tamano reducido.
- fondo semi-transparente.
- cabecera arrastrable.
- boton cerrar.
- boton ocultar a bandeja.
- icono de bandeja con opciones Show/Quit.

Contenido por provider:

- nombre.
- barra de limite 5h.
- barra de limite semanal si existe.
- porcentaje restante.
- tiempo de reset.

Estados:

- inicializando/detectando CLIs.
- refrescando.
- sin providers.
- provider detectado pero sin uso disponible.
- error tolerable de provider.

---

### 5. Localizacion

La UI debe soportar:

- Espanol.
- Ingles.

Deteccion:

- Usar idioma del sistema/navegador disponible en frontend.
- Si el idioma empieza por `es`, usar espanol.
- En cualquier otro caso, usar ingles.

---

### 6. Colores de uso

Las barras deben comunicar severidad por porcentaje restante.

Escala recomendada:

- 100%: verde.
- 55%: amarillo.
- 25%: naranja.
- 0%: rojo.

El texto del porcentaje debe usar el mismo color que su barra.

---

### 7. Actualizacion

- Refresco cada 30 a 60 segundos.
- Valor por defecto: 45 segundos.
- Ejecucion secuencial.
- Tolerancia a errores.
- No bloquear UI.
- Durante refresco, mantener datos anteriores visibles y mostrar indicador discreto.

---

### 8. Configuracion

Archivo local opcional en la raiz:

```json
{
  "refresh_interval_sec": 45
}
```

El valor debe limitarse entre 30 y 60 segundos.

---

## Arquitectura

Modulos esperados:

- ProviderDetector.
- CLIExecutor.
- CodexAdapter.
- ClaudeAdapter.
- Parser.
- Modelo de datos unificado.
- UI Renderer.
- Scheduler.
- i18n.
- Tray/window integration.

---

## Seguridad

- Ejecutar solo comandos whitelist: `where.exe`, `codex`, `claude`.
- No ejecutar input del usuario.
- Usar timeouts.
- No usar red para obtener datos.
- Ocultar consolas auxiliares en Windows.
- Cerrar procesos auxiliares al completar lectura.

---

## Testing

Casos minimos:

1. Codex presente con `/status` parseable.
2. Claude presente con `/usage` parseable.
3. Ambos presentes.
4. Ninguno presente.
5. CLI detectada pero uso no disponible.
6. Fallo de CLI.
7. Output inesperado.
8. UI sin providers.
9. UI durante deteccion/refresco.
10. Localizacion espanol/ingles.

---

## Build

Debe generar:

- Ejecutable Windows `.exe`.
- Bundle instalable Windows cuando Tauri lo permita.

Comandos:

```powershell
npm install
npm test
npm run build
npm run tauri dev
npm run tauri build
```

---

## Resultado esperado

La aplicacion ejecutable debe:

1. Lanzarse sin consola visible.
2. Detectar Codex y Claude si estan instalados.
3. Obtener uso con los flujos correctos.
4. Mostrar widget flotante.
5. Mostrar 5h y weekly cuando existan.
6. Refrescar automaticamente.
7. Ocultarse/restaurarse desde bandeja.
8. Mostrar textos en espanol o ingles segun idioma del sistema.
