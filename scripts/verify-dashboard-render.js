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

// Exercise both real asynchronous loaders: the initial pulse must use loaded data,
// not the empty startup state, without requiring a local change to trigger rendering.
async function checkHomeRefresh(){
  let loaded=false, homeRenders=0;
  const noop=()=>{};
  const refreshCtx=vm.createContext({console,Date,
    backendGet:async()=>({ok:true}),applyBootstrapPayload:()=>{loaded=true;},
    renderHome:()=>{assert.equal(loaded,true);homeRenders++;},
    renderStockIntelligence:noop,renderRecepcionModule:noop,renderProduccionModule:noop,
    renderElaboradosModule:noop,renderDashboard:noop,renderWorkspaceStats:noop,
    refreshResponsableInputs:noop,renderQuickCatalog:noop,fillEncargadoSelect:noop,
    renderLiveWarning:noop,setConn:noop,renderCfg:noop,
    state:{local:'Umo Grill'},cfg:{hidden:true},LIVE:false,LIVE_META:{},$:()=>({value:''})
  });
  const warmStart=html.indexOf('async function warmData()');
  const warmEnd=html.indexOf('const LOCAL_ALIAS',warmStart);
  vm.runInContext(html.slice(warmStart,warmEnd),refreshCtx);
  const refreshStart=html.indexOf('async function refreshData(');
  const refreshEnd=html.indexOf('async function confirmPedidoPersisted(',refreshStart);
  vm.runInContext(html.slice(refreshStart,refreshEnd),refreshCtx);
  await vm.runInContext('warmData()',refreshCtx);
  assert.equal(homeRenders,1,'Initial live load refreshes the home pulse');
  loaded=false;
  assert.equal(await vm.runInContext('refreshData()',refreshCtx),true);
  assert.equal(homeRenders,2,'Subsequent operation refresh updates the home pulse');
  for(const label of ['Inicio','Pedido','Stock real','Recepción','Producción','Elaborados','Reportes','Administración']){
    assert.ok(html.includes(`class="shell-nav-btn" type="button" aria-label="${label}"`),`${label} remains accessible in the icon-only sidebar`);
  }
  console.log('Home refresh and icon-only navigation accessibility passed.');
}
checkHomeRefresh().catch(err=>{console.error(err);process.exitCode=1;});
