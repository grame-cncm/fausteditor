# Step 03 – UI Wiring Cleanup

- Removed all inline event handlers from `index.html`, eliminating the need for global function exports.
- Added `wireUiEvents()` in `src/faustlive.js` to register click/change/key listeners for toolbar buttons, configuration selects, export dialog controls, and modal close buttons.
- Updated the runtime imports to hook storage toggles, render configuration selectors, and FaustWeb targets through explicit listeners.
- Simplified the page entry script to `import "./src/faustlive";`, allowing Vite to bundle the editor without leaking APIs on `window`.

Result: UI behaviour now lives in the modules alongside the logic they exercise, paving the way for stronger CSP settings and module-level testing.
