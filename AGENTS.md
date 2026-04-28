# AGENTS.md

## Objetivo

Implementar y mantener un widget de escritorio para Windows, Ubuntu Desktop y macOS que monitoriza el uso de herramientas AI coding mediante sus CLIs locales.

El resultado debe ser:

- Aplicacion desktop funcional con Tauri.
- Frontend en TypeScript.
- Widget flotante, compacto, always-on-top y sin bordes.
- Integracion local con Codex, Claude Code y Gemini.
- Build funcional en Windows, Ubuntu Desktop y macOS.
- Base simple, modular y lista para distribuir.

---

## Principios de trabajo

1. KISS: mantener el codigo simple y directo.
2. Evitar sobreingenieria.
3. Separar responsabilidades por modulo.
4. No introducir dependencias salvo que resuelvan una limitacion real.
5. No usar red ni APIs externas para obtener datos.
6. Priorizar tolerancia a errores: si un provider falla, el widget debe seguir funcionando.
7. No bloquear la UI mientras se consultan CLIs.

---

## Flujo de trabajo

1. Inicializar o revisar proyecto Tauri + frontend.
2. Implementar deteccion de CLIs.
3. Implementar ejecucion segura de comandos.
4. Implementar adapters por provider.
5. Implementar parsers con tests.
6. Implementar modelo de datos unificado.
7. Implementar UI minima.
8. Integrar scheduler de actualizacion.
9. Validar deteccion, parsing y UI.
10. Preparar builds e instaladores para Windows, Ubuntu Desktop y macOS.
11. Documentar.

No saltar fases salvo que el repositorio ya tenga una fase completada.

---

## Restricciones tecnicas

- Frontend: TypeScript.
- Framework desktop: Tauri.
- Backend local: Node.
- Ejecucion de CLI: `child_process` y, cuando haga falta TTY real, pseudo-terminal.
- No usar Electron.
- No usar librerias pesadas de UI.
- No usar APIs externas para consultar uso.
- No implementar historico, multiusuario ni extension de navegador.

---

## Integracion Codex

Codex no debe consultarse con `codex status`, porque en la version actual `status` no es subcomando.

Flujo correcto:

1. Detectar instalacion con `where.exe codex` en Windows o `which codex` en Unix/macOS.
2. Abrir `codex --no-alt-screen` dentro de un pseudo-terminal.
3. Enviar `/status`.
4. Capturar salida.
5. Cerrar con `/quit`.

Datos esperados:

- `5h limit: ... NN% left (resets HH:MM)`
- `Weekly limit: ... NN% left (resets ...)`

El adapter debe extraer porcentaje y reset de 5h y semanal.

No usar `codex exec /status` para el widget: crea una sesion non-interactive, puede consumir tokens/eventos y no representa el comando interno del TUI.

---

## Integracion Claude Code

1. Detectar con `where.exe claude` en Windows o `which claude` en Unix/macOS.
2. Ejecutar `claude`.
3. Enviar `/usage` por stdin.
4. Parsear remaining requests, total requests y reset.

Calculo:

```text
percent_left = remaining / total * 100
```

---

## Integracion Gemini CLI

Gemini CLI muestra la cuota en la barra de estado del TUI al iniciar.

Flujo correcto:

1. Detectar con `where.exe gemini` en Windows o `which gemini` en Unix/macOS.
2. Lanzar `gemini` dentro de un pseudo-terminal cuando haga falta capturar el TUI.
3. Usar `GEMINI_API_KEY=1` solo si el usuario no ha definido `GEMINI_API_KEY`, para evitar dialogos de keyring sin persistir ese valor.
4. Capturar la tabla de estado.
5. Cerrar el PTY de forma controlada, incluyendo el grupo de procesos en Unix.

Datos esperados:

- columna `quota` con `NN% used`
- columna `quota` con `limit reached`

Calculo:

```text
percent_left = 100 - percent_used
```

---

## Seguridad

- Solo ejecutar comandos en whitelist: `where.exe`/`which`, `codex`, `claude`, `gemini`.
- No ejecutar input arbitrario del usuario.
- Usar argumentos fijos.
- Anadir timeout a toda ejecucion.
- No consultar APIs externas para obtener cuotas.
- En Windows, ocultar consolas auxiliares:
  - Tauri debe compilar como subsystem `windows`.
  - Procesos Node lanzados desde Rust deben usar `CREATE_NO_WINDOW`.
  - PTY de Codex debe usar modo oculto cuando este disponible.
- En Unix/macOS:
  - No asumir privilegios elevados.
  - Cerrar PTYs y grupos de proceso auxiliares al completar lectura.
  - No depender de APIs exclusivas de Windows fuera de ramas condicionadas por plataforma.

---

## UI y UX

El widget debe:

- Ser always-on-top.
- No tener decoraciones nativas.
- Ser arrastrable desde la cabecera.
- Tener boton de cerrar.
- Tener boton para ocultar a bandeja del sistema.
- Restaurarse desde la bandeja con clic o menu.
- Mostrar estado de inicializacion/deteccion de CLIs con indicador visual.
- Durante refrescos, mantener datos anteriores visibles y mostrar indicador discreto.
- Detectar idioma del sistema/navegador y mostrar textos en espanol o ingles.

Para cada provider:

- Mostrar nombre.
- Mostrar barra 5h si existe.
- Mostrar barra semanal si existe.
- Mostrar porcentaje y reset por barra.
- El color del porcentaje debe coincidir con el color de su barra.

Escala recomendada de color:

- 100%: verde.
- 55%: amarillo.
- 25%: naranja.
- 0%: rojo.

---

## Modelo de datos

Provider con datos:

```json
{
  "provider": "codex",
  "available": true,
  "usage": {
    "primary": {
      "percent_left": 58,
      "reset": "20:45"
    },
    "weekly": {
      "percent_left": 81,
      "reset": "09:24 on 29 Apr"
    }
  }
}
```

Provider detectado sin uso:

```json
{
  "provider": "codex",
  "available": false,
  "usage": null,
  "status": "CLI detected; usage unavailable"
}
```

---

## Testing

El agente debe:

- Simular outputs de CLI.
- Cubrir output realista de `codex /status`.
- Cubrir output realista de `claude /usage`.
- Cubrir output realista de `gemini` con quota en tabla de estado.
- Manejar errores de parsing.
- Validar que la UI no rompe si falta un provider.
- Validar que un provider detectado pero sin datos no se muestra como inexistente.

Comandos minimos:

```bash
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

---

## Entregables

- Codigo fuente completo.
- Scripts de build.
- README con instrucciones.
- Builds e instaladores para Windows, Ubuntu Desktop y macOS cuando se ejecuten en su plataforma nativa o runner CI equivalente.
- Tests de parsers.

---

## No hacer

- No anadir features no especificadas.
- No implementar historico.
- No implementar multiusuario.
- No anadir extension de navegador.
- No consultar servicios externos para uso/cuotas.
- No reemplazar Tauri por Electron.
