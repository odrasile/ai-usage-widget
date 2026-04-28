# Release Plan

Plan de limpieza, preparacion y publicacion del repositorio.

Este documento se usa como checklist vivo. Cada punto debe marcarse solo cuando el cambio este aplicado y validado.

## Objetivos

- Publicar el repositorio de forma limpia en Git.
- Mantener soporte explicito para Windows, Ubuntu Desktop y macOS.
- Generar instaladores por plataforma usando builds nativos o runners CI del mismo sistema operativo.
- Evitar publicar artefactos locales, scripts temporales o documentacion sesgada a una sola plataforma.

## Hallazgos Iniciales

- [x] Proyecto basado en Tauri + TypeScript + backend Node local.
- [x] Providers soportados actualmente: Codex, Claude Code y Gemini.
- [x] README.md ya menciona Windows, Ubuntu y macOS.
- [x] SPECIFICATIONS.md ya cubre arquitectura multiplataforma en gran parte.
- [x] AGENTS.md estaba redactado como objetivo principalmente Windows.
- [x] README.md tenia duplicados/confusion en scripts de build.
- [x] SPECIFICATIONS.md necesitaba pequenos ajustes para tratar Gemini como provider completo en resultado esperado.
- [x] Habia un script temporal trackeado: `tmp-claude-debug.mjs`.
- [x] CI validaba Ubuntu, pero no generaba instaladores multiplataforma.

## Fase 1: Limpieza Documental

- [x] Actualizar `AGENTS.md` para declarar Windows, Ubuntu Desktop y macOS como plataformas objetivo.
- [x] Revisar `AGENTS.md` para sustituir comandos exclusivamente Windows por equivalentes multiplataforma cuando aplique.
- [x] Actualizar `README.md` para separar claramente:
  - desarrollo local
  - build local de la plataforma actual
  - generacion de instaladores
  - publicacion de releases
- [x] Corregir duplicados de scripts en `README.md`.
- [x] Documentar que los instaladores deben construirse en runners nativos:
  - Windows en `windows-latest`
  - Ubuntu en `ubuntu-latest`
  - macOS en `macos-latest`
- [x] Actualizar `SPECIFICATIONS.md` para incluir Gemini en el resultado esperado junto a Codex y Claude.
- [x] Revisar `CONTRIBUTING.md` para alinear comandos con `npm ci`, `npm test`, `npm run build` y `cargo check`.

## Fase 2: Limpieza Del Repositorio

- [x] Eliminar `tmp-claude-debug.mjs` o moverlo a `scripts/dev/` con ruta configurable.
- [x] Revisar si los iconos Android/iOS bajo `src-tauri/icons/` deben conservarse o eliminarse.
  Decision: se conservan. Los iconos iOS forman parte del set necesario para empaquetar correctamente macOS con Tauri.
- [x] Confirmar que `.gitignore` cubre:
  - `node_modules/`
  - `dist/`
  - `src-tauri/target/`
  - logs
  - configuracion local (`config.json`)
- [x] Confirmar que no hay logs ni dumps temporales trackeados.
- [x] Revisar `git status --short` antes de preparar commits.

## Fase 3: Validacion Local

- [x] Ejecutar `npm test`.
- [x] Ejecutar `npm run build`.
- [x] Ejecutar `cargo check` en `src-tauri`.
- [x] Ejecutar, si el entorno lo permite, `npm run tauri build`.
- [x] Confirmar que una consulta real de provider no deja procesos residentes.
- [x] Confirmar que la app conserva tolerancia a fallos si falta algun CLI.

## Fase 4: CI De Validacion

Nota: los puntos de esta fase quedan configurados en GitHub Actions; la ejecucion real queda pendiente hasta publicar la rama en GitHub.

- [x] Convertir `.github/workflows/ci.yml` a matrix multiplataforma.
- [x] Ejecutar checks en:
  - Ubuntu
  - Windows
  - macOS
- [x] Usar `npm ci` en CI.
- [x] Mantener instalacion de dependencias WebKitGTK solo en Ubuntu.
- [x] Ejecutar `npm test` en todos los sistemas.
- [x] Ejecutar `npm run build` en todos los sistemas.
- [x] Ejecutar `cargo check` en todos los sistemas.

## Fase 5: Workflow De Release

Nota: los puntos de esta fase quedan configurados en GitHub Actions; la generacion real de instaladores Windows/macOS queda pendiente hasta crear un tag `v*`.

- [x] Crear workflow `.github/workflows/release.yml`.
- [x] Disparar release por tag `v*`.
- [x] Usar matrix:
  - `windows-latest`
  - `ubuntu-latest`
  - `macos-latest`
- [x] Instalar dependencias de sistema en Ubuntu.
- [x] Ejecutar `npm ci`.
- [x] Ejecutar `npm test`.
- [x] Ejecutar `npm run build`.
- [x] Ejecutar `npm run tauri build`.
- [x] Subir artefactos generados por Tauri a GitHub Releases.
- [x] Documentar que los bundles no estan firmados inicialmente salvo decision posterior.

## Fase 6: Instaladores Esperados

### Windows

- [ ] Generar instalador Tauri para Windows (`.msi` y/o NSIS, segun config final).
- [ ] Validar que no aparece consola auxiliar.
- [ ] Validar deteccion de Node y CLIs desde app instalada.
- [ ] Documentar posible aviso SmartScreen si no hay firma.

### Ubuntu

- [ ] Generar `.deb` y/o AppImage.
- [ ] Validar dependencias runtime requeridas.
- [ ] Validar comportamiento de bandeja del sistema.
- [ ] Documentar limitaciones de transparencia en Linux/WebKitGTK.

### macOS

- [ ] Generar `.app` y/o `.dmg`.
- [ ] Validar resolucion de `PATH` al abrir desde Finder/Dock.
- [ ] Validar deteccion de CLIs instalados con Homebrew/npm global.
- [ ] Documentar posible bloqueo Gatekeeper si no hay notarizacion.

## Fase 7: Preparacion De Publicacion Git

- [ ] Revisar nombre del producto, descripcion y licencia.
- [ ] Revisar `package.json`.
- [ ] Revisar `src-tauri/tauri.conf.json`.
- [ ] Revisar `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`.
- [ ] Crear commits pequenos y revisables:
  - documentacion multiplataforma
  - limpieza de repo
  - CI/release
- [ ] Crear repositorio remoto.
- [ ] Subir rama principal.
- [ ] Crear tag inicial `v0.1.0`.
- [ ] Ejecutar workflow de release.
- [ ] Probar instaladores generados antes de anunciar la release.

## Decisiones Pendientes

- [x] Decidir si se empaqueta runtime Node con la app o se mantiene Node.js 20+ como requisito externo.
  Decision: para `v0.1.0` se mantiene Node.js 20+ como requisito externo. Se conserva la resolucion por `MONITORAI_NODE_BIN`, runtime empaquetado futuro, `PATH` y rutas habituales.
- [x] Decidir si se firman instaladores Windows/macOS en la primera release.
  Decision: la primera release no firma ni notariza instaladores. README y release notes deben documentar posibles avisos de SmartScreen y Gatekeeper.
- [x] Decidir si se conservan iconos Android/iOS generados por Tauri.
  Decision: se conservan; especialmente los iconos iOS son necesarios para el empaquetado macOS.
- [ ] Decidir nombre final del repositorio remoto.
- [ ] Decidir si `bundle.targets = "all"` se mantiene o se fija por plataforma en CI.
