/* ============================== ADMIN FINANCE ============================== */

var SHEET_MOV_STOCK = 'MOVIMIENTOS STOCK';
var SHEET_FACTURAS = 'FACTURAS COMPRAS';
var SHEET_TRANSFERENCIAS = 'TRANSFERENCIAS INTERNAS';

var MOV_HEADERS = ['Fecha_Hora','ID_Movimiento','Tipo','Origen','Destino','Código','Producto','Categoría','Cantidad','Unidad','Costo_Unitario','Valor','Responsable','Comprobante'];
var BUY_HEADERS = ['Fecha_Hora','ID_Compra','Proveedor','Comprobante','Destino','Código','Producto','Categoría','Cantidad','Unidad','Costo_Unitario_Neto','Neto','IVA','Total','Responsable','Observaciones'];
var TRF_HEADERS = ['Fecha_Hora','ID_Transferencia','Origen','Destino','Código','Producto','Cantidad','Unidad','Costo_Unitario','Responsable','Estado','Observaciones'];

function adminNum_(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  var s = String(v).trim().replace(/\s/g, '');
  if (s.indexOf(',') > -1 && s.indexOf('.') > -1) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.indexOf(',') > -1) s = s.replace(',', '.');
  var n = Number(s);
  return isFinite(n) ? n : 0;
}

