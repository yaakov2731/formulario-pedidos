const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const ctx=vm.createContext({console,
  esc:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;'),
  num:value=>{const n=parseFloat(String(value).replace(',','.'));return Number.isFinite(n)?n:null;},
  trim:value=>Number(Number(value).toFixed(2)),qtyText:(quantity,unit)=>`${quantity} ${unit}`,
  state:{local:'Trento Café',items:[]},CATALOG:{},getCatalogMap:()=>new Map()
});
const load=(first,last)=>{
  const start=html.indexOf(`function ${first}(`),end=html.indexOf(`function ${last}(`,start);
  assert.ok(start>0&&end>start);vm.runInContext(html.slice(start,end),ctx);
};
load('dashboardCardsForLocal','renderRecepcionModule');
load('stockMetaForItem','localOperationalMetrics');
load('stockKey','ensureStockSelection');
const run=code=>vm.runInContext(code,ctx);
ctx.rows=[{qty:1,unidad:'kg'},{qty:'0,5',unidad:' KG '},{qty:2,unidad:'litro'},
  {qty:3,unidad:'unidad'},{qty:0,unidad:'caja'},{qty:-1,unidad:'kg'},
  {qty:'',unidad:'kg'},{qty:null,unidad:'litro'},{qty:'2kg',unidad:'kg'},
  {qty:4,unidad:''},{qty:200,unidad:'g'}];
const grouped=JSON.parse(run("JSON.stringify(groupQuantitiesByUnit(rows,'qty','unidad'))"));
assert.equal(grouped.groups.find(row=>row.unit==='kg').quantity,0.5);
assert.equal(grouped.groups.find(row=>row.unit==='g').quantity,200,'No implicit g-to-kg conversion');
assert.equal(grouped.groups.find(row=>row.unit==='caja').quantity,0,'Zero remains known');
assert.equal(grouped.groups.some(row=>row.unit==='Sin unidad'),false,'Missing measures cannot be aggregated');
assert.equal(grouped.missingUnit,1);
assert.equal(grouped.unknown,3,'Missing and invalid quantities never become zero');
assert.equal(grouped.negative,1,'Anomalous balances remain explicit');
assert.deepEqual(ctx.rows[5],{qty:-1,unidad:'kg'},'No source-data mutation');
assert.match(run("unitQuantityCard('Stock',rows,'qty','unidad')"),/Sin conversiones|saldos negativos|sin cantidad confirmada/);
ctx.decimals=[{qty:0.1,unidad:'kg'},{qty:0.2,unidad:'kg'}];
assert.equal(run("groupQuantitiesByUnit(decimals,'qty','unidad').groups[0].quantity"),0.3);
assert.equal(run("quantitiesByUnitText([], 'qty','unidad')"),'Sin cantidades cargadas');

ctx.CATALOG={'Trento Café':[{codigo:'CAF001',nombre:'Café',unidad:'kg',stock_actual:3},
  {codigo:'CAF002',nombre:'Leche',unidad:'litro',stock_actual:5}]};
ctx.getCatalogMap=()=>new Map(ctx.CATALOG['Trento Café'].map(item=>[`code:${item.codigo}`,item]));
ctx.state.items=[{codigo:'CAF001',nombre:'Café',qty:1,unidad:'kg'},
  {codigo:'CAF001',nombre:'Café',qty:2,unidad:'kg'},
  {codigo:'CAF002',nombre:'Leche',qty:2,unidad:'litro'},
  {codigo:'',nombre:'Café',qty:200,unidad:'g',free:true}];
const pedido=run("dashboardCardsForPedido({ok:2,bad:0,soft:0},CATALOG['Trento Café'])");
assert.match(pedido,/<dt>kg<\/dt><dd>3<\/dd>/);
assert.match(pedido,/<dt>litro<\/dt><dd>5<\/dd>/);
assert.doesNotMatch(pedido,/<dt>kg<\/dt><dd>6<\/dd>/,'Repeated order lines cannot double-count available stock');
assert.match(pedido,/<dt>g<\/dt><dd>200<\/dd>/,'Free products retain their requested unit');
const local=run("dashboardCardsForLocal(CATALOG['Trento Café'])");
assert.doesNotMatch(local,/Stock total visible|suma de cantidades/);
assert.match(local,/Stock por unidad/);
ctx.CATALOG['Trento Café'][0].stock_actual=-2;
assert.equal(run("stockMetaForItem(state.items[0]).status"),'soft','Negative balance means review, not buy');
ctx.CATALOG['Trento Café'][0].stock_actual=3;
ctx.state.items[0].unidad='KG';
assert.equal(run("stockMetaForItem(state.items[0]).status"),'ok','Case variants refer to the same measure');
ctx.state.items[0].unidad='g';
assert.equal(run("stockMetaForItem(state.items[0]).label"),'Unidad distinta');
console.log('Unit quantities passed: separate measures, zero, unknown, negative, decimals, no conversion, stock deduplication and no writes.');
