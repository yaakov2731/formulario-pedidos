const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const sendCode = html.slice(html.indexOf('const OPAQUE_POST_HEADERS'), html.indexOf('function resetForm(', html.indexOf('const OPAQUE_POST_HEADERS')));
const fechaCode = html.slice(html.indexOf('function fechaHoraAR('), html.indexOf('\n}\n', html.indexOf('function fechaHoraAR(')) + 3);
const confirmCode = html.slice(html.indexOf('async function confirmPedidoPersisted('), html.indexOf('async function confirmOperationPersisted('));

function fixture() {
  const fields = Object.fromEntries(['encargado','email','semana','fecha_entrega','observaciones','send','pedidoSendStatus'].map(id => ['#'+id, {value:'',innerHTML:'Confirmar',hidden:true,disabled:false}]));
  Object.assign(fields['#encargado'],{value:'Responsable fixture'});
  fields['#email'].value='fixture@example.com';
  fields['#semana'].value='2026-W42';
  fields['#fecha_entrega'].value='2026-10-16';
  let release;
  const gate = new Promise(resolve => { release=resolve; });
  const posts=[],resets=[],usage=[],confirms=[];
  const store={};
  const toasts=[];
  const ctx = vm.createContext({console,Date,Math,Number,JSON,Promise,setTimeout,clearTimeout,sleep:ms=>new Promise(r=>setTimeout(r,Math.min(ms,5))),
    localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}},
    queueBootstrapRefresh:()=>{},
    crypto:{randomUUID:()=> 'fixture-uuid'},
    state:{local:'Trento Café',items:[{codigo:'CAF001',nombre:'Café',unidad:'kg',qty:2}],urgencia:'Normal'},
    pedidoDraftsByLocal:{},$:id=>fields[id],
    requireLiveWrite:()=>true,valid:()=>true,toast:(msg,kind)=>toasts.push({msg,kind}),trim:n=>n,formatSemana:v=>v,
    capturePedidoDraft:()=>({local:ctx.state.local,items:ctx.state.items.map(item=>({...item})),urgencia:ctx.state.urgencia}),
    apiPostJson:async payload=>{ posts.push(payload); await gate; return {ok:true,id_pedido:payload.id_pedido,telegram:{ok:true}}; },
    // Por defecto la fila todavía no es visible: confirma la respuesta directa.
    confirmPedidoPersisted:async(id)=>{ confirms.push(id); return {ok:false,telegramOk:false}; },
    recordCatalogUsage:(local,items)=>usage.push({local,items}),resetForm:local=>resets.push(local),syncSend:()=>{}
  });
  vm.runInContext(fechaCode,ctx);
  vm.runInContext(sendCode,ctx);
  return {ctx,fields,posts,resets,usage,confirms,store,toasts,release};
}

