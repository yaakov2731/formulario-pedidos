const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function renderDashboard()');
const end=html.indexOf('async function saveReception()',start);
assert.ok(start>0&&end>start);
const elements={};
const element=id=>elements[id]||(elements[id]={innerHTML:'',textContent:'',querySelectorAll:()=>[]});
const ctx=vm.createContext({console,Date,
  $:element,state:{local:'Umo Grill',items:[]},LIVE:true,LAST_SYNC_AT:null,
  SNAPSHOT:{decisionCenterByLocal:{'Umo Grill':{summary:{comprar:2,contar:1},suggestions:[],needs_count:[]}}},
  CATALOG:{'Umo Grill':[]},RECEPCIONES:{latest:[]},PRODUCCION:{latest:[]},ELABORADOS:{latest:[]},
  localOperationalMetrics:()=>({cat:[],reviewRows:[],snapshotLocal:{faltantes:0},pedidoUnits:0,recepSummary:{movimientos:0,cantidad:0},prodSummary:{cantidad_producida:0,movimientos:0}}),
  snapshotStampText:()=>'',num:v=>{const n=parseFloat(v);return Number.isFinite(n)?n:null;},trim:n=>Number(n.toFixed(2)),
  esc:v=>String(v),metricCard:(label,value,meta)=>`${label}:${value}:${meta}`
});
vm.runInContext(html.slice(start,end),ctx);
assert.doesNotThrow(()=>vm.runInContext('renderDashboard()',ctx));
assert.match(element('#dashCards').innerHTML,/2 compras/);
ctx.SNAPSHOT={decisionCenterByLocal:{}};
assert.doesNotThrow(()=>vm.runInContext('renderDashboard()',ctx));
ctx.LIVE=false;
assert.doesNotThrow(()=>vm.runInContext('renderDashboard()',ctx));
ctx.state.local='';
assert.doesNotThrow(()=>vm.runInContext('renderDashboard()',ctx));
console.log('Dashboard rendering passed: connected summary, empty decisions, offline and no local.');
