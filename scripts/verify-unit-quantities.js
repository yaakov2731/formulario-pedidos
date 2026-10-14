const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const productionBackend=vm.createContext({console});
for(const file of fs.readdirSync('gas').filter(file=>file.endsWith('.gs'))) vm.runInContext(fs.readFileSync(`gas/${file}`,'utf8'),productionBackend);
const productionRun=code=>vm.runInContext(code,productionBackend);
productionRun(`
var catalogCells=[CATALOGO_HEADERS.slice(),
 ['CAF001','Café','','Trento Café','Café','kg',0,'Proveedor',5,'','',''],
 ['CAF002','Leche','','Trento Café','Lácteos','litro',0,'Proveedor','','','',''],
 ['PAR001','Asado','','Umo Grill','Carnes','kg',0,'Proveedor',40,'','','']];
var savedProductions=[], lockTrace=[], allowLock=true, failFlush=false;
ss_=function(){return {getSheetByName:function(name){return name===SHEET_CATALOGO?
 {getLastRow:function(){return catalogCells.length;},getDataRange:function(){return {getValues:function(){return catalogCells;}};}}:
 {getLastRow:function(){return savedProductions.length;},getRange:function(){return {setValues:function(rows){savedProductions.push(JSON.parse(JSON.stringify(rows)));}};}};
}};};
applyCatalogColumnUpdates_=function(){};invalidateBootstrapCaches_=function(){};
LockService={getScriptLock:function(){return {tryLock:function(){lockTrace.push('lock');return allowLock;},releaseLock:function(){lockTrace.push('release');}};}};
SpreadsheetApp={flush:function(){lockTrace.push('flush');if(failFlush)throw new Error('flush');}};
var fixture={local:'Trento Café',producto_elaborado:'Fixture local sin envío',rebuild_views:false,items:[{codigo:'CAF001',insumo:'Nombre no confiable',unidad:'kg',cantidad_usada:2}]};
`);
assert.equal(productionRun('getProductionReview_(fixture).rows[0].insumo'),'Café');
assert.equal(productionRun('getProductionReview_(fixture).rows[0].proyectado'),3);
productionRun("fixture.items[0].unidad='g'");
assert.equal(productionRun('saveProduccion_(fixture).ok'),false);
productionRun("fixture.items[0].unidad='kg';fixture.items[0].codigo='PAR001'");
assert.equal(productionRun('saveProduccion_(fixture).ok'),false);
productionRun("fixture.items[0].codigo='CAF001';fixture.items[0].cantidad_usada='2kg'");
assert.equal(productionRun('saveProduccion_(fixture).ok'),false);
productionRun('fixture.items[0].cantidad_usada=Infinity');
assert.equal(productionRun('saveProduccion_(fixture).ok'),false);
productionRun('fixture.items[0].cantidad_usada=7');
assert.equal(productionRun('getProductionReview_(fixture).warnings[0].motivo'),'Consumo mayor al stock');
assert.equal(productionRun('saveProduccion_(fixture).ok'),false);
productionRun("fixture.stock_review_confirmed=true;fixture.observaciones='Consumo verificado en la prueba local';fixture.stock_review_signature=getProductionReview_(fixture).signature;catalogCells[1][8]=4");
assert.equal(productionRun('saveProduccion_(fixture).ok'),false,'Changed stock invalidates the previous acknowledgement');
assert.equal(productionRun('savedProductions.length'),0,'Rejected payloads never append nor change stock');
productionRun("catalogCells[1][8]=5;catalogCells.push(['CAF001','Café anterior','','Trento Café','Café','kg',0,'Proveedor',99,'','Inactivo','']);fixture.stock_review_signature=getProductionReview_(fixture).signature");
assert.equal(productionRun('saveProduccion_(fixture).ok'),true);
assert.equal(productionRun('catalogCells[1][8]'),-2);
assert.equal(productionRun('catalogCells[4][8]'),99,'Inactive catalog entries are never debited');
assert.match(productionRun('savedProductions[0][0][13]'),/saldo previo 5 kg/,'Acknowledged deviation retains prior balance in the audit note');
productionRun("fixture.items=[{codigo:'CAF002',insumo:'Leche',unidad:'litro',cantidad_usada:2}];fixture.stock_review_signature=getProductionReview_(fixture).signature");
assert.equal(productionRun('saveProduccion_(fixture).ok'),true);
assert.equal(productionRun('catalogCells[2][8]'),'','Unknown balance never becomes a invented zero-minus-consumption count');
assert.throws(()=>productionRun("withStockMutationLock_(function(){throw new Error('callback');})"),/callback/);
assert.match(productionRun('lockTrace.join(",")'),/lock,flush,release/);
productionRun('lockTrace=[];failFlush=true');
assert.throws(()=>productionRun('withStockMutationLock_(function(){return true;})'),/flush/);
assert.equal(productionRun('lockTrace[2]'),'release','Lock is released even when flush fails');
productionRun('lockTrace=[];failFlush=false;allowLock=false');
assert.equal(productionRun('withStockMutationLock_(function(){throw new Error("should not run");}).ok'),false);
assert.equal(productionRun('lockTrace.length'),1,'Unacquired lock does not run the mutation');
console.log('Production server review passed: canonical local units, finite quantities, no rejected writes, explicit deviation, stale stock and lock cleanup.');
const html=fs.readFileSync('index.html','utf8');
const productionFields={};
const productionField=id=>productionFields[id]||={value:'',textContent:'',innerHTML:'',hidden:false,checked:false,disabled:false,dataset:{},focus:()=>{}};
const productionUi=vm.createContext({console,Date,Number,JSON,$:productionField,
  document:{querySelectorAll:()=>[]},productionSaving:false,
  esc:String,trim:value=>Number(value.toFixed(2)),num:value=>value===''||value==null?null:Number(value),
  state:{local:'Trento Café'},CATALOG:{'Trento Café':[{codigo:'CAF001',nombre:'Café',unidad:'kg',stock_actual:5}]},
  ensureProdDrafts:()=>({items:{selected:'7'}}),ensureProdSelection:()=>['selected'],
  prodCatalogRecord:()=>({codigo:'CAF001',nombre:'Café',unidad:'kg',categoria:''}),
  toast:()=>{},requireLiveWrite:()=>true,capabilityEnabled:()=>true,
  clearProdDrafts:()=>{},renderProduccionModule:()=>{},renderStockIntelligence:()=>{},
  renderDashboard:()=>{},renderWorkspaceStats:()=>{},queueBootstrapRefresh:()=>{},syncWriteAvailability:()=>{}
});
const productionUiRun=code=>vm.runInContext(code,productionUi);
const reviewStart=html.indexOf('function productionQuantity('),reviewEnd=html.indexOf('function renderElaboradosModule(',reviewStart);
vm.runInContext(html.slice(reviewStart,reviewEnd),productionUi);
const saveStart=html.indexOf('async function saveProduction('),saveEnd=html.indexOf('async function saveElaborados(',saveStart);
vm.runInContext(html.slice(saveStart,saveEnd),productionUi);
const sentProductions=[];
productionUi.apiPost=async payload=>{sentProductions.push(JSON.parse(JSON.stringify(payload)));};
productionUi.confirmOperationPersisted=async()=>true;
productionUi.applyProductionOptimistic=(local)=>{productionUi.appliedLocal=local;};
productionUi.backendGet=async(action,params)=>productionRun(`getProductionReview_(${JSON.stringify({local:params.local,items:JSON.parse(params.items)})})`);
productionField('#prodNombre').value='Fixture sin envío real';
productionField('#prodSave').textContent='Guardar producción';
productionRun('catalogCells[1][8]=5');
(async()=>{
  productionUiRun('renderProductionReview()');
  await productionUiRun('saveProduction()');
  assert.equal(sentProductions.length,0,'UI cannot post an unacknowledged deviation');
  assert.match(productionField('#prodSaveError').textContent,/Confirmá el desvío/);
  productionField('#prodStockConfirm').checked=true;
  await productionUiRun('saveProduction()');
  assert.equal(sentProductions.length,0,'A checked box without an observation still blocks');
  productionField('#prodObs').value='Consumo comprobado en prueba local';
  productionField('#prodStockConfirm').checked=true;
  productionRun('catalogCells[1][8]=4');
  await productionUiRun('saveProduction()');
  assert.equal(sentProductions.length,0,'Fresh server stock resets prior UI consent');
  assert.equal(productionField('#prodStockConfirm').checked,false);
  productionField('#prodStockConfirm').checked=true;
  await productionUiRun('saveProduction()');
  assert.equal(sentProductions.length,1);
  assert.equal(sentProductions[0].stock_review_confirmed,true);
  assert.equal(productionUi.appliedLocal,'Trento Café');
  productionUi.backendGet=async(action,params)=>{productionUi.state.local='Umo Grill';return {ok:true,rows:[],warnings:[],errors:[],signature:'[]'};};
  await productionUiRun('saveProduction()');
  assert.equal(sentProductions.length,1,'Switching local during the review never posts the old draft');
  productionUi.PRODUCCION={byLocal:{},latest:[]};
  productionUi.stockKey=(code,name)=>`${code}|${name}`;
  productionUi.CATALOG['Trento Café'][0].stock_actual='';
  const optimisticStart=html.indexOf('function applyProductionOptimistic('),optimisticEnd=html.indexOf('function applyElabOptimistic(',optimisticStart);
  vm.runInContext(html.slice(optimisticStart,optimisticEnd),productionUi);
  productionUiRun("applyProductionOptimistic('Trento Café',{items:[{codigo:'CAF001',insumo:'Café',unidad:'kg',cantidad_usada:2}]})");
  assert.equal(productionUi.CATALOG['Trento Café'][0].stock_actual,'','Optimistic UI also preserves an unknown balance');
  console.log('Production UI review passed: no unreviewed posts, reason required, fresh stock reconfirmation and local isolation. No live writes.');
})().catch(error=>{console.error(error);process.exitCode=1;});
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
const backend=vm.createContext({console,isFinite});
for(const file of fs.readdirSync('gas').filter(file=>file.endsWith('.gs'))) vm.runInContext(fs.readFileSync(`gas/${file}`,'utf8'),backend);
const back=code=>vm.runInContext(code,backend);
back(`
var fixture=[[],['id1','','','Trento Café','','','CAF002','Leche','',12,'caja','','pendiente'],['id2','','','Trento Café','','','CAF002','Leche','',2,'litro','','pendiente'],['id3','','','Trento Café','','','CAF002','Leche','',99,'litro','','cancelado']];
ss_=function(){return {getSheetByName:function(){return {getLastRow:function(){return fixture.length;},getDataRange:function(){return {getValues:function(){return fixture;}};}};}};};
var item={codigo:'CAF002',nombre:'Leche',unidad:'litro',stock_actual:5,stock_minimo:20};
readCatalog_=function(){return {'Trento Café':[item]};};
var demand=pendingDemandSummary_();
var snap={catalog:readCatalog_(),demandMap:demand.demandMap,stockMap:{}};
var decision=buildDecisionCenterByLocal_(snap,{byLocal:{'Trento Café':{CAF002:{cantidad_sugerida:30}}}})['Trento Café'];
`);
assert.equal(back('demand.activeRows.length'),2);
assert.equal(back("demandForCatalogUnit_(demand.demandMap[keyFor_('Trento Café','CAF002','Leche')],'litro').cantidad"),null);
assert.equal(back('decision.suggestions.length'),0,'Par and history cannot bypass incompatible measures');
assert.equal(back('decision.needs_count[0].review_type'),'unidades');
assert.equal(back('comprasRows_().length'),2,'Gross purchase references retain boxes and liters separately');
assert.equal(back('comprasRows_()[0][4]'),12);
assert.equal(back('comprasRows_()[1][4]'),2);
for(const unit of ['caja','']) assert.equal(back(`demandForCatalogUnit_({pedidos:1,por_unidad:[{unidad:${JSON.stringify(unit)},cantidad:2}]},'litro').needs_review`),true);
assert.equal(back("demandForCatalogUnit_({pedidos:1,por_unidad:[{unidad:' LITRO ',cantidad:2},{unidad:'litro',cantidad:3}]},'litro').cantidad"),5);
assert.equal(back("demandForCatalogUnit_({pedidos:1,cantidades_invalidas:1,por_unidad:[]},'litro').needs_review"),true);
ctx.SNAPSHOT={demandReviewsByLocal:{'Trento Café':[{codigo:'CAF002'}]}};
ctx.pedidoInsightForItem=()=>({cantidad_sugerida:30});
load('pedidoInsightButton','scheduleDraftSave');
assert.doesNotMatch(run("pedidoInsightButton(CATALOG['Trento Café'][1])"),/data-use-suggested/);
ctx.SNAPSHOT={demandReviewsByLocal:{},receptionGuideByLocal:{'Trento Café':[{codigo:'CAF002',unidad:'litro',cantidad:140},{codigo:'OTHER',unidad:'litro',cantidad:999}]}};
ctx.pedidoInsightForItem=()=>({cantidad_sugerida:10});
ctx.CATALOG['Trento Café'][1].stock_actual=30;
ctx.CATALOG['Trento Café'][1].stock_minimo=15;
assert.match(run("pedidoInsightButton(CATALOG['Trento Café'][1])"),/data-use-suggested="110"/,'Open demand overrides a smaller habitual objective');
assert.match(run("pedidoInsightButton(CATALOG['Trento Café'][1])"),/abierto 140/);
ctx.SNAPSHOT.demandReviewsByLocal={'Trento Café':[{codigo:'CAF002'}]};
assert.doesNotMatch(run("pedidoInsightButton(CATALOG['Trento Café'][1])"),/data-use-suggested/,'Unit review still blocks open-demand suggestions');
console.log('Unit quantities passed: separate measures, no conversion, unit review blocks purchases, original references and no live writes.');

