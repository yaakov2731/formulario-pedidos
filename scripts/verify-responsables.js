const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const posts = [];
const refreshed = [];
const ctx = vm.createContext({
  console, LIVE: true, CONFIG: { 'Trento Café': { enc: 'Ayelen', email: 'ayelen@example.com' } },
  RESP: { 'Trento Café': [{ nombre: 'Lucas', email: '' }] },
  refreshResponsableInputs: local => refreshed.push(local),
  apiPost: async payload => { posts.push(payload); }
});
function load(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert.ok(a > 0 && b > a, `${start} exists`);
  vm.runInContext(html.slice(a, b), ctx);
}
load('function responsablesForLocal(', 'function fillEncargadoSelect(');
load('function selectedResponsable(', 'function syncResponsableAddButton(');
load('function rememberResponsable(', 'async function addResponsableInline(');
const run = code => vm.runInContext(code, ctx);

run("rememberResponsable('Trento Café','  Martina ','martina@example.com')");
assert.equal(posts.length, 1);
assert.deepEqual({ ...posts[0] }, { action: 'addResponsable', local: 'Trento Café', nombre: 'Martina', email: 'martina@example.com' });
assert.ok(run("responsablesForLocal('Trento Café').some(p=>p.nombre==='Martina')"), 'new name listed immediately');
assert.deepEqual(refreshed, ['Trento Café']);

run("rememberResponsable('Trento Café','lucas')");
run("rememberResponsable('Trento Café','AYELEN')");
run("rememberResponsable('Trento Café','')");
run("rememberResponsable('','Pedro')");
assert.equal(posts.length, 1, 'existing, empty or local-less names are not saved again');

run("rememberResponsable('Umo Grill','Pedro','no-es-email')");
assert.equal(posts[1].email, '', 'invalid email is not sent');

run("LIVE=false; rememberResponsable('Brooklyn','Sofía')");
assert.equal(posts.length, 2, 'offline keeps the name on this device only');
assert.ok(run("responsablesForLocal('Brooklyn').some(p=>p.nombre==='Sofía')"));

run(`rememberResponsable('Trento Café','${'x'.repeat(81)}')`);
assert.ok(!run("responsablesForLocal('Trento Café').some(p=>p.nombre.length>80)"), 'names over the backend limit are ignored');

['submit', 'saveReception', 'saveProduction', 'saveElaborados', 'saveStock'].forEach(name => {
  const a = html.indexOf(`async function ${name}(`);
  const b = html.indexOf('\nasync function ', a + 10);
  assert.ok(html.slice(a, b > a ? b : undefined).includes('rememberResponsable('), `${name} remembers the typed responsable after confirmation`);
});
console.log('Responsables passed: typed names saved after confirmed loads, no duplicates, offline kept locally. Fixtures only.');
