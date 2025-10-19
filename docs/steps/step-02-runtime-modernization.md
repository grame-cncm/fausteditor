# Step 02 – Runtime Modernization

- Introduced `src/utils/network.js` to centralize `fetch` helpers with timeout support (`fetchText`, `fetchJson`, `fetchWithTimeout`).
- Reworked `src/faustlive.js` drag-and-drop pipeline: removed implicit globals, switched to asynchronous fetch/file parsing, and hardened filename handling.
- Converted FaustWeb integration (`src/ExportLib.js` & `src/exportUI.js`) from legacy `XMLHttpRequest` callbacks to promise-based `fetch` flows with explicit error propagation.
- Upgraded audio input setup in `src/runfaust.js` to prefer `navigator.mediaDevices.getUserMedia` with graceful fallback and unified error handling.
- Migrated `src/localStorage.js` to object-based persistence with change detection, reducing redundant writes from the recurring autosave loop.

Notes: the WebAssembly demo entry-point still uses the legacy drop handlers; it will be aligned once the shared UI wiring lands.
