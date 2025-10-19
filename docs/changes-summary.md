# Faust Editor Modernization Overview 

This document records the structural refactor completed on the `refactor-editor-runtime` branch, done with GPT-5 Codex on 10/19/25.

## Runtime And Fetch Pipeline

- Added `src/utils/network.js` to consolidate `fetch` helpers with a timeout guard, used across the editor and FaustWeb integrations.
- Reworked `src/faustlive.js` drag-and-drop logic to eliminate implicit globals and synchronous `XMLHttpRequest` usage. Dropped files/URLs are now processed asynchronously with richer error handling.
- Updated `src/utils/export-lib.js` and `src/utils/export-ui.js` to rely on promise-based `fetch` calls, improving fault reporting for target discovery, source upload, and remote compilation.

## Utilities Consolidation

- Moved helper modules (`export-lib`, `export-ui`, `local-storage`, `web-midi-api`) into `src/utils/` with lowercase filenames to simplify imports and align naming conventions.
- Updated `src/faustlive.js` and `src/runfaust.js` to consume the relocated utilities.

## State & Audio Improvements

- Migrated local storage management (`src/localStorage.js`) from array tuples to JSON objects, automatically migrating legacy data and skipping redundant writes.
- Normalised numeric settings and upgraded audio input activation in `src/runfaust.js` to prefer `navigator.mediaDevices.getUserMedia`, with legacy fallbacks retained.

## UI Event Wiring

- Removed inline handlers from `index.html` and introduced `wireUiEvents()` in `src/faustlive.js` to bind toolbar, modal, and configuration events programmatically.
- Simplified the entry script in `index.html` to a single `import "./src/faustlive";`, reducing the global surface area and easing CSP hardening.

## Tooling

- Added ESLint (`package.json`, `.eslintrc.cjs`) and a `npm run lint` script to catch regressions in `src/`.
- Documented each major migration in `docs/steps/step-01-setup.md` through `step-04-tooling.md` for granular traceability.

## Documentation Pass

- Added module headers and JSDoc-style comments to `src/compilefaust.js`, `src/faustlive.js`, and `src/runfaust.js` to describe helper responsibilities and function behaviour.

## WASM Demo Modernization

- Updated `faustlive-wasm.html` to drop inline handlers and rely on module wiring.
- Refreshed `src/faustlive-wasm.js` with async fetch-based loading, shared storage utilities, and centralised UI event binding for the WASM demo.

## Build Verification

- `npm run build` succeeds and emits the optimized Vite bundle. Vite warns that Node.js 20.9.0 is below the preferred 20.19.0; upgrading Node will quiet the notice but is not required for the build to pass.
