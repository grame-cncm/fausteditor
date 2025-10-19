# Step 04 – Tooling And Wrap-Up

- Added `eslint` as a development dependency and exposed an `npm run lint` script to analyze `src/`.
- Checked in a minimal `.eslintrc.cjs` that targets modern browsers, ignores build artefacts, and keeps console usage opt-in.
- Compiled all improvements into a feature branch (`refactor-editor-runtime`) with per-step notes under `docs/steps/` for traceability.

Next: run `npm install` followed by `npm run lint` to activate the new checks.
