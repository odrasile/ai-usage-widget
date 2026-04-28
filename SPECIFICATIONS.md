# SPECIFICATIONS.md

## Nombre del producto

AI Usage Widget

---

## Objetivo

Aplicacion de escritorio para Windows y Unix desktop, empezando por macOS y Ubuntu, que muestra en tiempo casi real el uso disponible de herramientas AI coding locales a traves de sus CLIs.

La aplicacion debe funcionar como un widget flotante, always-on-top, discreto y facil de ocultar/restaurar.

Este documento debe servir tambien como contexto de continuidad si el repositorio se mueve a otra maquina, por ejemplo un PC Ubuntu donde se quiera lanzar `codex` y continuar la evolucion del proyecto.

---

## Alcance de plataforma

Plataformas objetivo actuales:

- macOS
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

### Politica comun de Node.js

Node.js 20 o superior es una dependencia comun para macOS, Windows y Ubuntu.

Motivo:

- El proyecto usa un backend local en Node para deteccion de CLIs, ejecucion de procesos auxiliares, PTY y parsing de outputs.
- Los providers se consultan exclusivamente mediante CLIs locales, no mediante APIs externas.
- El frontend no debe importar modulos de Node; el uso de Node debe quedar limitado a `backend/` y `scripts/`.
- Imports como `node:fs`, `node:path`, `node:os` o `node:child_process` son modulos nativos del runtime Node. No son dependencias npm y no deben aparecer en `node_modules`.

Resolucion del runtime Node:

1. Usar `MONITORAI_NODE_BIN` si esta definido.
2. Usar un runtime `node` empaquetado junto a la app si existe.
3. Buscar `node` o `nodejs` en `PATH`.
4. Buscar rutas habituales del sistema operativo.

Reglas de instalacion:

- En desarrollo, el usuario debe instalar Node.js 20+ antes de ejecutar `npm install`, `npm test`, `npm run build` o `npm run tauri dev`.
- En distribucion, la app puede depender de un Node del sistema o empaquetar un runtime propio; la decision debe ser explicita por plataforma.
- Si se distribuye sin Node empaquetado, las instrucciones de instalacion deben indicar claramente que Node.js 20+ es requisito de ejecucion.
- Si Node esta instalado en una ruta no estandar, el usuario debe poder fijarlo con `MONITORAI_NODE_BIN`.

Politica recomendada:

- Mantener una estrategia comun de resolucion de Node para los tres sistemas operativos.
- No depender de wrappers de `node_modules/.bin` para ejecutar la app empaquetada.
- No introducir dependencias externas para reemplazar modulos nativos de Node cuando el runtime ya los proporciona.

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

### macOS

```bash
which codex
which claude
which gemini
```

Notas macOS:

- La app puede lanzarse desde Finder/Dock con un `PATH` mas limitado que una terminal.
- La capa de plataforma debe anadir rutas comunes antes de detectar o lanzar CLIs:
  - `/opt/homebrew/bin`
  - `/usr/local/bin`
  - `/opt/local/bin`
  - `~/.npm-global/bin`
  - `~/.local/bin`
  - `~/.cargo/bin`
  - rutas de gestores de Node usados comunmente para instalar CLIs, como nvm, Volta y asdf
- La resolucion del runtime Node para el backend debe contemplar Homebrew en Apple Silicon (`/opt/homebrew/bin/node`) ademas de rutas Unix tradicionales.
- `node-pty` en macOS puede instalar su binario auxiliar `spawn-helper` sin permiso de ejecucion en algunos entornos; antes de abrir una PTY se debe asegurar permiso ejecutable para ese helper si existe.

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
- Detectar tambien el caso en que la columna `quota` del TUI muestre `limit reached`; debe interpretarse igualmente como 0% disponible.

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
- boton de configuracion (tuerca ⚙) para abrir el panel de ajustes
- boton de refresco manual para forzar actualizacion de todas las CLIs
- boton cerrar
- boton ocultar a bandeja
- icono de bandeja con opciones Show/Quit cuando la plataforma lo soporte bien
- debe recordar entre ejecuciones su ultima posicion, su ultimo tamano y su nivel de zoom en todos los sistemas operativos soportados, siempre que esos valores sigan siendo validos
- si la posicion recordada queda fuera de pantalla o el tamano recordado es menor que el minimo requerido por el contenido actual, la app debe aplicar fallback seguro, por ejemplo centrar la ventana o crecer hasta el minimo necesario

