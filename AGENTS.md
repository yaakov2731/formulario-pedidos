# Repository Guidelines

## Project Structure & Module Organization
This repository is intentionally small and operational:

- `index.html`: single-file frontend served by GitHub Pages.
- `Code.gs`: Google Apps Script backend bound to the master spreadsheet.
- `scripts/verify-v2.js`: local structural verification.
- `scripts/verify-live-v2.js`: verifies the published `/exec` backend.
- `README.md`, `DEPLOY-V2.md`, `PRODUCT.md`, `DESIGN.md`: product, deploy, and design references.

Keep UI logic in `index.html` and spreadsheet-facing logic in `Code.gs`. Avoid introducing extra build tooling unless strictly necessary.

## Build, Test, and Development Commands
There is no bundler or local dev server in this repo. Use the verification scripts before publishing:

```powershell
node .\scripts\verify-v2.js
node .\scripts\verify-live-v2.js
```

- `verify-v2.js`: checks that required V2 modules, endpoints, and data structures still exist locally.
- `verify-live-v2.js`: checks the live Apps Script URL referenced by `SCRIPT_URL` in `index.html`.

## Coding Style & Naming Conventions
Use 2-space indentation in `index.html` and keep the file readable by grouping related sections clearly. Prefer plain, explicit JavaScript over abstractions. Use `camelCase` for variables/functions, `UPPER_SNAKE_CASE` for constants such as `SCRIPT_URL`, and preserve Spanish UI copy exactly when requested.

In `Code.gs`, keep backend actions narrowly scoped and aligned with sheet names already in use, such as `PEDIDOS RECIBIDOS`, `PEDIDOS_DETALLE`, and `CONTROL STOCK`.

## Testing Guidelines
This repo uses verification scripts instead of a formal test framework. Run both scripts before deploys that touch frontend/backend contracts. After publishing, complete a manual smoke test covering `Pedido`, `Stock`, `Recepción`, `Producción`, and `Dashboard`.

## Commit & Pull Request Guidelines
Follow short, imperative commit subjects like the existing history:

- `Update pedidos wording`
- `Redesign stock workflow and quiet visual system`
- `Switch GitHub Pages to workflow deploy`

Prefer one focused change per commit. PRs should include a clear summary, impacted flows, spreadsheet or Apps Script implications, and screenshots when the visible UI changes.

## Deployment Notes
Publishing is two-part: deploy `Code.gs` from Apps Script, then push `main` for GitHub Pages. If the Apps Script web app URL changes, update `SCRIPT_URL` in `index.html` before closing the task.
