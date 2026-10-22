// Genera los PNG de app/icons a partir de app/icons/icon.svg con Chromium (Playwright).
// Uso: node scripts/app-icons.js   (manual; los PNG quedan versionados en el repo)
const path = require('node:path');
const fs = require('node:fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const DIR = path.resolve(__dirname, '..', 'app', 'icons');
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const svg = fs.readFileSync(path.join(DIR, 'icon.svg'), 'utf8');

(async () => {
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  async function render(size, file, maskable) {
    await page.setViewportSize({ width: size, height: size });
    // maskable: el sistema recorta el 10% de cada lado; el dibujo va centrado al 80% sobre fondo pleno.
    const inner = maskable ? Math.round(size * 0.8) : size;
    const off = Math.round((size - inner) / 2);
    const body = maskable
      ? `<div style="width:${size}px;height:${size}px;background:#0E1A2B;position:relative"><div style="position:absolute;left:${off}px;top:${off}px;width:${inner}px;height:${inner}px">${svg.replace('width="512" height="512"', `width="${inner}" height="${inner}"`)}</div></div>`
      : svg.replace('width="512" height="512"', `width="${size}" height="${size}"`);
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${body}</body></html>`);
    await page.screenshot({ path: path.join(DIR, file), omitBackground: !maskable, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('·', file);
  }
  await render(180, 'icon-180.png');
  await render(192, 'icon-192.png');
  await render(512, 'icon-512.png');
  await render(512, 'icon-maskable-512.png', true);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
