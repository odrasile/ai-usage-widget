# SPECIFICATIONS.md

## Nombre del producto

AI Usage Widget

---

## Objetivo

Aplicacion de escritorio para Windows y Unix desktop, empezando por Ubuntu, que muestra en tiempo casi real el uso disponible de herramientas AI coding locales a traves de sus CLIs.

La aplicacion debe funcionar como un widget flotante, always-on-top, discreto y facil de ocultar/restaurar.

Este documento debe servir tambien como contexto de continuidad si el repositorio se mueve a otra maquina, por ejemplo un PC Ubuntu donde se quiera lanzar `codex` y continuar la evolucion del proyecto.

---

## Alcance de plataforma

Plataformas objetivo actuales:

- Windows
- Ubuntu Desktop

Plataformas objetivo futuras:

- Otras distribuciones Linux compatibles con Tauri/WebKitGTK, si no requieren cambios arquitectonicos importantes.

Tecnologia:

- Tauri.
- TypeScript en frontend.
- Backend local Node.
- Rust solo para integracion Tauri y ventana.
- `node-pty` cuando haga falta un TTY real.

Notas de compatibilidad:

- La deteccion de ejecutables debe ser multiplataforma.
- La ejecucion de CLIs debe abstraer diferencias entre `cmd.exe` y shells Unix.
- No asumir APIs exclusivas de Windows salvo en ramas condicionadas por plataforma.

---

## Providers soportados y extensibilidad

Providers soportados hoy:

- `codex`
- `claude`

Providers previstos:

- `gemini`
- otros CLIs AI coding similares

La arquitectura debe permitir anadir nuevos providers sin reescribir la UI ni el scheduler. Cada provider debe tener:

- deteccion de instalacion
- adapter propio
- parser propio o reglas equivalentes
- mapeo al modelo de datos unificado

El frontend no debe asumir una lista cerrada de providers.

---

## Deteccion de herramientas

El sistema debe detectar si estan instalados los ejecutables configurados como providers.

Metodo por plataforma:

### Windows

```powershell
where.exe codex
where.exe claude
```

### Unix / Ubuntu

```bash
which codex
which claude
```

Si una herramienta esta instalada pero falla al obtener uso, debe mostrarse como detectada con estado no disponible, no como ausente.

---

## Obtencion de datos

### Codex

Codex requiere un TTY real para ejecutar comandos internos.

Flujo correcto conocido:

1. Lanzar `codex --no-alt-screen` dentro de un pseudo-terminal.
2. Enviar `/status`.
3. Capturar salida.
4. Cerrar la sesion con `/quit` o cerrando la PTY de forma controlada.
5. Parsear datos.

Ejemplo de salida esperada:

```text
5h limit: [bars] 61% left (resets 20:45)
Weekly limit: [bars] 81% left (resets 09:24 on 29 Apr)
```

Datos a extraer:

- porcentaje restante de limite 5h
- tiempo de reset 5h
- porcentaje semanal
- tiempo de reset semanal

No usar:

- `codex status`
- `codex exec /status`

Motivo:

- no representan correctamente el flujo real del TUI
- pueden fallar o no existir segun version

### Claude Code

Claude tambien requiere una sesion interactiva real para obtener `/usage` de forma fiable.

Flujo correcto conocido:

1. Lanzar `claude` dentro de un pseudo-terminal.
2. Enviar `/usage`.
3. Si aparece la pantalla inicial y Claude responde `Status dialog dismissed`, enviar `/usage` una segunda vez.
4. Capturar salida.
5. Cerrar la PTY de forma controlada.
6. Parsear datos.

Ejemplo de salida real esperada:

```text
Status   Config   Usage   Stats

Current session
0% used
Resets 2:20pm (Europe/Madrid)

Current week (all models)
0% used
Resets Apr 29, 12am (Europe/Madrid)
```

Datos a extraer:

- porcentaje usado de sesion actual
- porcentaje usado semanal
- reset de sesion actual
- reset semanal

Calculo requerido:

```text
percent_left = 100 - percent_used
```

Compatibilidad:

- soportar tambien formatos mas antiguos basados en `remaining/total` si aparecen
- tolerar salida limpia donde las palabras pueden quedar pegadas, por ejemplo `Currentsession`, `Currentweek`, `0%used`, `Resets2:20pm`

No asumir que `echo /usage | claude` o piping simple sea suficiente en todas las plataformas.

### Futuros CLIs

Para `gemini` u otros providers, el proyecto debe seguir esta regla:

1. Detectar si el CLI esta instalado.
2. Determinar si la consulta de uso requiere PTY real o puede ser non-interactive.
3. Documentar el flujo correcto en este fichero.
4. Implementar adapter y parser sin romper providers existentes.

---

## Modelo de datos unificado

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

Reglas:

- `provider` no debe estar restringido a una union cerrada de dos nombres; deben poder entrar nuevos CLIs.
- `primary` representa el limite principal del provider.
- `weekly` es opcional.
- `status` es obligatorio cuando `available` es `false`.

---

## UI

Widget flotante con:

- always-on-top
- sin bordes nativos
- ancho fijo razonable
- altura adaptativa al contenido y al numero de providers detectados
- fondo semi-transparente
- cabecera arrastrable
- boton de informacion
- boton de refresco manual para forzar actualizacion de todas las CLIs
- boton cerrar
- boton ocultar a bandeja
- icono de bandeja con opciones Show/Quit cuando la plataforma lo soporte bien

