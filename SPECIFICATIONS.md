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
- `gemini`

Providers previstos:

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
where.exe gemini
```

### Unix / Ubuntu

```bash
which codex
which claude
which gemini
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

Normalizacion visual obligatoria:

- reset primario visible: solo hora local en formato compacto, por ejemplo `14:49`
- reset semanal visible: hora local + fecha corta localizada, por ejemplo `9:24, 29 abr`
- no mostrar en UI texto crudo como `on`, `am`, `pm` o zonas tipo `(Europe/Madrid)`

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

- Si en el futuro Gemini aporta reset semanal o reset dinamico, debe normalizarse con la misma regla visual comun:
  - primario: hora local limpia
  - semanal: hora local + fecha corta localizada

Compatibilidad:

- soportar tambien formatos mas antiguos basados en `remaining/total` si aparecen
- tolerar salida limpia donde las palabras pueden quedar pegadas, por ejemplo `Currentsession`, `Currentweek`, `0%used`, `Resets2:20pm`
- la salida visible final debe seguir la misma normalizacion visual que Codex:
  - primario: `14:49`
  - semanal: `9:24, 29 abr`
- no mostrar en UI `am`, `pm` ni `(Europe/Madrid)` aunque aparezcan en el output bruto

No asumir que `echo /usage | claude` o piping simple sea suficiente en todas las plataformas.

### Gemini CLI

Gemini CLI muestra la cuota directamente en su barra de estado al iniciar la sesion.

Flujo correcto conocido:

1. Lanzar `gemini -p "hi"` (modo no interactivo con un prompt simple de sondeo) o el binario directamente en un PTY.
2. Esperar un tiempo prudencial (aprox. 3 segundos) para permitir que el TUI renderice la linea de estado en el terminal.
3. Capturar la salida completa.
4. Parsear datos de la tabla de estado o mensajes de error.

Ejemplo de salida real esperada:

```text
workspace (/directory)             branch             sandbox               /model                               quota
~/development/MonitorAI            master             no sandbox            gemini-3-flash-preview            55% used
```

Datos a extraer:

- porcentaje usado de la cuota diaria (`XX% used`)
- nivel de suscripcion (`Tier:` o `Plan:`)

Calculo requerido:

```text
percent_left = 100 - percent_used
```

Representacion especifica en UI:

- Para Gemini, la etiqueta del limite principal debe ser `24h` en lugar de `5h`.
- El tiempo de reinicio debe mostrarse como `23:59` de forma fija, salvo que el CLI proporcione un valor dinámico parseable en el futuro.

Compatibilidad:

- Detectar mensajes de "exhausted capacity" o errores `429` / `RESOURCE_EXHAUSTED` para reportar 0% de disponibilidad de forma inmediata.

### Futuros CLIs

