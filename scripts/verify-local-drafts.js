const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const fields={};
const field=id=>fields[id]||(fields[id]={value:'',querySelectorAll:()=>[]});
let stored=null;
const ctx=vm.createContext({console,clearTimeout,Date,
  $:field,localStorage:{setItem:(_key,value)=>{stored=value;},getItem:()=>stored},
  state:{local:'Umo Grill',items:[{_id:1,codigo:'PAR001',nombre:'Aceite',qty:3}],urgencia:'Urgente',pedidoStep:'resumen',encTouched:true,emailTouched:true},
  uid:1,pedidoDraftsByLocal:{},PEDIDO_STEPS:[{id:'productos'},{id:'resumen'}],
  DRAFT_STORAGE_KEY:'test',draftSaveTimer:null,restoredDraft:false,restoredDraftSavedAt:'',
  LOCALES:[{id:'Umo Grill'},{id:'Trento Café'}],
  stockUi:{drafts:{},selectedByLocal:{},metaByLocal:{}},recepUi:{drafts:{}},prodUi:{drafts:{},selectedByLocal:{}},elabUi:{drafts:{},selectedByLocal:{}}
});
const start=html.indexOf('function capturePedidoDraft()');
const end=html.indexOf('/* ---- Helpers ---- */',start);
assert.ok(start>0&&end>start);
vm.runInContext(html.slice(start,end),ctx);
field('#encargado').value='Encargado Umo';
field('#email').value='umo@example.com';
field('#observaciones').value='Pedido de Umo';
vm.runInContext("switchPedidoLocal('Trento Café')",ctx);
assert.equal(ctx.state.items.length,0);
assert.equal(field('#encargado').value,'');
assert.equal(field('#email').value,'');
assert.equal(ctx.state.urgencia,'Normal');
ctx.state.items=[{_id:2,codigo:'CAF001',nombre:'Café',qty:5}];
field('#encargado').value='Encargado Trento';
vm.runInContext("switchPedidoLocal('Umo Grill')",ctx);
assert.equal(ctx.state.items[0].codigo,'PAR001');
assert.equal(ctx.state.items[0].qty,3);
assert.equal(field('#encargado').value,'Encargado Umo');
assert.equal(field('#observaciones').value,'Pedido de Umo');
vm.runInContext('persistOperationalDrafts()',ctx);
const saved=JSON.parse(stored);
assert.equal(saved.pedidoByLocal['Trento Café'].items[0].codigo,'CAF001');
ctx.pedidoDraftsByLocal={};ctx.state.items=[];
assert.equal(vm.runInContext('restoreOperationalDrafts()',ctx),true);
vm.runInContext("switchPedidoLocal('Trento Café')",ctx);
assert.equal(ctx.state.items[0].qty,5);
// A legacy draft is retained under its original local without redistribution.
stored=JSON.stringify({pedido:{local:'Umo Grill',items:[{codigo:'PAR001',qty:2}]}});
vm.runInContext('restoreOperationalDrafts()',ctx);
assert.equal(ctx.pedidoDraftsByLocal['Umo Grill'].items[0].qty,2);

const backend=vm.createContext({console});
for(const file of fs.readdirSync('gas').filter(file=>file.endsWith('.gs'))) vm.runInContext(fs.readFileSync(`gas/${file}`,'utf8'),backend);
vm.runInContext(`
var writes=0;
readCatalog_=function(){return {'Trento Café':[{codigo:'CAF001'}]};};
appendPedido_=function(){writes++;};appendDetalle_=function(){writes++;};
notifyTelegramForPedido_=function(){writes++;return {ok:true};};
refreshOperationalViews_=function(){};invalidateBootstrapCaches_=function(){};
LockService={getScriptLock:function(){return {tryLock:function(){return true;},releaseLock:function(){}};}};
SpreadsheetApp={flush:function(){}};findPedidoRowById_=function(){return null;};
var payload={local:'Trento Café',encargado:'Encargado',email_encargado:'test@example.com',semana_pedido:'Semana 1',fecha_entrega:'2026-10-15',items:[{codigo:'PAR001',producto:'Aceite',cantidad:2}]};
`,backend);
assert.equal(vm.runInContext('savePedido_(payload).ok',backend),false);
assert.equal(vm.runInContext('writes',backend),0);
vm.runInContext('payload.items[0].libre=true',backend);
assert.equal(vm.runInContext('savePedido_(payload).ok',backend),false,'Free flag cannot bypass local code ownership');
assert.equal(vm.runInContext('writes',backend),0);
vm.runInContext("payload.items[0].codigo='CAF001'",backend);
assert.equal(vm.runInContext('savePedido_(payload).ok',backend),true);
console.log('Local draft checks passed: isolated quantities, people, notes, urgency, reload, legacy retention and backend local validation.');

// Native dialog replaces prompt without changing the existing authorization rule.
const accessFields={};
const accessField=id=>accessFields[id]||(accessFields[id]={value:'',textContent:'',open:false,attributes:{},listeners:{},
  addEventListener(name,fn){this.listeners[name]=fn;},
  setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];},
  showModal(){this.open=true;},close(){this.open=false;},focus(){this.focused=true;}});
let configOpens=0;
const access=vm.createContext({state:{admin:false},ADMIN_PIN:'fixture-only-code',$:accessField,
  closeShellMenu:()=>{},openCfg:()=>configOpens++,setAdminMode:value=>{access.state.admin=value;}});
const accessStart=html.indexOf('function openAdminNavigation(){');
const accessEnd=html.indexOf('$("#adminBtn").addEventListener',accessStart);
vm.runInContext(html.slice(accessStart,accessEnd),access);
assert.ok(!html.includes('window.prompt("Código admin")'));
assert.ok(html.includes('type="password" autocomplete="current-password" required autofocus'));
vm.runInContext('openAdminNavigation()',access);
assert.equal(accessField('#adminAccess').open,true);
assert.equal(configOpens,0,'Opening access never grants administration');
accessField('#adminAccessCode').value='wrong-fixture';
access.event={preventDefault:()=>{}};
vm.runInContext('submitAdminAccess(event)',access);
assert.equal(access.state.admin,false);
assert.equal(configOpens,0);
assert.equal(accessField('#adminAccessCode').value,'');
assert.equal(accessField('#adminAccessCode').attributes['aria-invalid'],'true');
assert.ok(accessField('#adminAccessError').textContent);
vm.runInContext('closeAdminAccess()',access);
assert.equal(accessField('#adminAccess').open,false);
accessField('#adminAccessCode').value='fixture-only-code';
vm.runInContext('submitAdminAccess(event)',access);
assert.equal(access.state.admin,true);
assert.equal(configOpens,1);
assert.equal(accessField('#adminAccessCode').value,'','Codes are cleared after successful fixture verification');
console.log('Admin access fixture checks passed: native dialog, unchanged code requirement, inline failure, cancellation and code clearing. No real credentials used.');
