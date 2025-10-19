# Step 07 – WASM Demo Modernization

- Removed inline event handlers from `faustlive-wasm.html` and now bootstrap the demo via the module entry point only.
- Reworked `src/faustlive-wasm.js` to reuse shared `network` and `local-storage` utilities, support async drag-and-drop loading, and centralise configuration wiring.
- Added drop-zone hover feedback, safer menu handling, and retained poly/mono compilation logic while surfacing better error messages.
- Verified the changes with `npm run build` (still warns about Node 20.9.0 being below Vite’s preferred version).
