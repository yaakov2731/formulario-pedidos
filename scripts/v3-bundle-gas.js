// Une v3/gas/*.gs en un solo archivo para pegar en el editor de Apps Script.
// Uso: node scripts/v3-bundle-gas.js          -> escribe v3/apps-script/DocksV3.gs
//      node scripts/v3-bundle-gas.js --check  -> falla si el paquete está desactualizado
const fs = require('node:fs');
const path = require('node:path');
const SRC = path.resolve(__dirname, '..', 'v3', 'gas');
const OUT_DIR = path.resolve(__dirname, '..', 'v3', 'apps-script');
const OUT = path.join(OUT_DIR, 'DocksV3.gs');

function build() {
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).sort();
  const parts = files.map(f => `// ===== ${f} =====\n` + fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\r\n/g, '\n').trimEnd() + '\n');
  return '// Docks V3 · backend en un solo archivo. Generado por scripts/v3-bundle-gas.js; no editar a mano.\n' +
    '// Fuente: v3/gas/*.gs\n\n' + parts.join('\n');
}

const content = build();
if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (current !== content) {
    console.error('v3/apps-script/DocksV3.gs está desactualizado. Ejecutar: node scripts/v3-bundle-gas.js');
    process.exit(1);
  }
  console.log('V3 Apps Script bundle is up to date.');
} else {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, content);
  fs.copyFileSync(path.join(SRC, 'appsscript.json'), path.join(OUT_DIR, 'appsscript.json'));
  console.log('Escrito', path.relative(process.cwd(), OUT));
}