### Configuracion y Ajustes

El widget incluye un panel de configuracion accesible mediante un icono de tuerca (⚙) en la cabecera. Este panel ha sido diseñado para ser robusto y legible en todos los entornos de escritorio soportados:

- **Intervalo de Refresco**: Permite establecer la frecuencia de actualización automática entre 1 y 60 minutos (por defecto 2 minutos).
- **Idioma**: Permite cambiar la interfaz entre Español e Inglés. El cambio se aplica de forma inmediata en toda la aplicación.
- **Modo de Visualización**: Define el enfoque narrativo y visual de los datos:
  - **Uso Consumido**: Enfoque tradicional. Las barras crecen de izquierda a derecha (0% a 100%). Las etiquetas cambian a "Uso 5h" / "Uso Semanal". El color escala de Verde (bajo uso) a Rojo (uso crítico).
  - **Recursos Libres**: Enfoque de capacidad. Las barras representan el espacio disponible; comienzan llenas y se vacían hacia la izquierda a medida que se consume el recurso. Las etiquetas cambian a "Libre 5h" / "Libre Semanal". El color escala de Verde (mucha capacidad libre) a Rojo (poca capacidad libre).
- **Visibilidad por Provider**: El panel muestra una casilla por cada CLI detectado para activar o desactivar su renderizado en el widget.
  - La visibilidad se guarda localmente junto al resto de ajustes.
  - Ocultar un provider desactiva su refresh automático para evitar consultas innecesarias de cuota; se mantiene su último dato conocido si existía.
  - Todo provider detectado nuevo se considera visible por defecto.
  - Si todos los providers quedan ocultos, la UI muestra un estado vacio especifico de "no providers visible" en lugar de simular que no hay CLIs detectadas.
- **Diseño y Visibilidad**:
  - **Dimensiones**: Ancho ampliado a 280px para garantizar que las etiquetas de texto largo sean plenamente legibles.
  - **Posicionamiento Inteligente**: El panel utiliza un desplazamiento negativo calculado respecto a su botón de activación. Esto asegura que, independientemente de la posición del botón en la cabecera, el diálogo se mantenga siempre dentro de los límites visibles del widget, evitando desbordamientos por el lateral izquierdo.
  - **Estilo Dark Mode**: Implementación de un tema oscuro forzado para evitar inconsistencias con los temas nativos del sistema (especialmente en Linux/WebKitGTK). Utiliza fondos sólidos oscuros (`rgb(16, 20, 28)`), textos de alto contraste (`#f5f7fb`) y selectores con apariencia personalizada y flecha SVG integrada.
- **Persistencia**: Los ajustes se guardan localmente y persisten entre sesiones. Al abrir el panel, se muestran los valores actuales cargados.

### Escalado y Zoom

El widget permite ajustar su escala visual para adaptarse a diferentes resoluciones de pantalla y preferencias del usuario, manteniendo la integridad del layout y la facilidad de lectura.

- **Controles**:
  - **Teclado**: `Ctrl` + `+` (Windows/Linux) o `Cmd` + `+` (macOS) para aumentar; `Ctrl/Cmd` + `-` para disminuir; `Ctrl/Cmd` + `0` para restablecer al 100%.
  - **Raton**: `Ctrl/Cmd` + rueda del raton hacia arriba (aumentar) / abajo (disminuir).
- **Rango**: Desde 50% hasta 200%, en pasos del 10% (0.1).
- **Persistencia**: El nivel de zoom se guarda junto con el estado de la ventana (posicion y tamano) y se restaura automaticamente al iniciar la aplicacion.

#### Comportamiento del Layout y Ventana

