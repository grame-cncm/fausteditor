# Faust Editor Modernization Overview

This document records the structural refactor completed on the `refactor-editor-runtime` branch.

## Runtime And Fetch Pipeline

- Added `src/utils/network.js` to consolidate `fetch` helpers with a timeout guard, used across the editor and FaustWeb integrations.
- Reworked `src/faustlive.js` drag-and-drop logic to eliminate implicit globals and synchronous `XMLHttpRequest` usage. Dropped files/URLs are now processed asynchronously with richer error handling.
- Updated `src/ExportLib.js` and `src/exportUI.js` to rely on promise-based `fetch` calls, improving fault reporting for target discovery, source upload, and remote compilation.

## State & Audio Improvements

- Migrated local storage management (`src/localStorage.js`) from array tuples to JSON objects, automatically migrating legacy data and skipping redundant writes.
- Normalised numeric settings and upgraded audio input activation in `src/runfaust.js` to prefer `navigator.mediaDevices.getUserMedia`, with legacy fallbacks retained.

## UI Event Wiring

- Removed inline handlers from `index.html` and introduced `wireUiEvents()` in `src/faustlive.js` to bind toolbar, modal, and configuration events programmatically.
- Simplified the entry script in `index.html` to a single `import "./src/faustlive";`, reducing the global surface area and easing CSP hardening.

## Tooling

- Added ESLint (`package.json`, `.eslintrc.cjs`) and a `npm run lint` script to catch regressions in `src/`.
- Documented each major migration in `docs/steps/step-01-setup.md` through `step-04-tooling.md` for granular traceability.

## Build Verification

- `npm run build` succeeds and emits the optimized Vite bundle. Vite warns that Node.js 20.9.0 is below the preferred 20.19.0; upgrading Node will quiet the notice but is not required for the build to pass.

Feedback welcome—let me know if you would like additional lint rules, automated tests, or parity updates to the `faustlive-wasm` demo entry point.
