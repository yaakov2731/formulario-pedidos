const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ctx = vm.createContext({console});
for (const file of fs.readdirSync('gas').filter(file=>file.endsWith('.gs'))) {
  vm.runInContext(fs.readFileSync(`gas/${file}`,'utf8'),ctx,{filename:file});
}
const rows=[];
function row(id,local,code,name,qty,unit,status='Recibido') {
  const value=Array(13).fill('');
  value[0]=id;value[3]=local;value[6]=code;value[7]=name;value[9]=qty;value[10]=unit;value[12]=status;
  return value;
}
for(let i=0;i<12;i++) rows.push(row(`P${i}`,'Parrilla','PAR001','Aceite',1,'litro'));
rows.push(row('P0','Umo Grill','PAR001','Aceite',2,'litro'));
rows.push(row('K1','Umo Grill','PAR001','Aceite',5,'kg'));
rows.push(row('G1','GreenFresh','PAR001','Aceite',9,'litro'));
rows.push(row('E1','Umo Grill','PAR001','Aceite',100,'litro','Entregado'));
rows.push(row('C1','Umo Grill','PAR001','Aceite',100,'litro','Cancelado'));
rows.push(row('N1','Umo Grill','PAR001','Aceite',-10,'litro'));
ctx.rows=rows;
const result=vm.runInContext('buildReceptionGuideByLocal_(rows)',ctx);
assert.equal(result['Umo Grill'].find(x=>x.unidad==='litro').cantidad,14);
assert.equal(result['Umo Grill'].find(x=>x.unidad==='litro').pedidos.length,12);
assert.equal(result['Umo Grill'].find(x=>x.unidad==='kg').cantidad,5);
assert.equal(result.GreenFresh[0].cantidad,9);

// Test actual frontend comparison functions without DOM or live writes.
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function receptionReference(item,local)');
const end=html.indexOf('function renderProduccionModule()',start);
assert.ok(start>0&&end>start);
ctx.SNAPSHOT={receptionGuideByLocal:result};
ctx.LIVE=true;
ctx.capabilityEnabled=()=>true;
ctx.num=v=>{const n=parseFloat(String(v).replace(',','.'));return Number.isFinite(n)?n:null;};
ctx.trim=n=>Number(n.toFixed(2));
ctx.normalizeLooseText=v=>String(v||'').toLowerCase();
vm.runInContext(html.slice(start,end),ctx);
ctx.item={codigo:'PAR001',nombre:'Aceite',unidad:'litro'};
assert.match(vm.runInContext("receptionReferenceText(item,'Umo Grill',7)",ctx),/revisar unidades/);
ctx.SNAPSHOT.receptionGuideByLocal['Umo Grill']=result['Umo Grill'].filter(x=>x.unidad==='litro');
assert.match(vm.runInContext("receptionReferenceText(item,'Umo Grill',7)",ctx),/7 litro menos/);
assert.match(vm.runInContext("receptionReferenceText(item,'Umo Grill',14)",ctx),/coincide/);
assert.match(vm.runInContext("receptionReferenceText(item,'Umo Grill',16)",ctx),/2 litro más/);
ctx.LIVE=false;
assert.equal(vm.runInContext("receptionReference(item,'Umo Grill').length",ctx),0);
console.log('Reception guide passed: all rows, aliases, units, cancellations, local separation and actual input comparisons.');