1.  **Mantenimiento de Proporciones (Aspect Ratio)**:
    - Al cambiar el zoom, la ventana de la aplicacion debe redimensionarse proporcionalmente al factor de escala aplicado.
    - Si el usuario ha redimensionado manualmente la ventana para que sea mas ancha o alta, el zoom debe respetar esa proporcion relativa en lugar de saltar a un tamano minimo.
2.  **Sincronizacion Dinamica**:
    - La ventana de Tauri debe ajustarse de forma síncrona con el cambio visual del contenido.
    - Se utiliza una medicion "limpia" (poniendo temporalmente el contenedor en altura automatica) para asegurar que se captura el tamano real del contenido incluyendo margenes, gaps y paddings.
3.  **Integridad Visual (No Solapamiento)**:
    - El footer (`Actualizado...`) tiene prioridad visual y no debe quedar nunca oculto por los paneles de los providers.
    - Se asegura mediante CSS (`flex-shrink: 0`) y una gestion correcta de los limites de la ventana.
4.  **Limites de Seguridad Escalados**:
    - Los limites de tamano de la ventana (`clamping`) se multiplican por el factor de zoom actual.
    - **Minimos**: Reducidos para permitir widgets compactos en escalas bajas (ej. 320px de ancho).
    - **Maximos**: Ampliados significativamente (ej. hasta 1600px de altura) para evitar que el contenido se corte o se solape al usar niveles altos de zoom (200%) con multiples providers.
    - La ventana nunca sera mas pequeña que lo que el contenido escalado requiere para ser visible.

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

Las barras deben comunicar severidad por porcentaje restante mediante una interpolación suave dividida en tres tramos de "salud":

- **Tramo de Seguridad (0% a 45% de uso)**: Transición de **Verde** (`#4fc978`) a **Amarillo** (`#e5d85c`).
- **Tramo de Aviso (45% a 75% de uso)**: Transición de **Amarillo** (`#e5d85c`) a **Naranja** (`#f2a33a`).
- **Tramo Crítico (75% a 100% de uso)**: Transición de **Naranja** (`#f2a33a`) a **Rojo** (`#df3f3f`).

El texto del porcentaje debe usar el mismo color calculado para su barra.

### Tramo Delta (Consumo en Sesión)

Para proporcionar feedback sobre el consumo inmediato, cada barra puede mostrar un "tramo delta" con un pulso animado:

- **Función**: Representa exclusivamente el incremento de consumo ocurrido **durante la sesión actual** de la aplicación.
- **Línea de Base de Sesión (Session Baseline)**: Al arrancar la aplicación, el primer valor válido obtenido (ya sea de la caché o de la primera consulta real) se registra internamente como el punto de referencia. En este estado inicial **no se muestra ningún delta**.
- **Activación**: El tramo delta solo aparece cuando una lectura posterior detecta un incremento en el uso respecto a la línea de base de la sesión. 
- **Modo de Visualización**:
  - En **Uso Consumido**: El delta se añade a la derecha de la barra sólida, indicando el crecimiento del gasto.
  - En **Recursos Libres**: El delta ocupa el espacio que acaba de ser "vaciado" a la derecha de la reserva restante.
- **Actualización de Base**: Si se detecta un reinicio de cuota (el uso baja drásticamente respecto a la base), el sistema actualiza automáticamente la línea de base al nuevo valor mínimo para empezar a contar el consumo de la nueva cuota desde cero.

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

### macOS

- `.app`
- `.dmg` cuando Tauri lo permita en el entorno actual

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

## Contexto operativo para mover el repo a macOS o Ubuntu

### macOS

1. Instalar Node.js 20+, Rust y dependencias Tauri habituales.
2. Instalar `codex`, `claude` y/o `gemini` en una ruta detectable, por ejemplo con Homebrew/npm global.
3. Verificar que `which codex`, `which claude` y/o `which gemini` devuelven ruta desde terminal.
4. Ejecutar:

```bash
npm install
npm test
npm run tauri dev
```

5. Validar manualmente que la app detecta CLIs aunque se lance desde el bundle/Finder, donde `PATH` puede ser mas limitado.

### Ubuntu

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
