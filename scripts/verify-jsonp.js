const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function jsonpGet_(');
const end=html.indexOf('// Apps Script a veces tarda',start);
assert.ok(start>0&&end>start);
async function scenario(mode){
  const timers=[];
  let script;
  const win={};
  const ctx=vm.createContext({URL,window:win,setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{},document:{
    createElement:()=>({}),head:{appendChild:el=>{script=el;el.parentNode={removeChild:()=>{el.parentNode=null;}};}}
  }});
  vm.runInContext(html.slice(start,end),ctx);
  const promise=vm.runInContext("jsonpGet_(new URL('https://example.test/exec'),45000)",ctx);
  const result=promise.then(value=>({value}),error=>({error}));
  const callback=new URL(script.src).searchParams.get('callback');
  assert.equal(timers[0].ms,45000);
  if(mode==='success'){
    win[callback]({ok:true});
    assert.equal((await result).value.ok,true);
    assert.equal(win[callback],undefined);
  }else if(mode==='late'){
    timers[0].fn();
    assert.match((await result).error.message,/tardó/);
    assert.equal(typeof win[callback],'function');
    assert.doesNotThrow(()=>win[callback]({ok:true}));
    assert.equal(timers[1].ms,60000);
    timers[1].fn();
    assert.equal(win[callback],undefined);
  }else{
    script.onerror();
    assert.match((await result).error.message,/No se pudo/);
    assert.equal(win[callback],undefined);
  }
  assert.equal(script.parentNode,null);
}
(async()=>{await scenario('success');await scenario('late');await scenario('error');console.log('JSONP checks passed: success, bounded wait, late response and load error.');})().catch(error=>{console.error(error);process.exitCode=1;});
