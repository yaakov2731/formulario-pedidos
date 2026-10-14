const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const sendCode = html.slice(html.indexOf('const OPAQUE_POST_HEADERS'), html.indexOf('function resetForm(', html.indexOf('const OPAQUE_POST_HEADERS')));
const confirmCode = html.slice(html.indexOf('async function confirmPedidoPersisted('), html.indexOf('async function confirmOperationPersisted('));

function fixture() {
  const fields = Object.fromEntries(['encargado','email','semana','fecha_entrega','observaciones','send','pedidoSendStatus'].map(id => ['#'+id, {value:'',innerHTML:'Confirmar',hidden:true,disabled:false}]));
  Object.assign(fields['#encargado'],{value:'Responsable fixture'});
  fields['#email'].value='fixture@example.com';
  fields['#semana'].value='2026-W42';
  fields['#fecha_entrega'].value='2026-10-16';
  let release;
  const gate = new Promise(resolve => { release=resolve; });
  const posts=[],resets=[],usage=[];
  const ctx = vm.createContext({console,Date,Math,Number,JSON,
    crypto:{randomUUID:()=> 'fixture-uuid'},
    state:{local:'Trento Café',items:[{codigo:'CAF001',nombre:'Café',unidad:'kg',qty:2}],urgencia:'Normal'},
    pedidoDraftsByLocal:{},$:id=>fields[id],
    requireLiveWrite:()=>true,valid:()=>true,toast:()=>{},trim:n=>n,formatSemana:v=>v,
    capturePedidoDraft:()=>({local:ctx.state.local,items:ctx.state.items.map(item=>({...item})),urgencia:ctx.state.urgencia}),
    apiPost:async payload=>{ posts.push(payload); await gate; return {telegram:{ok:true}}; },
    confirmPedidoPersisted:async()=>({ok:true,telegramOk:true}),
    recordCatalogUsage:(local,items)=>usage.push({local,items}),resetForm:local=>resets.push(local),syncSend:()=>{}
  });
  vm.runInContext(sendCode,ctx);
  return {ctx,fields,posts,resets,usage,release};
}

(async()=>{
  let f=fixture();
  const first=vm.runInContext('submit()',f.ctx);
  await vm.runInContext('submit()',f.ctx);
  assert.equal(f.posts.length,1,'Concurrent clicks issue one POST');
  assert.equal(vm.runInContext('pedidoSendBusy',f.ctx),true);
  assert.match(f.posts[0].id_pedido,/^PED-\d{13}-fixture-uuid$/);
  f.ctx.state.items[0].qty=9;
  f.release(); await first;
  assert.equal(f.posts[0].items[0].cantidad,2,'Sent payload is immutable');
  assert.equal(f.usage[0].items[0].qty,2,'History learns the sent snapshot, not later edits');
  assert.equal(f.resets.length,0,'Edits during sending are not erased');
  assert.match(f.fields['#pedidoSendStatus'].textContent,/Conservé los cambios/);
  assert.equal(vm.runInContext('pedidoSendBusy',f.ctx),false);

  f=fixture();
  const switched=vm.runInContext('submit()',f.ctx);
  f.ctx.pedidoDraftsByLocal['Trento Café']=f.ctx.capturePedidoDraft();
  f.ctx.state={local:'Umo Grill',items:[{codigo:'PAR001',qty:4}],urgencia:'Normal'};
  f.release(); await switched;
  assert.deepEqual(f.resets,['Trento Café'],'Only the unchanged original draft is cleared');
  assert.equal(f.ctx.state.items[0].qty,4,'The active other local is untouched');

  f=fixture();
  f.ctx.apiPost=async()=>{throw Error('fixture network failure');};
  await vm.runInContext('submit()',f.ctx);
  assert.equal(f.resets.length,0);
  assert.match(f.fields['#pedidoSendStatus'].textContent,/Revisá la planilla antes de reenviar/);
  assert.equal(vm.runInContext('pedidoSendBusy',f.ctx),false);

  const payload={id_pedido:'fixture-id',local:'Trento Café',encargado:'Fixture',semana_pedido:'Semana 42',items:[{codigo:'CAF001',producto:'Café',cantidad:2,unidad:'kg'}]};
  const status={ok:true,found:true,id_pedido:'fixture-id',pedido:{local:'Trento Café',encargado:'Fixture',semana:'Semana 42'},items:payload.items,telegram:{found:true,ok:true}};
  f=fixture(); vm.runInContext(confirmCode,f.ctx);
  f.ctx.payload=payload; f.ctx.status=status;
  f.ctx.backendGet=async()=>status; f.ctx.sleep=async()=>{}; f.ctx.queueBootstrapRefresh=()=>{};
  assert.equal((await vm.runInContext('confirmPedidoPersisted(payload.id_pedido,1,0,payload)',f.ctx)).ok,true);
  for(const changed of [{...status,items:[{...payload.items[0],cantidad:3}]},{...status,pedido:{...status.pedido,local:'Umo Grill'}},{...status,items:[]}]){
    f.ctx.backendGet=async()=>changed;
    assert.equal((await vm.runInContext('confirmPedidoPersisted(payload.id_pedido,1,0,payload)',f.ctx)).ok,false,'ID alone is not proof of this order');
  }

  const backend=vm.createContext({console,Number,isFinite});
  for(const file of fs.readdirSync('gas').filter(file=>file.endsWith('.gs'))) vm.runInContext(fs.readFileSync('gas/'+file,'utf8'),backend);
  let writes=0;
  Object.assign(backend,{normalizeLocalName_:v=>v,readCatalog_:()=>({'Trento Café':[{codigo:'CAF001'}]}),appendPedido_:()=>writes++,appendDetalle_:()=>writes++,notifyTelegramForPedido_:()=>({ok:true}),refreshOperationalViews_:()=>{},invalidateBootstrapCaches_:()=>{}});
  backend.payload={...payload,email_encargado:'fixture@example.com',fecha_entrega:'2026-10-16',items:[{codigo:'CAF001',producto:'Café',cantidad:Infinity}]};
  assert.equal(vm.runInContext('savePedido_(payload).ok',backend),false);
  assert.equal(writes,0,'Nonfinite quantities cause no writes');
  backend.findPedidoRowById_=()=>['fixture-id','','Trento Café','Fixture','Semana 42','','Recibido'];
  backend.findDetalleRowsByPedidoId_=()=>[['fixture-id','','','Trento Café','','','CAF001','Café','',2,'kg']];
  backend.readTelegramLogByPedido_=()=>({found:true,ok:true});
  assert.equal(vm.runInContext('getPedidoStatus_("fixture-id").items[0].cantidad',backend),2);
  console.log('Order send checks passed: duplicate clicks, immutable snapshot, edited drafts, local switching, inline failure, exact confirmation and finite quantities. Fixtures only.');
})().catch(error=>{console.error(error);process.exitCode=1;});
