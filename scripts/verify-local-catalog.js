const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const backend = vm.createContext({ console, Utilities: { formatDate: () => '2026-10-14' } });
for (const file of fs.readdirSync('gas').filter(file => file.endsWith('.gs'))) {
  vm.runInContext(fs.readFileSync(`gas/${file}`, 'utf8'), backend);
}
const run = code => vm.runInContext(code, backend);
run(`
var catalogs = {'Umo Grill':[{codigo:'PAR001',nombre:'Asado',unidad:'kg'}],
  'Trento Café':[{codigo:'CAF001',nombre:'Café',unidad:'kg'}]};
readCatalog_ = function(){return catalogs;};
function detail(id,local,code,name,qty,unit,status){
  return [id,'2026-10-12','Semana',local,'Operador','Normal',code,name,'',qty,unit,'',status||'Pendiente'];
}
var rows=[[],detail('1','Umo grill','PAR001','Asado',20,'kg'),
  detail('2','Trento Café','CAF001','Café',3,'kg'),
  detail('3','Trento Café','PAR001','Asado',10,'kg'),
  detail('4','Trento Café','','Nutella',2,'unidad'),
  detail('5','Trento Café','','Nutella',8,'kg'),
  detail('6','Trento Café','CAF001','Café',100,'paquete'),
  detail('7','Trento Café','','No recomendar',1,'unidad','Cancelado')];
ss_ = function(){return {getSheetByName:function(){return {
  getLastRow:function(){return rows.length;},getDataRange:function(){return {getValues:function(){return rows;}};}
};}};};
var intelligence=buildPedidoIntelligence_();
`);
assert.equal(run("normalizeLocalName_(' trento cafe ')"), 'Trento Café');
assert.equal(run("normalizeLocalName_('Umo grill')"), 'Umo Grill');
assert.equal(run("intelligence.byLocal['Umo Grill'].PAR001.cantidad_sugerida"), 20);
assert.equal(run("intelligence.byLocal['Trento Café'].CAF001.cantidad_sugerida"), 3);
assert.equal(run("intelligence.excludedByLocal['Trento Café']"), 1);
assert.equal(run("Object.values(intelligence.byLocal['Trento Café']).some(function(r){return r.codigo==='PAR001';})"), false);
assert.equal(run("intelligence.byLocal['Trento Café']['name:nutella|unit:unidad'].cantidad_sugerida"), 2);
assert.equal(run("intelligence.byLocal['Trento Café']['name:nutella|unit:kg'].cantidad_sugerida"), 8);
assert.equal(run("Object.values(intelligence.byLocal['Trento Café']).some(function(r){return r.producto==='No recomendar';})"), false);

const fields = {};
const field = id => fields[id] ||= {value:'',innerHTML:'',textContent:'',querySelectorAll:()=>[],querySelector:()=>null};
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const frontend = vm.createContext({
  console, Date, $:field, search:field('#prodSearch'), normalizeLooseText:norm, esc:String,
  num:value=>Number(value)||0, catalogStockBadge:()=>'', pedidoInsightButton:()=>'',
  isLowStock:()=>false, catalogUsageForLocal:()=>({CAF002:{count:100}}),
  state:{local:'Trento Café',items:[]}, orderCategory:'Recomendados',orderShowAllCategories:false,
  orderVisibleLimit:24,orderSort:'recommended',uid:0,toast:()=>{},scheduleDraftSave:()=>{},
  renderItems:()=>{},closeSuggest:()=>{},
  CATALOG:{'Trento Café':[{codigo:'CAF001',nombre:'Café',unidad:'kg'}, {codigo:'CAF002',nombre:'Torta',unidad:'unidad'}],
    'Umo Grill':[{codigo:'PAR001',nombre:'Asado',unidad:'kg'}]},
  PEDIDO_INTELLIGENCE:JSON.parse(run('JSON.stringify(intelligence)')),
  LOCALES:[{id:'Umo Grill'},{id:'Trento Café'}],LOCAL_ALIAS:{'Cafetería':'Trento Café'}
});
function load(start, end) {
  const a = html.indexOf(`function ${start}(`);
  const b = html.indexOf(`function ${end}(`,a);
  assert.ok(a>0&&b>a, `${start} exists`);
  vm.runInContext(html.slice(a,b), frontend);
}
load('pedidoInsightForItem','pedidoInsightButton');
load('renderQuickCatalog','setCatalogItemQuantity');
load('aliasKeys','normalizeCatalog');
load('addFromCatalog','addFree');
const ui = code => vm.runInContext(code,frontend);
assert.equal(ui("pedidoInsightForItem(CATALOG['Trento Café'][0]).cantidad_sugerida"),3);
assert.equal(ui("pedidoInsightForItem(CATALOG['Umo Grill'][0])"),null);
assert.equal(ui("localHistoryExtras('Trento Café').some(r=>r.codigo==='PAR001')"),false);
assert.equal(ui("localHistoryExtras('Trento Café').filter(r=>r.producto==='Nutella').length"),2);
ui('renderQuickCatalog()');
assert.match(field('#quickPickList').innerHTML,/Café/);
assert.doesNotMatch(field('#quickPickList').innerHTML,/Asado|Torta/);
assert.match(field('#orderCategories').innerHTML,/Ya pedidos|Otros del local/);
ui("orderCategory='Otros del local';renderQuickCatalog()");
assert.match(field('#quickPickList').innerHTML,/Torta/);
assert.doesNotMatch(field('#quickPickList').innerHTML,/Asado|Café/);
ui("orderCategory='Recomendados';PEDIDO_INTELLIGENCE={byLocal:{}};renderQuickCatalog()");
assert.doesNotMatch(field('#quickPickList').innerHTML,/quick-pick-name/,'No synthetic recommendations when history is absent');
ui("search.value='torta';renderQuickCatalog()");
assert.match(field('#quickPickList').innerHTML,/Torta/,'Search reaches the entire local catalog');
assert.doesNotMatch(field('#quickPickList').innerHTML,/Asado/);
ui("addFromCatalog(CATALOG['Umo Grill'][0])");
assert.equal(frontend.state.items.length,0,'Stale handlers cannot add a foreign product');
assert.equal(ui("aliasKeys({'Umo Grill':[{codigo:'PAR001'}],'Umo grill':[{codigo:'PAR002'}]})['Umo Grill'].length"),2);
assert.match(html,/let CATALOG = \{\};/,'No fake startup catalog');
console.log('Local catalog checks passed: local history, foreign-code exclusion, original units, canonical aliases, recommendations, search and stale-handler guard.');