// Manually transcribed source lines from the supplied receipts, not an OCR benchmark.
load('normalizeLooseText','isReceiptNoiseLine');
load('extractReceiptQty','scoreCatalogMatch');
assert.equal(run("extractReceiptQty('0001 ASADO COMPLETO AVM 14,00 KG 16.055,00 224.770,00')"),14,'Supplier code is not quantity');
assert.equal(run("extractReceiptQty('0437 CARNE CON HUESO CORTADO 3,00 KG 7.505,00 22.515,00')"),3);
assert.equal(run("extractReceiptQty('0071 NALGA DE NOVILLO FETEADA 10,00 KG 18.145,00 181.450,00')"),10);
assert.equal(run("extractReceiptQty('1 CAJA PRODUCTO 2 KG 100,00')"),null,'Multiple measured amounts need manual review');
ctx.receiptDraft={items:{existing:'7',zero:'0',empty:''},proveedor:'Proveedor manual'};
ctx.ensureRecepDrafts=()=>ctx.receiptDraft;
load('applyPhotoMatchesToReceptionDraft','ensureRecepDrafts');
ctx.photoParsed={proveedor:'Proveedor foto',matches:[{key:'existing',cantidad_recibida:14},{key:'zero',cantidad_recibida:3},{key:'empty',cantidad_recibida:2},{key:'new',cantidad_recibida:4}]};
run("applyPhotoMatchesToReceptionDraft('Trento Café',photoParsed)");
assert.deepEqual(ctx.receiptDraft.items,{existing:'7',zero:'0',empty:'2',new:'4'},'Photo does not overwrite manual input, including zero');
assert.equal(ctx.receiptDraft.proveedor,'Proveedor manual');
console.log('Receipt draft checks passed: measured quantity over article code and manual values preserved. OCR quality is not asserted.');