Para otros providers, el proyecto debe seguir esta regla:

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
  "refresh_interval_sec": 120,
  "updated_at": "2026-04-23T16:00:00.000Z"
}
```

Reglas:

- `provider` no debe estar restringido a una union cerrada de dos nombres; deben poder entrar nuevos CLIs.
- `primary` representa el limite principal del provider.
- `weekly` es opcional.
- `status` es obligatorio cuando `available` es `false`.
- el valor interno de `reset` puede venir en formatos distintos segun provider, pero la UI debe aplicar una normalizacion comun antes de mostrarlo

Contrato visual comun para resets:

- limite principal (`5h`, `24h` o equivalente): mostrar solo hora local, por ejemplo `14:49`
- limite semanal: mostrar hora local + fecha corta localizada, por ejemplo `9:24, 29 abr`
- nunca mostrar en UI sufijos crudos como `on`, `am`, `pm`, zonas horarias entre parentesis, ni placeholders como `N/A`, salvo error real sin dato

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
- debe recordar entre ejecuciones su ultima posicion y su ultimo tamano en todos los sistemas operativos soportados, siempre que esos valores sigan siendo validos
- si la posicion recordada queda fuera de pantalla o el tamano recordado es menor que el minimo requerido por el contenido actual, la app debe aplicar fallback seguro, por ejemplo centrar la ventana o crecer hasta el minimo necesario

Comportamiento durante refresh manual o automatico:

- Debe aplicarse de forma consistente en todos los sistemas operativos soportados.
- Mientras una actualizacion esta en curso, la UI no debe parecer congelada ni silenciosa.
- El ultimo snapshot valido debe permanecer visible mientras se consulta de nuevo a las CLIs.
- La actualizacion debe resolverse por provider y no esperar a que todas las CLIs terminen para repintar la UI.
- Cada provider debe actualizar su componente visual en cuanto llegue su nuevo resultado, aunque otros providers sigan pendientes.
- El boton de refresco debe reflejar estado activo de forma clara, por ejemplo con spinner, estado deshabilitado temporalmente o ambos.
- La cabecera o el footer deben mostrar un texto transitorio como `Actualizando...` / `Refreshing...`.
- El provider que siga pendiente puede atenuarse ligeramente o mostrarse en gris, pero no debe desaparecer ni bloquear la visualizacion de los providers ya actualizados.
- Si el refresh falla, debe mantenerse el ultimo estado visible y marcarse como dato desactualizado o en estado de alerta, en lugar de ocultar toda la informacion util.

Contenido por provider:

- nombre
- barra de limite 5h o equivalente principal
- barra semanal si existe
- porcentaje restante
- tiempo de reset

---

## Transparencia y Composicion en Linux

### Explicacion del problema

- En Linux, la ventana del widget no depende solo del frontend. Tauri usa el webview nativo del sistema y en esta plataforma eso significa WebKitGTK.
- El comportamiento visual no es equivalente a Windows ni a macOS. Transparencia, blur y otros efectos dependen del stack completo: Tauri, WebKitGTK, GTK y el entorno grafico.
- En X11, la transparencia real requiere compositor activo. Sin compositor, una ventana con alpha puede renderizarse con fondo negro.
- En Wayland la situacion puede ser mejor, pero no debe asumirse como equivalente a Windows ni como garantia de soporte completo.
- Incluso con compositor activo, la transparencia en Tauri + WebKitGTK puede seguir siendo inconsistente o limitada segun version, distribucion y window manager.

### Diagnostico tecnico adoptado en el proyecto

- Se ha verificado el comportamiento en Linux/X11 con Tauri y WebKitGTK usando ventanas de prueba minimales.
- Se ha comprobado que el problema de fondo negro puede persistir aunque la UI HTML sea correcta y aunque el codigo solicite transparencia de ventana.
- Cuando esto ocurre, el problema debe tratarse como limitacion del stack nativo de composicion y no como fallo del layout del widget.
- El proyecto no debe asumir que una ventana marcada como `transparent: true` vaya a mostrarse realmente transparente en Linux.

### Decision de arquitectura

- No perseguir transparencia real en Linux/X11 como requisito funcional del producto.
- No introducir workarounds fragiles dependientes de compositor, desktop environment o version concreta de WebKitGTK.
- No bloquear trabajo de producto en iteraciones visuales cuyo exito dependa del entorno grafico del usuario.
- Priorizar estabilidad visual, legibilidad y consistencia del widget sobre efectos avanzados.

### Estrategia de fallback

- El fallback oficial en Linux debe ser un panel oscuro elegante, visualmente estable y sin depender de transparencia real.
- El widget debe seguir usando borde redondeado, sombra y contraste suficiente para mantener aspecto de overlay, aunque el fondo no sea realmente transparente.
- El modo visual debe funcionar correctamente tanto con compositor como sin compositor.
- La UI debe seguir siendo legible y usable aunque la transparencia nativa no este disponible.

### Criterios de aceptacion

- La app funciona correctamente en Linux aunque no haya transparencia real.
- No hay glitches visuales causados por depender de compositor para el funcionamiento normal.
- La UI no depende de transparencia real para mostrar providers, barras, estados ni controles.
- El modo visual aplicado debe poder registrarse o exponerse en logs de diagnostico cuando sea necesario.

### Consideraciones futuras

- Evaluar mas adelante el comportamiento en Wayland como via preferente para Linux si el soporte real resulta mas consistente.
- Revisar esta decision cuando WebKitGTK o Tauri mejoren soporte de transparencia de forma verificable y reproducible.
- Si en el futuro se considera necesario soporte visual avanzado en Linux, evaluar alternativas de stack o estrategia de ventana, pero no implementarlas hasta tener evidencia tecnica suficiente.

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

- refresco cada 30 a 120 segundos
- valor por defecto: 120 segundos
- actualizacion incremental por provider, sin esperar al provider mas lento para repintar los demas
- tolerancia a errores
- no bloquear UI
- durante refresco, mantener datos anteriores visibles y mostrar indicador discreto
- permitir refresco manual inmediato desde la cabecera del widget

---

## Configuracion

Archivo local opcional en la raiz:

```json
{
  "refresh_interval_sec": 120
}
```

El valor debe limitarse entre 30 y 120 segundos.

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
- `gemini`

---

## Testing

Casos minimos:

1. Codex presente con `/status` parseable.
2. Claude presente con `/usage` parseable.
3. Gemini presente con tabla de cuota (`XX% used`) parseable.
4. Gemini con mensaje de capacidad agotada ("exhausted").
5. Claude con primer `/usage` que solo cierra dialogo y segundo `/usage` que muestra uso.
6. Multiples providers presentes simultaneamente.
7. Ninguno presente.
8. CLI detectada pero uso no disponible.
9. Fallo de CLI (exit codes, timeouts).
10. Output inesperado o ruidoso (ej. mensajes de SSH agent al inicio).
11. Unificacion de formatos de hora (Hora, Fecha) en todas las herramientas.
12. UI con etiquetas personalizadas para Gemini (24h, 23:59).
13. Localizacion espanol/ingles.
14. Altura adaptativa del widget segun numero de providers.
15. Compatibilidad de deteccion Windows/Unix.

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