function adminNorm_(v) {
  return String(v || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function ensureAdminSheet_(name, headers, color) {
  var ss = ss_();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var first = sh.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  var needsHeader = first.join('').trim() === '' || first[0] !== headers[0];
  if (needsHeader) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setFontColor('#ffffff').setBackground(color || '#17596a');
  sh.setFrozenRows(1);
  return sh;
}

function adminCatalogMeta_() {
  var sh = ss_().getSheetByName(SHEET_CATALOGO);
  if (!sh) return null;
  var values = sh.getDataRange().getValues();
  if (!values.length) return null;
  var head = values[0].map(adminNorm_);
  function col(names) {
    for (var i = 0; i < names.length; i++) {
      var at = head.indexOf(adminNorm_(names[i]));
      if (at > -1) return at;
    }
    return -1;
  }
  return {
    sh: sh, values: values,
    iCod: col(['Código','Codigo']), iNom: col(['Producto','Nombre']), iLocal: col(['Local_Aplicable','Local']),
    iCat: col(['Categoría','Categoria']), iUni: col(['Unidad_Medida','Unidad']), iProv: col(['Proveedor']),
    iStock: col(['Stock_Actual']), iUlt: col(['Último_Costo','Ultimo_Costo']), iProm: col(['Costo_Promedio']),
    iValor: col(['Valor_Stock']), iFecha: col(['Fecha_Ultimo_Costo'])
  };
}

function findCatalogRow_(meta, local, codigo, producto) {
  if (!meta) return -1;
  var nl = adminNorm_(local), nc = adminNorm_(codigo), np = adminNorm_(producto);
  for (var r = 1; r < meta.values.length; r++) {
    var row = meta.values[r];
    if (nl && adminNorm_(row[meta.iLocal]) !== nl) continue;
    if (nc && meta.iCod > -1 && adminNorm_(row[meta.iCod]) === nc) return r;
    if (np && meta.iNom > -1 && adminNorm_(row[meta.iNom]) === np) return r;
  }
  return -1;
}

function updateCatalogCostStock_(local, item, qtyDelta, cost, replaceStock) {
  var meta = adminCatalogMeta_();
  if (!meta) return false;
  var r = findCatalogRow_(meta, local, item.codigo || '', item.producto || item.nombre || '');
  if (r < 1) return false;
  var stockOld = meta.iStock > -1 ? adminNum_(meta.values[r][meta.iStock]) : 0;
  var avgOld = meta.iProm > -1 ? adminNum_(meta.values[r][meta.iProm]) : 0;
  var stockNew = replaceStock === true ? adminNum_(qtyDelta) : stockOld + adminNum_(qtyDelta);
  var qtyIn = adminNum_(qtyDelta);
  var avgNew = avgOld;
  if (cost > 0 && qtyIn > 0) {
    var baseQty = Math.max(stockOld, 0);
    avgNew = baseQty + qtyIn > 0 ? ((baseQty * (avgOld || cost)) + (qtyIn * cost)) / (baseQty + qtyIn) : cost;
  }
  if (meta.iStock > -1) meta.sh.getRange(r + 1, meta.iStock + 1).setValue(stockNew);
  if (meta.iUlt > -1 && cost > 0) meta.sh.getRange(r + 1, meta.iUlt + 1).setValue(cost);
  if (meta.iProm > -1 && (avgNew > 0 || cost > 0)) meta.sh.getRange(r + 1, meta.iProm + 1).setValue(avgNew || cost);
  if (meta.iValor > -1) meta.sh.getRange(r + 1, meta.iValor + 1).setValue(stockNew * (avgNew || cost || avgOld || 0));
  if (meta.iFecha > -1 && cost > 0) meta.sh.getRange(r + 1, meta.iFecha + 1).setValue(new Date());
  return true;
}

function appendAdminMovement_(data) {
  var sh = ensureAdminSheet_(SHEET_MOV_STOCK, MOV_HEADERS, '#17596a');
  var qty = adminNum_(data.cantidad), cost = adminNum_(data.costo_unitario);
  sh.appendRow([
    data.fecha_hora || new Date(), data.id || ('MOV' + Date.now()), data.tipo || '', data.origen || '', data.destino || '',
    data.codigo || '', data.producto || '', data.categoria || '', qty, data.unidad || 'unidad', cost, qty * cost,
    data.responsable || '', data.comprobante || ''
  ]);
}

function saveAdminPurchase_(d) {
  if (!d || !d.items || !d.items.length) return { ok:false, error:'La compra no tiene productos' };
  var id = d.id_compra || ('CMP' + Date.now().toString().slice(-9));
  var fecha = d.fecha_hora || new Date();
  var destino = d.destino || 'Depósito Central';
  var sh = ensureAdminSheet_(SHEET_FACTURAS, BUY_HEADERS, '#7a4a18');
  var rows = [];
  d.items.forEach(function(it){
    var qty = adminNum_(it.cantidad), cost = adminNum_(it.costo_unitario), iva = adminNum_(it.iva);
    if (!(qty > 0)) return;
    var neto = qty * cost;
    rows.push([fecha,id,d.proveedor||it.proveedor||'',d.comprobante||'',destino,it.codigo||'',it.producto||'',it.categoria||'',qty,it.unidad||'unidad',cost,neto,iva,neto+iva,d.responsable||'',d.observaciones||'']);
    appendAdminMovement_({fecha_hora:fecha,id:id+'-'+rows.length,tipo:'COMPRA',origen:d.proveedor||'Proveedor',destino:destino,codigo:it.codigo,producto:it.producto,categoria:it.categoria,cantidad:qty,unidad:it.unidad,costo_unitario:cost,responsable:d.responsable,comprobante:d.comprobante});
    if (adminNorm_(destino) !== adminNorm_('Depósito Central')) updateCatalogCostStock_(destino,it,qty,cost,false);
  });
  if (!rows.length) return { ok:false, error:'No hay cantidades válidas' };
  sh.getRange(sh.getLastRow()+1,1,rows.length,BUY_HEADERS.length).setValues(rows);
  invalidateBootstrapCaches_();
  return {ok:true,id_compra:id,rows:rows.length};
}

function centralBalanceFor_(codigo, producto) {
  var sh = ss_().getSheetByName(SHEET_MOV_STOCK);
  if (!sh || sh.getLastRow() < 2) return 0;
  var v = sh.getDataRange().getValues(), h = v[0].map(adminNorm_);
  var iDest=h.indexOf(adminNorm_('Destino')), iOrig=h.indexOf(adminNorm_('Origen')), iCod=h.indexOf(adminNorm_('Código')), iProd=h.indexOf(adminNorm_('Producto')), iQty=h.indexOf(adminNorm_('Cantidad'));
  var bal=0, nc=adminNorm_(codigo), np=adminNorm_(producto), dep=adminNorm_('Depósito Central');
  for(var r=1;r<v.length;r++){
    var match=(nc && adminNorm_(v[r][iCod])===nc) || (np && adminNorm_(v[r][iProd])===np);
    if(!match) continue;
    var q=adminNum_(v[r][iQty]);
    if(adminNorm_(v[r][iDest])===dep) bal+=q;
    if(adminNorm_(v[r][iOrig])===dep) bal-=q;
  }
  return bal;
}

function saveAdminTransfer_(d) {
  if (!d || !d.items || !d.items.length) return {ok:false,error:'La transferencia no tiene productos'};
  var origen=d.origen||'Depósito Central', destino=d.destino||'';
  if (!destino) return {ok:false,error:'Falta destino'};
  var id=d.id_transferencia||('TRF'+Date.now().toString().slice(-9)), fecha=d.fecha_hora||new Date();
  var sh=ensureAdminSheet_(SHEET_TRANSFERENCIAS,TRF_HEADERS,'#3d6b57'), rows=[];
  for(var i=0;i<d.items.length;i++){
    var it=d.items[i], qty=adminNum_(it.cantidad), cost=adminNum_(it.costo_unitario);
    if(!(qty>0)) continue;
    if(adminNorm_(origen)===adminNorm_('Depósito Central')){
      var available=centralBalanceFor_(it.codigo||'',it.producto||'');
      if(available+1e-9<qty) return {ok:false,error:'Stock insuficiente en Depósito Central para '+(it.producto||it.codigo||'producto')+' (disponible '+available+')'};
    } else {
      updateCatalogCostStock_(origen,it,-qty,0,false);
    }
    updateCatalogCostStock_(destino,it,qty,cost,false);
    rows.push([fecha,id,origen,destino,it.codigo||'',it.producto||'',qty,it.unidad||'unidad',cost,d.responsable||'','Transferido',d.observaciones||'']);
    appendAdminMovement_({fecha_hora:fecha,id:id+'-'+rows.length,tipo:'TRANSFERENCIA',origen:origen,destino:destino,codigo:it.codigo,producto:it.producto,categoria:it.categoria,cantidad:qty,unidad:it.unidad,costo_unitario:cost,responsable:d.responsable,comprobante:id});
  }
  if(!rows.length) return {ok:false,error:'No hay cantidades válidas'};
  sh.getRange(sh.getLastRow()+1,1,rows.length,TRF_HEADERS.length).setValues(rows);
  invalidateBootstrapCaches_();
  return {ok:true,id_transferencia:id,rows:rows.length};
}

function getAdminFinance_() {
  var meta=adminCatalogMeta_(), products=[], totalValue=0, low=0, out=0;
  if(meta){
    for(var r=1;r<meta.values.length;r++){
      var row=meta.values[r], name=meta.iNom>-1?String(row[meta.iNom]||'').trim():'', local=meta.iLocal>-1?String(row[meta.iLocal]||'').trim():'';
      if(!name||!local) continue;
      var stock=meta.iStock>-1?adminNum_(row[meta.iStock]):0, min=9>-1?adminNum_(row[9]):0, last=meta.iUlt>-1?adminNum_(row[meta.iUlt]):0, avg=meta.iProm>-1?adminNum_(row[meta.iProm]):0;
      var val=stock*(avg||last||0); totalValue+=val;
      if(stock<=0) out++; else if(min>0&&stock<=min) low++;
      products.push({codigo:meta.iCod>-1?row[meta.iCod]:'',producto:name,local:local,categoria:meta.iCat>-1?row[meta.iCat]:'',unidad:meta.iUni>-1?row[meta.iUni]:'unidad',proveedor:meta.iProv>-1?row[meta.iProv]:'',stock:stock,ultimo_costo:last,costo_promedio:avg,valor:val});
    }
  }
  var central={};
  var mov=ss_().getSheetByName(SHEET_MOV_STOCK);
  if(mov&&mov.getLastRow()>1){
    var v=mov.getDataRange().getValues(), h=v[0].map(adminNorm_), iDest=h.indexOf(adminNorm_('Destino')), iOrig=h.indexOf(adminNorm_('Origen')), iCod=h.indexOf(adminNorm_('Código')), iProd=h.indexOf(adminNorm_('Producto')), iQty=h.indexOf(adminNorm_('Cantidad')), iUni=h.indexOf(adminNorm_('Unidad')), iCost=h.indexOf(adminNorm_('Costo_Unitario')), dep=adminNorm_('Depósito Central');
    for(var x=1;x<v.length;x++){
      var key=adminNorm_(v[x][iCod]||v[x][iProd]); if(!key) continue;
      if(!central[key]) central[key]={codigo:v[x][iCod]||'',producto:v[x][iProd]||'',unidad:v[x][iUni]||'unidad',stock:0,costo:0};
      var q=adminNum_(v[x][iQty]);
      if(adminNorm_(v[x][iDest])===dep){central[key].stock+=q;if(adminNum_(v[x][iCost])>0)central[key].costo=adminNum_(v[x][iCost]);}
      if(adminNorm_(v[x][iOrig])===dep)central[key].stock-=q;
    }
  }
  var centralArr=Object.keys(central).map(function(k){var a=central[k];a.valor=a.stock*a.costo;return a;}).filter(function(a){return Math.abs(a.stock)>1e-9;});
  var centralValue=centralArr.reduce(function(s,a){return s+a.valor;},0);
  return {ok:true,generated_at:new Date(),metrics:{valor_stock_locales:totalValue,valor_deposito_central:centralValue,valor_total:totalValue+centralValue,sin_stock:out,stock_bajo:low,productos:products.length},products:products,central:centralArr};
}