// Regression from the actual Tesseract output of the El Criollo photo.
load('normalizeLooseText','getRecepPhotoState');
ctx.CATALOG={'Trento Café':[{codigo:'LEC',nombre:'Leche La Serenísima entera',unidad:'litro'}]};
ctx.stockKey=(code,name)=>code||name;
ctx.actualReceiptText='PEDRO GUARESCHI 22 LOCAL 221 PEDRO GUARESCHI 22\n1 LECHE LA SERENISIMA ENTERA X 1 LT SIN GLUTEN 24 21.00 1989.00 47,736.00\nIMPORTE TOTAL EN LETRAS\nCUATROCIENTOS CUARENTA Y CINCO CON OCHENTA\nDF AA GAB: 86416782152936 VTO: 18/10/2026';
const filtered=run('filterReceiptRelevantText(actualReceiptText)');
assert.match(filtered,/LECHE LA SERENISIMA/,'A footer misread as header cannot displace item rows');
assert.doesNotMatch(filtered,/GUARESCHI|86416782152936/,'Fiscal address and expiry identifiers are not receipt items');
ctx.filteredReceipt=filtered;
const packaged=run("parseReceiptPhotoText(filteredReceipt,'Trento Café')");
assert.equal(packaged.matches.length,0,'Pack count cannot be converted into liters without confirmation');
assert.equal(packaged.review_items.length,1,'Recognized packaged product remains visible for review');
assert.equal(packaged.review_items[0].codigo,'LEC');
assert.match(packaged.review_items[0].sourceLine,/24 21.00/);
console.log('Actual OCR text regression passed: footer fallback, packaged units withheld and review provenance retained.');
const photoElements={};
ctx.$=id=>photoElements[id]||(photoElements[id]={textContent:'',innerHTML:'',hidden:false,dataset:{},checked:false,querySelectorAll:()=>[]});
ctx.capabilityEnabled=()=>false;
ctx.recepUi={ocrBusy:false};
ctx.getRecepPhotoState=()=>({fileName:'factura.jpeg',matches:[],unknownItems:[],reviewItems:packaged.review_items});
load('renderRecepPhotoPanel','renderProdCardsOnly');
run("renderRecepPhotoPanel('Trento Café')");
assert.match(photoElements['#recepPhotoMatches'].innerHTML,/productos por revisar|producto.*revisar/);
assert.match(photoElements['#recepPhotoMatches'].innerHTML,/data-photo-review/);
assert.match(photoElements['#recepPhotoMeta'].textContent,/no se precargaron/);
assert.doesNotMatch(photoElements['#recepPhotoMatches'].innerHTML,/recep-photo-qty/,'A review row cannot masquerade as a confirmed stock amount');