(async()=>{
  let f=fixture();
  const first=vm.runInContext('submit()',f.ctx);
  await vm.runInContext('submit()',f.ctx);
  assert.equal(f.posts.length,1,'Concurrent clicks issue one POST');
  assert.equal(vm.runInContext('pedidoSendBusy',f.ctx),true);
  assert.match(f.posts[0].id_pedido,/^PED-\d{13}-fixture-uuid$/);
  assert.match(f.posts[0].fecha_hora,/^\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2}$/,'fecha_hora en 24 h, sin a. m./p. m.');
  assert.equal(vm.runInContext('fechaHoraAR(new Date(2026,9,21,21,35,8))',f.ctx),'21/10/2026, 21:35:08');
  f.ctx.state.items[0].qty=9;
  f.release(); await first;
  assert.equal(f.posts[0].items[0].cantidad,2,'Sent payload is immutable');
  assert.equal(f.usage[0].items[0].qty,2,'History learns the sent snapshot, not later edits');
  assert.equal(f.resets.length,0,'Edits during sending are not erased');
  assert.match(f.fields['#pedidoSendStatus'].textContent,/Conservé los cambios/);
  assert.equal(vm.runInContext('pedidoSendBusy',f.ctx),false);
  assert.equal(f.toasts.at(-1).kind,'ok','A readable backend answer confirms the order');
  assert.deepEqual(Object.keys(f.store),[],'A confirmed send clears its pending id');

  f=fixture();
  const switched=vm.runInContext('submit()',f.ctx);
  f.ctx.pedidoDraftsByLocal['Trento Café']=f.ctx.capturePedidoDraft();
  f.ctx.state={local:'Umo Grill',items:[{codigo:'PAR001',qty:4}],urgencia:'Normal'};
  f.release(); await switched;
  assert.deepEqual(f.resets,['Trento Café'],'Only the unchanged original draft is cleared');
  assert.equal(f.ctx.state.items[0].qty,4,'The active other local is untouched');

  f=fixture();
  f.ctx.apiPostJson=async payload=>{f.posts.push(payload);throw Error('fixture network failure');};
  await vm.runInContext('submit()',f.ctx);
  assert.equal(f.resets.length,0);
  assert.match(f.fields['#pedidoSendStatus'].textContent,/no se duplica/);
  assert.equal(vm.runInContext('pedidoSendBusy',f.ctx),false);
  f.ctx.apiPostJson=async payload=>{f.posts.push(payload);return null;};
  f.ctx.confirmPedidoPersisted=async id=>{f.confirms.push(id);return {ok:true,telegramOk:true,status:{telegram:{found:true,ok:true}}};};
  f.confirms.length=0;
  await vm.runInContext('submit()',f.ctx);
  assert.equal(f.posts[1].id_pedido,f.posts[0].id_pedido,'Retrying the same draft reuses its id so the sheet can dedupe');
  assert.deepEqual(f.confirms,[f.posts[0].id_pedido],'An unreadable answer falls back to confirming by id');
  assert.deepEqual(f.resets,['Trento Café']);

  // La fila aparece mientras la planilla sigue redibujando vistas: se confirma
  // sin esperar el POST, y una falla de Telegram se avisa recién al terminar.
  f=fixture();
  let finishPost;
  f.ctx.apiPostJson=payload=>{f.posts.push(payload);return new Promise(r=>{finishPost=()=>r({ok:true,id_pedido:payload.id_pedido,telegram:{ok:false}});});};
  f.ctx.confirmPedidoPersisted=async id=>{f.confirms.push(id);return {ok:true,telegramOk:false,status:{telegram:{found:false}}};};
  await vm.runInContext('submit()',f.ctx);
  assert.deepEqual(f.resets,['Trento Café'],'Confirmed as soon as the row is visible, before the POST returns');
  assert.equal(vm.runInContext('pedidoSendBusy',f.ctx),false);
  assert.equal(f.toasts.at(-1).kind,'ok','Telegram still pending is not reported as a failure');
  finishPost(); await new Promise(r=>setTimeout(r,10));
  assert.match(f.toasts.at(-1).msg,/Telegram no confirmó/,'A real Telegram failure is reported once the POST finishes');

  f=fixture();
  f.ctx.apiPostJson=async()=>({ok:false,error:'El producto Café no pertenece al catálogo de Trento Café'});
  await vm.runInContext('submit()',f.ctx);
  assert.equal(f.resets.length,0,'A rejected order keeps the draft');
  assert.equal(f.confirms.length,0);
  assert.match(f.fields['#pedidoSendStatus'].textContent,/no pertenece al catálogo/);

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
  let telegrams=0;
  const okPayload={...payload,email_encargado:'fixture@example.com',fecha_entrega:'2026-10-16'};
  Object.assign(backend,{
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    SpreadsheetApp:{flush:()=>{}},
    notifyTelegramForPedido_:()=>{telegrams++;return {ok:true};},
    findPedidoRowById_:()=>null,readTelegramLogByPedido_:()=>({found:true,ok:true})
  });
  backend.payload=okPayload;
  assert.equal(vm.runInContext('savePedido_(payload).ok',backend),true);
  assert.equal(writes,2);
  backend.findPedidoRowById_=()=>['fixture-id'];
  const dup=vm.runInContext('savePedido_(payload)',backend);
  assert.equal(dup.duplicate,true);
  assert.equal(writes,2,'A repeated id_pedido writes nothing');
  assert.equal(telegrams,1,'A repeated id_pedido does not notify Telegram again');

  backend.findPedidoRowById_=()=>['fixture-id','','Trento Café','Fixture','Semana 42','','Recibido'];
  backend.findDetalleRowsByPedidoId_=()=>[['fixture-id','','','Trento Café','','','CAF001','Café','',2,'kg']];
  backend.readTelegramLogByPedido_=()=>({found:true,ok:true});
  assert.equal(vm.runInContext('getPedidoStatus_("fixture-id").items[0].cantidad',backend),2);
  console.log('Order send checks passed: duplicate clicks, immutable snapshot, edited drafts, local switching, inline failure, exact confirmation, finite quantities, direct backend answer, early confirmation by id and idempotent retries. Fixtures only.');
})().catch(error=>{console.error(error);process.exitCode=1;});
