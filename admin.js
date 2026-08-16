(() => {
  'use strict';
  const API='https://script.google.com/macros/s/AKfycbxN9Vm1N3FlPE0zYpg4JAkSR9VEGzc6YAXTUF3JmEI_4RuJMotjMY0fyPZXv9FQ27lX/exec';
  const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n)||0);
  const num=v=>Number(String(v??'').replace(/\./g,'').replace(',','.'))||0;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let DATA={products:[],central:[],metrics:{}};

  function css(){
    const s=document.createElement('style'); s.id='adminFinanceStyles'; s.textContent=`
      .adm-overlay{position:fixed;inset:0;z-index:1400;background:#eef2f3;overflow:auto;color:#20343b;font-family:Inter,system-ui,sans-serif}
      .adm-wrap{max-width:1380px;margin:auto;padding:22px 22px 70px}.adm-head{display:flex;gap:14px;align-items:center;justify-content:space-between;margin-bottom:18px}.adm-head h1{font-size:26px;margin:0}.adm-close{border:1px solid #ccd8dc;background:#fff;border-radius:10px;padding:9px 12px;cursor:pointer}
      .adm-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 18px}.adm-tab{border:1px solid #c8d4d8;background:#fff;border-radius:10px;padding:9px 13px;font-weight:700;cursor:pointer}.adm-tab.on{background:#173f4c;color:#fff;border-color:#173f4c}
      .adm-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.adm-card{background:#fff;border:1px solid #d7e0e3;border-radius:14px;padding:16px;box-shadow:0 2px 8px #0000000d}.adm-card small{display:block;color:#6b7d83;font-size:11px;text-transform:uppercase;font-weight:800;letter-spacing:.04em}.adm-card strong{display:block;font-size:22px;margin-top:8px}
      .adm-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}.adm-panel{background:#fff;border:1px solid #d7e0e3;border-radius:14px;padding:16px}.adm-panel h2{margin:0 0 12px;font-size:17px}.adm-table-wrap{overflow:auto;max-height:58vh}.adm-table{width:100%;border-collapse:collapse;font-size:12px}.adm-table th,.adm-table td{padding:9px 8px;border-bottom:1px solid #e6ecee;text-align:left;white-space:nowrap}.adm-table th{position:sticky;top:0;background:#f7f9fa;z-index:1}.adm-right{text-align:right!important}
      .adm-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.adm-form .wide{grid-column:1/-1}.adm-form label{font-size:12px;font-weight:700;color:#52666d}.adm-form input,.adm-form select{width:100%;min-height:42px;margin-top:5px;border:1px solid #c9d5d9;border-radius:9px;padding:8px 10px;background:#fff}.adm-btn{border:0;border-radius:9px;padding:11px 14px;background:#17596a;color:#fff;font-weight:800;cursor:pointer}.adm-muted{color:#6d8087;font-size:12px}.adm-msg{margin-top:10px;font-size:12px;font-weight:700}.adm-search{width:100%;min-height:40px;border:1px solid #c9d5d9;border-radius:9px;padding:8px 10px;margin:0 0 10px}
      @media(max-width:900px){.adm-kpis{grid-template-columns:repeat(2,1fr)}.adm-grid{grid-template-columns:1fr}.adm-form{grid-template-columns:1fr}.adm-wrap{padding:14px 12px 90px}}
    `; document.head.appendChild(s);
  }

  function isAdminLabel(el){
    const txt=String(el.textContent||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return txt==='administracion' || txt.endsWith(' administracion') || txt.includes('administracion');
  }

  function bindSidebar(){
    const old=document.getElementById('adminFinanceNav'); if(old) old.remove();
    const oldBtn=document.getElementById('adminFinanceFab'); if(oldBtn) oldBtn.remove();
    const candidates=[...document.querySelectorAll('aside a, aside button, nav a, nav button, [class*="sidebar"] a, [class*="sidebar"] button, [class*="nav"] a, [class*="nav"] button')];
    let target=candidates.find(isAdminLabel);
    if(!target){
      target=[...document.querySelectorAll('a,button')].find(el=>isAdminLabel(el) && el.getBoundingClientRect().left<300);
    }
    if(!target) return false;
    if(target.dataset.adminFinanceBound==='1') return true;
    target.dataset.adminFinanceBound='1';
    target.addEventListener('click',function(e){
      e.preventDefault();
      e.stopPropagation();
      open();
    },true);
    return true;
  }

  function shell(){
    if(bindSidebar()) return;
    let tries=0;
    const timer=setInterval(()=>{tries++; if(bindSidebar()||tries>30) clearInterval(timer);},250);
    const observer=new MutationObserver(()=>bindSidebar());
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),12000);
  }

  async function get(action,params={}){
    const u=new URL(API); u.searchParams.set('action',action); Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v)); u.searchParams.set('_',Date.now());
    const r=await fetch(u,{cache:'no-store'}); const j=await r.json(); if(!j.ok) throw new Error(j.error||'Error de API'); return j;
  }
  async function post(payload){
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)}); const j=await r.json(); if(!j.ok) throw new Error(j.error||'Error de API'); return j;
  }

  function open(){
    let o=document.getElementById('adminFinance');
    if(!o){o=document.createElement('div');o.id='adminFinance';o.className='adm-overlay';o.innerHTML=`<div class="adm-wrap"><div class="adm-head"><div><div class="adm-muted">Docks del Puerto · Sistema maestro</div><h1>Administración · Stock y Costos</h1></div><button class="adm-close" id="admClose">Cerrar</button></div><div class="adm-tabs"><button class="adm-tab on" data-v="dash">Dashboard</button><button class="adm-tab" data-v="buy">Registrar compra</button><button class="adm-tab" data-v="trf">Transferir stock</button></div><div id="admBody"></div></div>`;document.body.appendChild(o);o.querySelector('#admClose').onclick=()=>o.remove();o.querySelectorAll('.adm-tab').forEach(x=>x.onclick=()=>view(x.dataset.v));}
    load();
  }
  async function load(){const body=document.getElementById('admBody');body.innerHTML='<div class="adm-card">Cargando datos del maestro...</div>';try{DATA=await get('getAdminFinance');view('dash');}catch(e){body.innerHTML=`<div class="adm-card"><strong>No pude cargar Administración</strong><div class="adm-msg">${esc(e.message)}</div><p class="adm-muted">Si acabamos de publicar, esperá unos segundos y volvé a intentar.</p></div>`;}}
  function tabs(v){document.querySelectorAll('.adm-tab').forEach(x=>x.classList.toggle('on',x.dataset.v===v));}
  function view(v){tabs(v);if(v==='buy')buy();else if(v==='trf')trf();else dash();}
  function dash(){const m=DATA.metrics||{}; const rows=(DATA.products||[]).slice().sort((a,b)=>(b.valor||0)-(a.valor||0));document.getElementById('admBody').innerHTML=`
    <div class="adm-kpis"><div class="adm-card"><small>Inventario total</small><strong>${money(m.valor_total)}</strong></div><div class="adm-card"><small>Locales</small><strong>${money(m.valor_stock_locales)}</strong></div><div class="adm-card"><small>Depósito central</small><strong>${money(m.valor_deposito_central)}</strong></div><div class="adm-card"><small>Sin stock</small><strong>${m.sin_stock||0}</strong></div><div class="adm-card"><small>Stock bajo</small><strong>${m.stock_bajo||0}</strong></div></div>
    <div class="adm-grid"><div class="adm-panel"><h2>Stock valorizado por local</h2><input id="admSearch" class="adm-search" placeholder="Buscar producto, local o proveedor"><div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Producto</th><th>Local</th><th>Stock</th><th>Costo prom.</th><th>Último costo</th><th>Valor</th></tr></thead><tbody id="admRows">${productRows(rows)}</tbody></table></div></div><div class="adm-panel"><h2>Depósito Central</h2><div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Producto</th><th>Stock</th><th>Costo</th><th>Valor</th></tr></thead><tbody>${(DATA.central||[]).map(x=>`<tr><td>${esc(x.producto)}</td><td>${esc(x.stock)} ${esc(x.unidad)}</td><td class="adm-right">${money(x.costo)}</td><td class="adm-right">${money(x.valor)}</td></tr>`).join('')||'<tr><td colspan="4">Sin movimientos en depósito todavía.</td></tr>'}</tbody></table></div></div></div>`;
    const s=document.getElementById('admSearch'); if(s)s.oninput=()=>{const q=s.value.toLowerCase();document.getElementById('admRows').innerHTML=productRows(rows.filter(x=>`${x.producto} ${x.local} ${x.proveedor}`.toLowerCase().includes(q)));};
  }
  function productRows(rows){return rows.map(x=>`<tr><td>${esc(x.producto)}</td><td>${esc(x.local)}</td><td>${esc(x.stock)} ${esc(x.unidad)}</td><td class="adm-right">${money(x.costo_promedio)}</td><td class="adm-right">${money(x.ultimo_costo)}</td><td class="adm-right">${money(x.valor)}</td></tr>`).join('')||'<tr><td colspan="6">Sin resultados.</td></tr>';}
  function options(products){return products.map((x,i)=>`<option value="${i}">${esc(x.producto)} · ${esc(x.local||x.unidad||'')}</option>`).join('');}
  function buy(){document.getElementById('admBody').innerHTML=`<div class="adm-panel"><h2>Registrar compra / factura</h2><div class="adm-form"><label>Proveedor<input id="bProv" placeholder="Proveedor"></label><label>Comprobante<input id="bComp" placeholder="Factura / remito"></label><label>Destino<select id="bDest"><option>Depósito Central</option>${[...new Set((DATA.products||[]).map(x=>x.local))].sort().map(x=>`<option>${esc(x)}</option>`).join('')}</select></label><label>Producto<select id="bProd">${options(DATA.products||[])}</select></label><label>Cantidad<input id="bQty" inputmode="decimal" placeholder="0"></label><label>Costo unitario neto<input id="bCost" inputmode="decimal" placeholder="$ 0"></label><label>Responsable<input id="bResp" placeholder="Nombre"></label><label>Observaciones<input id="bObs" placeholder="Opcional"></label><div class="wide"><button id="bSave" class="adm-btn">Guardar compra y actualizar costo</button><div id="bMsg" class="adm-msg"></div></div></div></div>`;document.getElementById('bSave').onclick=saveBuy;}
  async function saveBuy(){const msg=document.getElementById('bMsg');try{const p=DATA.products[+document.getElementById('bProd').value];const qty=num(document.getElementById('bQty').value),cost=num(document.getElementById('bCost').value);if(!(qty>0&&cost>0))throw new Error('Completá cantidad y costo unitario.');msg.textContent='Guardando...';await post({action:'savePurchase',proveedor:document.getElementById('bProv').value,comprobante:document.getElementById('bComp').value,destino:document.getElementById('bDest').value,responsable:document.getElementById('bResp').value,observaciones:document.getElementById('bObs').value,items:[{codigo:p.codigo,producto:p.producto,categoria:p.categoria,unidad:p.unidad,cantidad:qty,costo_unitario:cost}]});msg.textContent='Compra registrada correctamente.';DATA=await get('getAdminFinance');}catch(e){msg.textContent=e.message;}}
  function trf(){const central=(DATA.central||[]).filter(x=>x.stock>0);document.getElementById('admBody').innerHTML=`<div class="adm-panel"><h2>Transferir desde Depósito Central</h2><div class="adm-form"><label>Producto<select id="tProd">${options(central)}</select></label><label>Destino<select id="tDest">${[...new Set((DATA.products||[]).map(x=>x.local))].sort().map(x=>`<option>${esc(x)}</option>`).join('')}</select></label><label>Cantidad<input id="tQty" inputmode="decimal" placeholder="0"></label><label>Responsable<input id="tResp" placeholder="Nombre"></label><label class="wide">Observaciones<input id="tObs" placeholder="Opcional"></label><div class="wide"><button id="tSave" class="adm-btn">Transferir stock</button><div id="tMsg" class="adm-msg"></div></div></div></div>`;document.getElementById('tSave').onclick=saveTrf;}
  async function saveTrf(){const msg=document.getElementById('tMsg');try{const central=(DATA.central||[]).filter(x=>x.stock>0),p=central[+document.getElementById('tProd').value],qty=num(document.getElementById('tQty').value);if(!p||!(qty>0))throw new Error('Elegí producto y cantidad.');msg.textContent='Transfiriendo...';await post({action:'saveTransfer',origen:'Depósito Central',destino:document.getElementById('tDest').value,responsable:document.getElementById('tResp').value,observaciones:document.getElementById('tObs').value,items:[{codigo:p.codigo,producto:p.producto,unidad:p.unidad,cantidad:qty,costo_unitario:p.costo}]});msg.textContent='Transferencia registrada.';DATA=await get('getAdminFinance');}catch(e){msg.textContent=e.message;}}

  if(!document.getElementById('adminFinanceStyles')) css();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',shell); else shell();
})();