const privacyBackend=vm.createContext({console});
for(const file of fs.readdirSync('gas').filter(file=>file.endsWith('.gs'))) vm.runInContext(fs.readFileSync(`gas/${file}`,'utf8'),privacyBackend);
vm.runInContext("var settingsReads=0;getOpenAiSettings_=function(){settingsReads++;return {enabled:false};};",privacyBackend);
assert.equal(vm.runInContext("parseReceiptTextAi_('Trento Café','Fixture sin documentos reales').error",privacyBackend),'external_consent_required');
assert.equal(vm.runInContext('settingsReads',privacyBackend),0,'No provider configuration or network request occurs without consent');
assert.equal(vm.runInContext("parseReceiptTextAi_('Trento Café','Fixture', 'true').error",privacyBackend),'external_consent_required','Only explicit boolean approval is valid inside the service');

const consentField={checked:false,disabled:false,dataset:{}};
const privacyCalls=[],privacyTargets=[];
const privacyUi=vm.createContext({console,Date,
  state:{local:'Trento Café'},recepUi:{ocrBusy:false,photoByLocal:{}},
  $:id=>id==='#recepExternalConsent'?consentField:{value:''},
  Tesseract:{recognize:async()=>({data:{text:'Texto de fixture local'}})},
  toast:()=>{},capabilityEnabled:()=>true,filterReceiptRelevantText:text=>text,
  parseReceiptPhotoText:(text,local)=>({matches:[],unknown_items:[],review_items:[],proveedor:''}),
  mergeUnknownPhotoItems:(a,b)=>a.concat(b),
  renderRecepPhotoPanel:()=>{},renderRecepcionModule:()=>{},renderWorkspaceStats:()=>{},
  applyPhotoMatchesToReceptionDraft:local=>privacyTargets.push(local),ensureRecepDrafts:()=>({proveedor:''}),
  backendGet:async(action,params)=>{privacyCalls.push({action,params});return {ok:true,matches:[],unknown_items:[]};}
});
const privacyStart=html.indexOf('async function loadReceptionFromPhoto('),privacyEnd=html.indexOf('async function saveProduction(',privacyStart);
vm.runInContext(html.slice(privacyStart,privacyEnd),privacyUi);
const privacyRun=code=>vm.runInContext(code,privacyUi);
(async()=>{
  await privacyRun("loadReceptionFromPhoto({name:'fixture-local.jpeg'})");
  assert.equal(privacyCalls.length,0,'Local reading never calls the external parser by default');
  consentField.checked=true;
  await privacyRun("loadReceptionFromPhoto({name:'fixture-local.jpeg'})");
  assert.equal(privacyCalls.length,1);
  assert.equal(privacyCalls[0].params.allow_external,'true');
  assert.equal(consentField.checked,false,'Permission is consumed by one photo');
  await privacyRun("loadReceptionFromPhoto({name:'second-fixture.jpeg'})");
  assert.equal(privacyCalls.length,1,'A subsequent file does not inherit approval');
  consentField.checked=true;
  privacyUi.Tesseract.recognize=async()=>{privacyUi.state.local='Umo Grill';return {data:{text:'Fixture local'}};};
  await privacyRun("loadReceptionFromPhoto({name:'switch-local-fixture.jpeg'})");
  assert.equal(privacyCalls.length,1,'Changing local during OCR cancels external processing');
  assert.equal(privacyTargets.at(-1),'Trento Café','Photo results retain their original local');
  assert.ok(privacyUi.recepUi.photoByLocal['Trento Café']);
  assert.equal(privacyUi.recepUi.photoByLocal['Umo Grill'],undefined);
  console.log('Receipt privacy passed: local default, one-photo consent, service denial and original-local isolation. No external service calls.');
})().catch(error=>{console.error(error);process.exitCode=1;});
