# Step 05 – Utilities Consolidation

- Renamed helper modules (`ExportLib`, `exportUI`, `localStorage`, `WebMIDIAPI`) to lowercase files and moved them into `src/utils/` for consistency.
- Updated all imports (`src/faustlive.js`, `src/runfaust.js`, and the utilities themselves) to consume the new paths.
- Adjusted `src/utils/export-lib.js` to reference the colocated `network` helper after the move.
- Re-ran `npm run build` to verify the new module layout; build succeeded (with the existing Node 20.9.0 warning).