Contenido por provider:

- nombre
- barra de limite 5h o equivalente principal
- barra semanal si existe
- porcentaje restante
- tiempo de reset

Estados:

- inicializando/detectando CLIs
- refrescando
- sin providers
- provider detectado pero sin uso disponible
- error tolerable de provider

Regla de layout:

- la altura de la ventana del widget debe ajustarse al contenido real, no solo la altura del panel interno
- si aumentan los providers detectados, el widget debe crecer
- si disminuyen, debe encogerse hasta un minimo practico

---

## Localizacion

La UI debe soportar:

- Espanol
- Ingles

Deteccion:

- usar idioma del sistema/navegador disponible en frontend
- si el idioma empieza por `es`, usar espanol
- en cualquier otro caso, usar ingles

---

## Colores de uso

Las barras deben comunicar severidad por porcentaje restante.

Escala recomendada:

- 100%: verde
- 55%: amarillo
- 25%: naranja
- 0%: rojo

El texto del porcentaje debe usar el mismo color que su barra.

---

## Actualizacion

- refresco cada 30 a 60 segundos
- valor por defecto: 45 segundos
- ejecucion secuencial
- tolerancia a errores
- no bloquear UI
- durante refresco, mantener datos anteriores visibles y mostrar indicador discreto
- permitir refresco manual inmediato desde la cabecera del widget

---

## Configuracion

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

- ProviderDetector
- CLIExecutor
- Platform abstraction
- CodexAdapter
- ClaudeAdapter
- futuros adapters por provider
- Parser
- Modelo de datos unificado
- UI Renderer
- Scheduler
- i18n
- Tray/window integration

Regla importante:

- la logica de plataforma debe concentrarse en una capa pequena y explicita
- la mayor parte de adapters y parsers debe permanecer agnostica respecto a Windows o Unix

---

## Seguridad

- ejecutar solo comandos whitelist de lookup y providers soportados
- no ejecutar input del usuario
- usar argumentos fijos
- usar timeouts
- no usar red para obtener datos
- ocultar consolas auxiliares en Windows
- cerrar procesos auxiliares al completar lectura
- en Unix, no asumir privilegios elevados ni dependencias fuera de Tauri/Node/CLI local

Whitelist minima actual:

- `where.exe` o `which`
- `codex`
- `claude`

---

## Testing

Casos minimos:

1. Codex presente con `/status` parseable.
2. Claude presente con `/usage` parseable.
3. Claude con primer `/usage` que solo cierra dialogo y segundo `/usage` que muestra uso.
4. Ambos presentes.
5. Ninguno presente.
6. CLI detectada pero uso no disponible.
7. Fallo de CLI.
8. Output inesperado.
9. Output limpio con tokens pegados del TTY.
10. UI sin providers.
11. UI durante deteccion/refresco.
12. Localizacion espanol/ingles.
13. Altura adaptativa del widget segun numero de providers.
14. Compatibilidad de deteccion Windows/Unix.

---

## Build

Debe generar build para la plataforma actual.

### Windows

- `.exe`
- bundle instalable cuando Tauri lo permita (`.msi`, NSIS, etc.)

### Ubuntu

- `.deb` y/o AppImage cuando el entorno Tauri lo permita

Comandos base:

```bash
npm install
npm test
npm run build
npm run tauri dev
npm run tauri build
```

Dependencias Ubuntu esperadas para compilar Tauri:

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

---

## Contexto operativo para mover el repo a Ubuntu

Si el repositorio se lleva a una maquina Ubuntu para seguir el desarrollo:

1. Instalar Node.js, Rust y dependencias de Tauri/WebKitGTK.
2. Instalar `codex` y, si se desea, `claude`.
3. Verificar que `which codex` y `which claude` devuelven ruta.
4. Ejecutar:

```bash
npm install
npm test
npm run tauri dev
```

5. Validar manualmente en esa maquina:
   - que `codex --no-alt-screen` abre bien en PTY y responde a `/status`
   - que `claude` responde a doble `/usage` si aparece su pantalla inicial
   - que la bandeja del sistema y la transparencia se comportan bien en el entorno grafico usado

Si no es posible recuperar el estado de la sesion de desarrollo anterior, este fichero debe bastar para entender:

- que Codex y Claude ya usan PTY real
- que Claude puede requerir dos `/usage`
- que el parser de Claude debe tolerar tokens pegados tras limpiar ANSI
- que la altura del widget debe adaptarse al numero de providers
- que el proyecto ya tiene una capa de plataforma para Windows y Unix

---

## Resultado esperado

La aplicacion ejecutable debe:

1. Lanzarse sin consola visible en Windows y de forma nativa en Ubuntu.
2. Detectar Codex y Claude si estan instalados.
3. Obtener uso con los flujos correctos por provider.
4. Mostrar widget flotante.
5. Mostrar limite principal y semanal cuando existan.
6. Refrescar automaticamente.
7. Permitir refresco manual.
8. Ocultarse/restaurarse desde bandeja cuando la plataforma lo soporte adecuadamente.
9. Mostrar textos en espanol o ingles segun idioma del sistema.
10. Poder extenderse a Gemini u otros CLIs sin rehacer la base.
