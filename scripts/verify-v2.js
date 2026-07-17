const fs = require("fs");
const path = require("path");

const root = process.cwd();
const indexPath = path.join(root, "index.html");
const codePath = path.join(root, "Code.gs");

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`OK: ${message}`);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function expectContains(source, needle, label) {
  if (!source.includes(needle)) fail(`${label} missing: ${needle}`);
  else pass(label);
}

function expectRegex(source, regex, label) {
  if (!regex.test(source)) fail(`${label} missing: ${regex}`);
  else pass(label);
}

function expectNotContains(source, needle, label) {
  if (source.includes(needle)) fail(`${label} still present: ${needle}`);
  else pass(label);
}

function main() {
  if (!fs.existsSync(indexPath)) {
    fail("index.html not found");
    return;
  }
  if (!fs.existsSync(codePath)) {
    fail("Code.gs not found");
    return;
  }

  const html = read(indexPath);
  const code = read(codePath);

  expectRegex(html, /const SCRIPT_URL = "https:\/\/script\.google\.com\/macros\/s\/.+\/exec";/, "SCRIPT_URL configured");

  ["pedido", "stock", "recepcion", "produccion", "elaborados", "reportes"].forEach((tab) => {
    expectContains(html, `data-tab="${tab}"`, `tab ${tab}`);
  });

  [
    "id=\"recepGrid\"",
    "id=\"prodGrid\"",
    "id=\"dashRiskList\"",
    "id=\"dashActivityList\"",
    "id=\"recepSearch\"",
    "id=\"prodInsumoSearch\"",
    "id=\"recepMore\"",
    "id=\"prodMore\"",
    "id=\"elabRecentList\"",
    "id=\"shellSidebar\"",
    "data-design-version=\"reference-handoff-v2\"",
    "id=\"shellMenuBtn\"",
    "id=\"sidebarLocalName\"",
    "data-admin-nav",
    "Cargar desde foto",
    "tesseract.min.js",
    "<option value=\"Marcado\">Marcado</option>",
    "<option value=\"Crudo\">Crudo</option>",
  ].forEach((id) => expectContains(html, id, `frontend control ${id}`));

  [
    "function saveReception()",
    "function saveProduction()",
    "function renderDashboard()",
    "function renderRecepcionModule()",
    "function renderProduccionModule()",
    "function renderElaboradosModule()",
    "async function saveElaborados()",
    "async function confirmCatalogProduct(",
    "function localOperationalMetrics()",
    "async function confirmPedidoPersisted(",
    "async function confirmOperationPersisted(",
    "async function backendGet(",
    "await apiPost(payload);",
    "applyReceptionOptimistic(",
    "applyProductionOptimistic(",
  ].forEach((needle) => expectContains(html, needle, `frontend logic ${needle}`));

  expectNotContains(html, "renderReportesModule", "app report renderer removed");
  expectNotContains(html, 'id="reportPrint"', "app report print control removed");
  expectContains(html, 'data-shell-tab="reportes"', "executive report navigation");
  expectContains(html, "if(state.tab===\"reportes\") renderDashboard();", "executive report uses live dashboard data");
  ["Umo Grill", "GreenFresh", "Puerto Gelato", "Trento Café", "Brooklyn"].forEach((local) => {
    expectContains(html, `{ id:\"${local}\"`, `real local ${local}`);
  });
  ["Ciro", "Eventos", "Shopping"].forEach((local) => {
    expectNotContains(html, `{ id:\"${local}\"`, `legacy local hidden ${local}`);
  });

  [
    "var SHEET_RECEPCION = 'CONTROL RECEPCION';",
    "var SHEET_PRODUCCION = 'CONTROL PRODUCCION';",
    "var SHEET_VIEW_REC = 'VISTA RECEPCION';",
    "var SHEET_VIEW_PROD = 'VISTA PRODUCCION';",
    "var SHEET_LOCAL_PED_PREFIX = 'LOCAL PEDIDO · ';",
    "var SHEET_LOCAL_STK_PREFIX = 'LOCAL STOCK · ';",
    "if (data.action === 'saveReception')",
    "if (data.action === 'saveProduction')",
    "if (action === 'getElaboradosReport')",
    "if (action === 'getCatalogProductStatus')",
    "function saveRecepcion_(d) {",
    "function saveProduccion_(d) {",
    "function getElaboradosReport_(local, desde, hasta) {",
    "function getCatalogProductStatus_(local, codigo, nombre) {",
    "function buildReporteSobrantes_() {",
    "var SHEET_REPORT_ELAB = 'REPORTE SOBRANTES';",
    "function buildVistaRecepcion_() {",
    "function buildVistaProduccion_() {",
    "function buildLocalPedidoViews_() {",
    "function buildLocalStockViews_() {",
    "function operationalLocals_() {",
    "function buildFrontendOperationalSnapshot_() {",
    "if (action === 'getPedidoStatus') {",
    "if (action === 'getOperationStatus') {",
    "function getPedidoStatus_(pedidoId) {",
    "function getOperationStatus_(type, operationId) {",
    "function notifyTelegramForPedido_(pedido) {",
    "function setTelegramConfig(botToken, chatId) {",
    "function buildOpenItemsByLocal_() {",
    "function refreshMovementViews_() {",
    "function ensureVersion2Sheets_() {",
    "function applyCatalogColumnUpdates_(",
  ].forEach((needle) => expectContains(code, needle, `backend logic ${needle}`));

  [
    "{ from: 'Hamburguesería', to: 'Brooklyn' }",
    "{ from: 'Parrilla', to: 'Umo Grill' }",
    "{ from: 'Heladería', to: 'Puerto Gelato' }",
    "{ from: 'Cafetería', to: 'Trento Café' }",
  ].forEach((needle) => expectContains(code, needle, `legacy normalization ${needle}`));

  expectContains(code, "totalRecepcionMovimientos: recepcion.total_movimientos || 0", "dashboard uses full reception history");
  expectContains(code, "totalProduccionMovimientos: produccion.total_movimientos || 0", "dashboard uses full production history");

  if (process.exitCode) {
    console.error("\nV2 verification failed.");
    process.exit(process.exitCode);
  }

  console.log("\nV2 verification passed.");
}

main();
