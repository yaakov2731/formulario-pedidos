const fs = require("fs");
const path = require("path");

function parseScriptUrl(indexHtml) {
  const match = indexHtml.match(/const SCRIPT_URL = "(https:\/\/script\.google\.com\/macros\/s\/[^"]+\/exec)";/);
  if (!match) throw new Error("SCRIPT_URL not found in index.html");
  return match[1];
}

async function getJson(url) {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

function logOk(msg) {
  console.log(`OK: ${msg}`);
}

function logFail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

function expect(cond, okMsg, failMsg) {
  if (cond) logOk(okMsg);
  else logFail(failMsg);
}

async function main() {
  const root = process.cwd();
  const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const scriptUrl = process.env.SCRIPT_URL || parseScriptUrl(indexHtml);

  console.log(`Checking live Apps Script: ${scriptUrl}`);

  const ping = await getJson(`${scriptUrl}?action=ping`);
  expect(ping && ping.ok === true, "ping responded", "ping did not return ok:true");

  const bootstrap = await getJson(`${scriptUrl}?action=getBootstrap`);
  expect(bootstrap && bootstrap.ok === true, "bootstrap responded", "bootstrap did not return ok:true");
  expect(bootstrap && bootstrap.version, "bootstrap version present", "bootstrap version missing");
  expect(bootstrap && bootstrap.capabilities, "bootstrap capabilities present", "bootstrap capabilities missing");

  expect(!!bootstrap.catalog, "catalog present", "catalog missing");
  expect(!!bootstrap.config, "config present", "config missing");
  expect(!!bootstrap.responsables, "responsables present", "responsables missing");

  expect(!!bootstrap.recepciones, "recepciones present", "recepciones missing in live deployment");
  expect(!!bootstrap.produccion, "produccion present", "produccion missing in live deployment");
  expect(!!bootstrap.elaborados, "elaborados present", "elaborados missing in live deployment");
  expect(!!bootstrap.snapshot, "snapshot present", "snapshot missing in live deployment");

  expect(!!(ping.capabilities && ping.capabilities.bootstrap_v2), "ping bootstrap_v2 enabled", "ping missing bootstrap_v2 capability");
  expect(!!(bootstrap.capabilities && bootstrap.capabilities.recepcion), "bootstrap recepcion enabled", "bootstrap missing recepcion capability");
  expect(!!(bootstrap.capabilities && bootstrap.capabilities.produccion), "bootstrap produccion enabled", "bootstrap missing produccion capability");
  expect(!!(bootstrap.capabilities && bootstrap.capabilities.elaborados_report), "elaborados report enabled", "bootstrap missing elaborados_report capability");
  expect(!!(bootstrap.capabilities && bootstrap.capabilities.catalog_product_status), "catalog product confirmation enabled", "bootstrap missing catalog_product_status capability");
  expect(!!(bootstrap.capabilities && bootstrap.capabilities.sheet_report_elaborados), "Google Sheets elaborados report enabled", "bootstrap missing sheet_report_elaborados capability");
  expect(!!(bootstrap.capabilities && bootstrap.capabilities.dashboard_v2), "bootstrap dashboard_v2 enabled", "bootstrap missing dashboard_v2 capability");

  expect(!!(bootstrap.snapshot && bootstrap.snapshot.totals), "snapshot totals present", "snapshot totals missing");
  expect(!!(bootstrap.snapshot && bootstrap.snapshot.byLocal), "snapshot byLocal present", "snapshot byLocal missing");
  expect(!!(bootstrap.snapshot && bootstrap.snapshot.openItemsByLocal), "snapshot openItemsByLocal present", "snapshot openItemsByLocal missing");

  const configKeys = Object.keys(bootstrap.config || {});
  expect(!configKeys.includes("Parrilla"), "Parrilla normalized", "config still exposes legacy local Parrilla");
  expect(!configKeys.includes("Heladería"), "Heladería normalized", "config still exposes legacy local Heladería");
  expect(!configKeys.includes("Cafetería"), "Cafetería normalized", "config still exposes legacy local Cafetería");
  expect(!configKeys.includes("Pizzería"), "Pizzería removed/inactive", "config still exposes legacy local Pizzería");
  expect(configKeys.includes("Umo Grill"), "Umo Grill present", "config missing Umo Grill");
  expect(configKeys.includes("Puerto Gelato"), "Puerto Gelato present", "config missing Puerto Gelato");
  expect(configKeys.includes("Trento Café"), "Trento Café present", "config missing Trento Café");
  expect(configKeys.includes("Brooklyn"), "Brooklyn present", "config missing Brooklyn");

  const snapshotKeys = Object.keys((bootstrap.snapshot && bootstrap.snapshot.byLocal) || {});
  expect(snapshotKeys.includes("Umo Grill"), "snapshot Umo Grill present", "snapshot missing Umo Grill");
  expect(snapshotKeys.includes("Brooklyn"), "snapshot Brooklyn present", "snapshot missing Brooklyn");
  const openItemsKeys = Object.keys((bootstrap.snapshot && bootstrap.snapshot.openItemsByLocal) || {});
  expect(!openItemsKeys.includes("Pizzería"), "snapshot Pizzería removed/inactive", "snapshot still exposes legacy local Pizzería");

  const report = await getJson(`${scriptUrl}?action=getElaboradosReport&local=${encodeURIComponent("Umo Grill")}`);
  expect(report && report.ok === true, "elaborados report responded", "elaborados report did not return ok:true");
  expect(Array.isArray(report && report.rows), "elaborados report rows present", "elaborados report rows missing");
  expect(report && report.local === "Umo Grill", "elaborados report local normalized", "elaborados report local mismatch");

  const catalogStatus = await getJson(`${scriptUrl}?action=getCatalogProductStatus&local=${encodeURIComponent("Umo Grill")}`);
  expect(catalogStatus && catalogStatus.ok === true, "catalog product status responded", "catalog product status did not return ok:true");
  expect(Number(catalogStatus && catalogStatus.local_count) > 0, "Umo Grill catalog available", "Umo Grill catalog is empty or unavailable");

  if (process.exitCode) {
    console.error("\nLive V2 verification failed. The published /exec is behind the local code.");
    process.exit(process.exitCode);
  }

  console.log("\nLive V2 verification passed.");
}

main().catch((err) => {
  console.error(`FAIL: ${err.message}`);
  process.exit(1);
});
