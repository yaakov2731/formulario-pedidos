const fs = require("fs");
const path = require("path");

const root = process.cwd();
const indexPath = path.join(root, "index.html");
const codePath = path.join(root, "Code.gs");
const gasDir = path.join(root, "gas");
const faviconPath = path.join(root, "favicon.svg");

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
  if (!fs.existsSync(codePath) && !fs.existsSync(gasDir)) {
    fail("Apps Script backend not found (Code.gs or gas/*.gs)");
    return;
  }
  if (!fs.existsSync(faviconPath)) fail("favicon.svg not found");
  else pass("favicon.svg present");

  const html = read(indexPath);
  expectContains(html, 'Docks / Cobalto: sistema visual operativo', 'professional operational palette');
  expectContains(html, 'data-design-version="docks-cobalto-v4"', 'coherent design version');
  expectContains(html, '<h2>Pedidos semanales</h2>', 'operational home title');
  expectContains(html, '.stock-card.metric,.stock-dash-card{padding:12px 0;border:0;', 'unboxed compact metrics');
  expectContains(html, 'body.compact-mobile-shell .home-pulse,body.compact-mobile-shell .local-action', 'mobile legacy card overrides disabled');
  expectNotContains(html, '<h2>Resumen del local</h2>', 'generic report heading');
  expectNotContains(html, 'Todo listo para el servicio.', 'promotional home copy');
  expectNotContains(html, 'Lo importante, sin buscarlo', 'generic report copy');
  expectNotContains(html, 'Fraunces', 'display serif in operational interface');
  expectNotContains(html, 'SERVICE / BOARD', 'decorative service board label');
  const code = fs.existsSync(codePath)
    ? read(codePath)
    : fs.readdirSync(gasDir)
      .filter((file) => file.endsWith(".gs"))
      .sort()
      .map((file) => read(path.join(gasDir, file)))
      .join("\n");

  expectRegex(html, /const SCRIPT_URL = "https:\/\/script\.google\.com\/macros\/s\/.+\/exec";/, "SCRIPT_URL configured");

  ["pedido", "stock", "recepcion", "produccion", "elaborados", "reportes"].forEach((tab) => {
    expectContains(html, `data-tab="${tab}"`, `tab ${tab}`);
  });

  [
    "id=\"recepGrid\"",
    "id=\"prodGrid\"",
    "id=\"dashRiskList\"",
    "id=\"dashActivityList\"",
    "id=\"dashDecisionCenter\"",
    "id=\"dashDecisionSummary\"",
    "id=\"dashDecisionList\"",
    "id=\"recepSearch\"",
    "id=\"prodInsumoSearch\"",
    "id=\"recepMore\"",
    "id=\"prodMore\"",
    "id=\"elabRecentList\"",
    "id=\"shellSidebar\"",
    "data-design-version=\"docks-cobalto-v4\"",
    "id=\"mobileTabbar\"",
    "data-mobile-more",
    "body.shell-menu-open,body.modal-open",
    "function syncModalLock()",
    "id=\"shellMenuBtn\"",
    "id=\"sidebarLocalName\"",
    "data-admin-nav",
    "data-module-config=\"pedido\"",
    "data-module-config=\"stock\"",
    "data-module-config=\"recepcion\"",
    "data-module-config=\"produccion\"",
    "data-module-config=\"elaborados\"",
    "document.querySelectorAll(\"[data-module-config]\")",
    "Cargar desde foto",
    "tesseract.min.js",
    "<option value=\"Marcado\">Marcado</option>",
    "<option value=\"Crudo\">Crudo</option>",
    "id=\"homeSystemStatus\"",
    "id=\"homePulse\"",
    "id=\"homePulseList\"",
    "aria-live=\"polite\"",
    "rel=\"icon\" href=\"favicon.svg\"",
    "meta name=\"description\"",
  ].forEach((id) => expectContains(html, id, `frontend control ${id}`));

  [
    "function saveReception()",
    "function saveProduction()",
    "function renderDashboard()",
    "function renderDecisionCenter()",
    "function activityTimeLabel(value)",
    "function renderRecepcionModule()",
    "function renderProduccionModule()",
    "function renderElaboradosModule()",
    "async function saveElaborados()",
    "async function confirmCatalogProduct(",
    "function localOperationalMetrics()",
    "function renderOperationalPulse()",
    "function pedidoInsightForItem(item)",
    "function pedidoInsightButton(item)",
    "async function confirmPedidoPersisted(",
    "async function confirmOperationPersisted(",
    "async function backendGet(",
    "function setConnectionState(status,txt)",
    "function syncWriteAvailability()",
    "function requireLiveWrite(label)",
    "No se pueden confirmar riesgos sin conexión.",
    "Sin conexión: el guardado no está disponible",
    "await apiPost(payload);",
    "applyReceptionOptimistic(",
    "applyProductionOptimistic(",
  ].forEach((needle) => expectContains(html, needle, `frontend logic ${needle}`));

  expectContains(html, 'const DRAFT_STORAGE_KEY = "docks-pedidos-operational-drafts-v1"', "operational draft storage key");
  expectContains(html, "function persistOperationalDrafts()", "operational drafts persist locally");
  expectContains(html, "function restoreOperationalDrafts()", "operational drafts restore after reload");
  expectContains(html, "function hasMeaningfulOperationalDraft(saved)", "empty defaults do not trigger recovered draft messaging");
  expectContains(html, 'window.addEventListener("pagehide",persistOperationalDrafts)', "operational drafts flush on page exit");
  expectContains(html, "clearStockDrafts(local);", "confirmed stock clears its local draft");
  expectContains(html, 'id="serviceAlert" role="alert"', "offline service alert is visible to assistive technology");
  expectContains(html, 'id="serviceRetry"', "offline service retry control");
  expectContains(html, "async function retryConnection()", "offline service can retry the live backend");
  expectContains(html, "Los borradores quedan protegidos en este dispositivo.", "offline service explains draft safety");
  expectContains(html, 'id="orderCategories"', "pedido category filters");
  expectContains(html, 'id="orderSort"', "pedido smart catalog sorting");
  expectContains(html, 'id="orderMore"', "pedido catalog pagination");
  expectContains(html, 'const CATALOG_USAGE_KEY = "docks-pedidos-catalog-usage-v1"', "pedido confirmed usage memory");
  expectContains(html, "function catalogStockBadge(", "pedido stock context badges");
  expectContains(html, "normalizeLooseText(search.value.trim())", "pedido accent tolerant search");
  expectContains(html, "function setCatalogItemQuantity(", "pedido inline quantity controls");
  expectContains(html, "SNAPSHOT.openItemsByLocal", "home pulse reads live open items");
  expectContains(html, "metrics.cat.filter(isLowStock)", "home pulse reads catalog stock risk");
  expectContains(html, "recepDraftStats(state.local)", "home pulse reads local operational drafts");
  expectContains(html, "d.pedido_intelligence", "shared order intelligence bootstrap");
  expectContains(html, "data-use-suggested", "shared habitual quantity action");
  expectContains(html, "Number(insight.pedidos)", "shared order history recommendation score");
  expectContains(html, "target-stock", "stock-aware objective order suggestion");
  expectContains(html, "Cubierto · ${context}", "covered objective demand state");
  expectContains(html, 'id="cfgPMin"', "editable catalog stock objective");
  expectContains(html, 'id="recepScope"', "reception catalog scopes");
  expectContains(code, "buildReceptionGuideByLocal_(snap.activeRows || [])", "complete reception guide uses all active rows");
  expectContains(code, "catalog_par: true", "stock objective backend capability");
  expectContains(html, "SNAPSHOT.decisionCenterByLocal", "decision center reads live operational decisions");
  expectContains(html, "data-decision-add", "decision center can stage a suggested purchase");
  expectContains(html, "data-decision-stock", "decision center can open stock counting");
  expectContains(html, "function jsonpGet_(url", "browser reads Apps Script through JSONP");
  expectContains(code, "function webResponse_(obj, e)", "backend exposes safe JSONP responses");
  expectContains(html, "partes históricos", "dashboard labels accumulated production honestly");
  ["encargado", "recepEncargado", "prodEncargado", "elabEncargado", "stockEncargado"].forEach((id) => {
    expectRegex(html, new RegExp(`id="${id}"[^>]+list="${id}Options"`), `editable responsable combobox ${id}`);
    expectContains(html, `data-responsable-add="${id}"`, `inline responsable add ${id}`);
  });
  expectContains(html, "async function addResponsableInline(", "inline responsable persistence");
  expectContains(html, 'id="pedidoReviewStatus" role="status"', "pedido review status");
  expectContains(html, "Confirmar y enviar", "pedido explicit confirmation action");
  expectNotContains(html, 'data-pedido-step="datos"', "legacy pedido data step removed");
  expectNotContains(html, 'data-pedido-step="cierre"', "legacy pedido closing step removed");

  expectNotContains(html, "renderReportesModule", "app report renderer removed");
  expectNotContains(html, 'id="reportPrint"', "app report print control removed");
  expectContains(html, 'data-shell-tab="reportes"', "executive report navigation");
  expectContains(html, "if(state.tab===\"reportes\") renderDashboard();", "executive report uses live dashboard data");
  ["Umo Grill", "GreenFresh", "Puerto Gelato", "Trento Café", "Brooklyn", "Shopping"].forEach((local) => {
    expectContains(html, `{ id:\"${local}\"`, `real local ${local}`);
  });
  ["Ciro", "Eventos"].forEach((local) => {
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
    "created: false, responsable:",
    "if (!responsable.nombre) continue;",
    "function buildFrontendOperationalSnapshot_(pedidoIntelligence) {",
    "function buildPedidoIntelligence_() {",
    "function buildDecisionCenterByLocal_(snap, pedidoIntelligence) {",
    "pedido_intelligence: pedidoIntelligence",
    "pedido_intelligence: true",
    "decision_center: true",
    "if (action === 'getPedidoStatus') {",
    "if (action === 'getOperationStatus') {",
    "function getPedidoStatus_(pedidoId) {",
    "function getOperationStatus_(type, operationId) {",
    "function notifyTelegramForPedido_(pedido) {",
    "function setTelegramConfig(botToken, chatId) {",
    "function splitTelegramMessage_(messageText, maxLength) {",
    "function sendTelegramChunk_(settings, text) {",
    "function probeTelegramTarget_(settings) {",
    "function testTelegramDelivery() {",
    "function buildOpenItemsByLocal_() {",
    "function refreshMovementViews_() {",
    "function ensureVersion2Sheets_() {",
    "function applyCatalogColumnUpdates_(",
  ].forEach((needle) => expectContains(code, needle, `backend logic ${needle}`));

  expectContains(html, "async function confirmResponsable(local, expected", "responsable saves require backend confirmation");
  expectContains(html, "No se pudo confirmar en Google Sheets. Revisá la conexión de Apps Script.", "responsable connection failure is explicit");
  expectNotContains(html, '(RESP[local]=RESP[local]||[]).push({nombre,email:payload.email});', "unconfirmed responsable optimistic insert removed");

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
