const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Run production functions against an in-memory sheet; never write live data.
const context = vm.createContext({ console, isFinite });
for (const file of fs.readdirSync('gas').filter(file => file.endsWith('.gs'))) {
  vm.runInContext(fs.readFileSync(`gas/${file}`, 'utf8'), context, { filename: file });
}
const run = code => vm.runInContext(code, context);
run(`
var testRows = [
  ['Código','Producto','Local_Aplicable','Categoría','Unidad_Medida','Proveedor','Stock_Mínimo','Stock_Actual'],
  ['PAR001','Aceite','Umo Grill','Almacén','litro','Proveedor original',12,5]
];
var testSheet = {
  getDataRange: function(){ return { getValues: function(){ return testRows; } }; },
  getRange: function(r,c){ return {setValue:function(v){testRows[r-1][c-1]=v;}}; }
};
ss_ = function(){return {getSheetByName:function(){return testSheet;}};};
invalidateBootstrapCaches_ = function(){};
`);
assert.equal(run("validateCatalogPar_({stock_minimo:-1}).ok"), false);
assert.equal(run("validateCatalogPar_({stock_minimo:'abc'}).ok"), false);
assert.equal(run("validateCatalogPar_({stock_minimo:'1,5'}).value"), 1.5);
assert.equal(run("validateCatalogPar_({stock_minimo:0}).value"), 0);
assert.equal(run("validateCatalogPar_({stock_minimo:''}).value"), '');
assert.equal(run("updateProductoCatalogo_({codigo:'PAR001',local:'GreenFresh',nombre:'Incorrecto',stock_minimo:20}).ok"), false);
assert.equal(run("testRows[1][1]"), 'Aceite');
assert.equal(run("updateProductoCatalogo_({codigo:'PAR001',local:'Umo Grill',nombre:'Aceite nuevo'}).ok"), true);
assert.equal(run("testRows[1][6]"), 12, 'Legacy name-only edits preserve the objective');
assert.equal(run("updateProductoCatalogo_({codigo:'PAR001',local:'Umo Grill',nombre:'Aceite nuevo',categoria:'Despensa',unidad:'litro',proveedor:'Nuevo',stock_minimo:20}).ok"), true);
assert.equal(run("getCatalogProductStatus_('Umo Grill','PAR001','').product.stock_minimo"), 20);
assert.equal(run("testRows[1][7]"), 5, 'Catalog edits preserve actual stock');

function decision(stock, par, pending, habitual) {
  context.testStock = stock;
  context.testPar = par;
  context.testPending = pending;
  context.testHabitual = habitual;
  return run(`(function(){
    var key = keyFor_('Umo Grill','PAR001','Aceite');
    var demand = {}; demand[key] = {cantidad:testPending,pedidos:1};
    return buildDecisionCenterByLocal_({catalog:{'Umo Grill':[{codigo:'PAR001',nombre:'Aceite',stock_actual:testStock,stock_minimo:testPar}]},demandMap:demand,stockMap:{}},
      {byLocal:{'Umo Grill':{PAR001:{cantidad_sugerida:testHabitual}}}})['Umo Grill'];
  })()`);
}
assert.equal(decision(5, 12, 0, 0).suggestions[0].cantidad_sugerida, 7);
assert.equal(decision(5, 12, 20, 10).suggestions[0].cantidad_sugerida, 15);
assert.equal(decision(15, 12, 0, 10).summary.cubiertos, 1);
assert.equal(decision('', 12, 0, 0).summary.contar, 1);
assert.equal(decision('', 12, 0, 0).suggestions.length, 0);
assert.equal(decision(0, 0, 0, 0).suggestions.length, 0);
assert.equal(run("operationalStockValue_({stock_actual:15},{stock_real:10})"),15,'Reception balance supersedes historical count');
assert.equal(run("operationalStockValue_({stock_actual:7},{stock_real:10})"),7,'Production balance supersedes historical count');
assert.equal(run("operationalStockValue_({stock_actual:0},{stock_real:10})"),0,'Zero balance is not replaced by an old positive count');
assert.equal(run("operationalStockValue_({stock_actual:-2},{stock_real:10})"),-2,'Negative balance remains visible');
assert.equal(run("operationalStockValue_({stock_actual:''},{stock_real:10})"),10,'Historical count remains a fallback');
assert.equal(run("operationalStockValue_({stock_actual:''},null)"),null,'Unknown balance remains unknown');
assert.equal(run(`(function(){
  var key=keyFor_('Umo Grill','PAR001','Aceite');
  var stockMap={};stockMap[key]={stock_real:10};
  return buildDecisionCenterByLocal_({catalog:{'Umo Grill':[{codigo:'PAR001',nombre:'Aceite',stock_actual:15,stock_minimo:20}]},stockMap:stockMap,demandMap:{}},{byLocal:{}})['Umo Grill'].suggestions[0].cantidad_sugerida;
})()`),5,'Decision center uses the updated balance, not historical count');
console.log('Stock objective verification passed: validation, local scope, partial edits, stock preservation, purchase math and unknown counts.');
