import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ref as modularRef, goOffline, goOnline } from 'firebase/database';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { initialState, transactionReducer } from '../js/domain.js';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-chaparia',database:{host:'127.0.0.1',port:9000,rules:await readFile('database.rules.json','utf8')}});});
beforeEach(async()=>{await env.clearDatabase();});
after(async()=>{await env?.cleanup();});
test('unauthenticated reads and writes are denied',async()=>{
  const db=env.unauthenticatedContext().database();await assertFails(db.ref('chaparia').get());await assertFails(db.ref('chaparia').set(initialState()));
});
test('authenticated initialization succeeds and preserves 14 zero balances',async()=>{
  const db=env.authenticatedContext('pcp').database();await assertSucceeds(db.ref('chaparia').set(initialState()));const state=(await db.ref('chaparia').get()).val();assert.equal(Object.keys(state.sheets).length,14);
});
test('negative and fractional balances are rejected by database rules',async()=>{
  const db=env.authenticatedContext('pcp').database();await db.ref('chaparia').set(initialState());await assertFails(db.ref('chaparia/sheets/carbono-2/quantity').set(-1));await assertFails(db.ref('chaparia/sheets/carbono-2/quantity').set(1.5));
});
test('invalid dimensions and unsupported thickness are rejected',async()=>{
  const db=env.authenticatedContext('pcp').database();await db.ref('chaparia').set(initialState());await assertFails(db.ref('chaparia/sheets/carbono-2/width').set(0));await assertFails(db.ref('chaparia/sheets/carbono-2/thickness').set(0));
});
test('simultaneous initialization does not overwrite preexisting stock',async()=>{
  const a=env.authenticatedContext('office').database().ref('chaparia'),b=env.authenticatedContext('shop').database().ref('chaparia');
  const seed=initialState();seed.sheets['carbono-2'].quantity=7;await a.set(seed);
  await Promise.all([a.transaction(v=>v===null?initialState():undefined),b.transaction(v=>v===null?initialState():undefined)]);
  assert.equal((await a.get()).val().sheets['carbono-2'].quantity,7);
});
test('real database transactions serialize withdrawals and audit together',async()=>{
  const a=env.authenticatedContext('office').database().ref('chaparia'),b=env.authenticatedContext('shop').database().ref('chaparia');
  const seed=initialState();seed.sheets['carbono-2'].quantity=1;await a.set(seed);
  // Hold listeners before waiting, matching the production onValue lifecycle.
  await Promise.all([new Promise(resolve=>a.on('value',snap=>{if(snap.exists())resolve();})),new Promise(resolve=>b.on('value',snap=>{if(snap.exists())resolve();}))]);
  const office=transactionReducer({type:'sheet-out',id:'carbono-2',quantity:1,eventId:'office-cut'},{uid:'office',email:'pcp@example.com'},Date.now());
  const shop=transactionReducer({type:'sheet-out',id:'carbono-2',quantity:1,eventId:'shop-cut'},{uid:'shop',email:'fabrica@example.com'},Date.now());
  const results=await Promise.allSettled([a.transaction(office.update,undefined,false),b.transaction(shop.update,undefined,false)]);
  assert.equal(results.filter(r=>r.status==='fulfilled'&&r.value.committed).length,1);
  const final=(await a.get()).val();assert.equal(final.sheets['carbono-2'].quantity,0);assert.equal(Object.keys(final.movements).length,1);a.off('value');b.off('value');
});
test('custom materials and thicknesses validate together in the same root transaction',async()=>{
  const db=env.authenticatedContext('pcp').database();const state=initialState();
  state.materials={piso:{id:'piso',name:'Chapa piso',density:7850,revision:1}};
  state.sheets['piso-3']={id:'piso-3',material:'piso',thickness:3,width:1500,length:3000,quantity:0,location:'P-01',reorderPoint:5,active:true,revision:1};
  state.remnants={floor:{id:'floor',material:'piso',thickness:3,width:500,length:1000,quantity:1,location:'R1',notes:'',revision:1}};
  await assertSucceeds(db.ref('chaparia').set(state));assert.equal((await db.ref('chaparia/materials/piso/name').get()).val(),'Chapa piso');
});
test('material validation rejects unknown names, invalid densities and non-numeric thickness',async()=>{
  const db=env.authenticatedContext('pcp').database();await db.ref('chaparia').set(initialState());
  await assertFails(db.ref('chaparia/sheets/carbono-2/material').set('unknown'));
  await assertFails(db.ref('chaparia/sheets/carbono-2/thickness').set('3mm'));
  await assertFails(db.ref('chaparia/materials/piso').set({id:'piso',name:'Chapa piso',density:0,revision:1}));
});
test('replenishment points accept zero and reject negative or fractional values',async()=>{
  const db=env.authenticatedContext('pcp').database();await db.ref('chaparia').set(initialState());
  await assertSucceeds(db.ref('chaparia/sheets/carbono-2/reorderPoint').set(0));await assertSucceeds(db.ref('chaparia/sheets/carbono-2/reorderPoint').set(5));
  await assertFails(db.ref('chaparia/sheets/carbono-2/reorderPoint').set(-1));await assertFails(db.ref('chaparia/sheets/carbono-2/reorderPoint').set(1.5));
});
test('archive metadata preserves a legacy sheet while rejecting invalid state types',async()=>{
  const db=env.authenticatedContext('pcp').database();await db.ref('chaparia').set(initialState());
  await assertSucceeds(db.ref('chaparia/sheets/carbono-2').update({active:false,archivedAt:1700000000000,revision:2}));
  await assertFails(db.ref('chaparia/sheets/carbono-2/active').set('false'));
  await assertFails(db.ref('chaparia/sheets/carbono-2/quantity').set(1));
  assert.equal((await db.ref('chaparia/sheets/carbono-2/quantity').get()).val(),0);
});

test('stock becomes ready with bounded recent history; complete audit loads only on request',{timeout:15000},async()=>{
  const { watchSharedData, commitSharedTransaction }=await import('../js/shared-data.js');
  const db=env.authenticatedContext('pcp').database();const state=initialState();
  state.remnants={offcut:{id:'offcut',material:'carbono',thickness:2,width:500,length:1000,quantity:2,location:'R1',notes:'',revision:1}};
  state.movements=Object.fromEntries(Array.from({length:160},(_,i)=>{const id=`event-${String(i).padStart(3,'0')}`;return[id,{id,type:'sheet-in',description:'Entrada',actor:{uid:'pcp'},timestamp:1700000000000+i}];}));
  await db.ref('chaparia').set(state);
  const seen=[];let failure;const watcher=watchSharedData(db,{onChange:value=>seen.push(value),onError:error=>{failure=error;}});
  const until=async condition=>{const start=Date.now();while(!condition()){if(failure)throw failure;if(Date.now()-start>10000)throw Error('Sync timed out');await new Promise(resolve=>setTimeout(resolve,20));}};
  try{
    await until(()=>seen.some(v=>v.loaded));assert.equal(seen[0].historyLoaded,false);
    assert.equal(seen[0].data.remnants.offcut.quantity,2);
    await until(()=>Object.keys(seen.at(-1).data.movements||{}).length===100);
    assert.equal(seen.at(-1).data.movements['event-000'],undefined);assert.ok(seen.at(-1).data.movements['event-159']);
    const operation=transactionReducer({type:'sheet-in',id:'carbono-2',quantity:1,eventId:'new-entry'},{uid:'pcp',email:'pcp@example.com'},1700000001000);
    const result=await commitSharedTransaction(modularRef(db,'chaparia'),operation.update);assert.ok(result.committed);
    watcher.adoptTransaction(result.snapshot.val());await new Promise(resolve=>queueMicrotask(resolve));
    assert.equal(seen.at(-1).data.remnants.offcut.quantity,2);
    await db.ref('chaparia/remnants/offcut/quantity').set(1);
    await until(()=>seen.at(-1).data.remnants.offcut.quantity===1);
    assert.equal(Object.keys(result.snapshot.val().movements).length,161);assert.equal(result.snapshot.val().sheets['carbono-2'].quantity,1);
    watcher.loadHistory();await until(()=>seen.at(-1).historyLoaded);
    assert.equal(Object.keys(seen.at(-1).data.movements).length,161);assert.ok(seen.at(-1).data.movements['event-000']);
  }finally{watcher.stop();}
});

test('an initial connection timeout can recover without losing the authenticated session',{timeout:15000},async()=>{
  const { watchSharedData }=await import('../js/shared-data.js');
  const db=env.authenticatedContext('reconnect').database();
  await env.withSecurityRulesDisabled(async context=>context.database().ref('chaparia').set(initialState()));
  goOffline(db);
  let timedOut;const timeout=new Promise(resolve=>{timedOut=resolve;});
  let resolveReady;const ready=new Promise(resolve=>{resolveReady=resolve;});
  const watcher=watchSharedData(db,{timeoutMs:50,onChange:resolveReady,onError:timedOut});
  try{
    assert.match((await timeout).message,/demorou mais/);
    goOnline(db);const value=await ready;assert.equal(value.loaded,true);assert.equal(Object.keys(value.data.sheets).length,14);
  }finally{watcher.stop();goOnline(db);}
});

test('lightweight listeners initialize an empty database and stop delivering data after logout',{timeout:15000},async()=>{
  const { watchSharedData }=await import('../js/shared-data.js');const db=env.authenticatedContext('pcp').database();
  let resolveReady,rejectReady;const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});let calls=0;
  const watcher=watchSharedData(db,{onChange:value=>{calls++;if(value.loaded)resolveReady(value);},onError:rejectReady});
  const state=await ready;assert.equal(Object.keys(state.data.sheets).length,14);watcher.stop();const count=calls;
  await db.ref('chaparia/sheets/carbono-2/quantity').set(4);await new Promise(resolve=>setTimeout(resolve,30));assert.equal(calls,count);
});

test('concurrent batch imports commit stock, a new exact thickness and per-record audit only once',{timeout:15000},async()=>{
  const { commitSharedTransaction }=await import('../js/shared-data.js');
  const a=env.authenticatedContext('office').database(),b=env.authenticatedContext('shop').database();
  await a.ref('chaparia').set(initialState());
  const batch={format:'chaparia-retalhos',version:1,batchId:'test-batch',source:'test.xlsx',records:[
    {code:'CAR-9001',material:'carbono',thickness:9.53,width:330,length:330,quantity:25,location:'CAR-9001',notes:'Circular'},
    {code:'CAR-9002',material:'carbono',thickness:2,width:500,length:800,quantity:1,location:'CAR-9002',notes:''}
  ]};
  const office=transactionReducer({type:'remnant-import',batch,eventId:'office-import'},{uid:'office',email:'pcp@example.com'},1700000000000);
  const shop=transactionReducer({type:'remnant-import',batch,eventId:'shop-import'},{uid:'shop',email:'shop@example.com'},1700000000000);
  const results=await Promise.all([commitSharedTransaction(modularRef(a,'chaparia'),office.update),commitSharedTransaction(modularRef(b,'chaparia'),shop.update)]);
  assert.equal(results.filter(r=>r.committed).length,1);
  const state=(await a.ref('chaparia').get()).val();
  assert.equal(Object.keys(state.remnants).length,2);assert.equal(state.remnants['test-batch-CAR-9001'].quantity,25);
  assert.equal(state.sheets['carbono-9_53'].quantity,0);assert.equal(state.sheets['carbono-9_35'].quantity,0);
  assert.equal(Object.keys(state.movements).length,4);
  assert.equal(Object.values(state.movements).filter(m=>m.type==='remnant-add').length,2);
});

test('coded photo import validates against deployed schema without replacing legacy stock',{timeout:15000},async()=>{
  const { commitSharedTransaction }=await import('../js/shared-data.js');
  const db=env.authenticatedContext('pcp').database(),state=initialState();state.sheets['inox-6_35'].quantity=4;
  await db.ref('chaparia').set(state);
  const batch={format:'chaparia-retalhos',version:1,batchId:'coded-photos',source:'Test photos',ensureProductCatalog:true,records:[
    {code:'PHOTO-1',material:'carbono',thickness:19.05,width:200,length:800,quantity:1,location:'P1',notes:'Meia-lua'}
  ]};
  const operation=transactionReducer({type:'remnant-import',batch,eventId:'coded-import'},{uid:'pcp',email:'pcp@example.com'},1700000000000);
  const result=await commitSharedTransaction(modularRef(db,'chaparia'),operation.update);assert.ok(result.committed);
  const final=result.snapshot.val();assert.equal(final.sheets['inox-6_35'].quantity,4);assert.equal(final.sheets['inox-6'],undefined);
  assert.equal(final.sheets['carbono-9_53'].quantity,0);assert.equal(Object.values(final.movements['coded-import'].after.productCodes).length,13);
  assert.equal(final.remnants['coded-photos-PHOTO-1'].quantity,1);
});

test('real transaction unifies both stainless thicknesses and preserves zero balances and old audit',{timeout:15000},async()=>{
  const {commitSharedTransaction}=await import('../js/shared-data.js');
  const db=env.authenticatedContext('pcp').database(),state=initialState();state.sheets['inox-6_35'].quantity=3;
  state.sheets['inox-6']={...state.sheets['inox-6_35'],id:'inox-6',thickness:6,quantity:2};
  state.remnants={active:{id:'active',material:'inox',thickness:6,width:500,length:1000,quantity:2,location:'R1',notes:'Preservar',revision:1},consumed:{id:'consumed',material:'inox',thickness:6,width:100,length:200,quantity:0,location:'R2',notes:'Baixa',revision:1}};
  state.movements={old:{id:'old',type:'remnant-consume',description:'Antes da unificação',actor:{uid:'pcp'},timestamp:1,after:{thickness:6}}};
  await db.ref('chaparia').set(state);
  const operation=transactionReducer({type:'merge-inox-6-635',eventId:'unify'},{uid:'pcp',email:'pcp@example.com'},1700000000000);
  const result=await commitSharedTransaction(modularRef(db,'chaparia'),operation.update);assert.ok(result.committed);
  const final=result.snapshot.val();assert.equal(final.sheets['inox-6'],undefined);assert.equal(final.sheets['inox-6_35'].quantity,5);
  assert.equal(final.remnants.active.thickness,6.35);assert.equal(final.remnants.active.quantity,2);assert.equal(final.remnants.consumed.quantity,0);
  assert.equal(final.movements.old.after.thickness,6);assert.equal(final.movements.unify.before.sheets['inox-6'].quantity,2);
});

test('simultaneous devices unify stainless once without adding the old balance twice',{timeout:15000},async()=>{
  const {commitSharedTransaction}=await import('../js/shared-data.js');
  const a=env.authenticatedContext('office').database(),b=env.authenticatedContext('shop').database();
  const state=initialState();state.sheets['inox-6_35'].quantity=3;state.sheets['inox-6']={...state.sheets['inox-6_35'],id:'inox-6',thickness:6,quantity:2};
  await a.ref('chaparia').set(state);
  const first=transactionReducer({type:'merge-inox-6-635',eventId:'office-merge'},{uid:'office',email:'office@example.com'},1700000000000);
  const second=transactionReducer({type:'merge-inox-6-635',eventId:'shop-merge'},{uid:'shop',email:'shop@example.com'},1700000000000);
  const results=await Promise.all([commitSharedTransaction(modularRef(a,'chaparia'),first.update),commitSharedTransaction(modularRef(b,'chaparia'),second.update)]);
  assert.equal(results.filter(r=>r.committed).length,1);
  const final=(await a.ref('chaparia').get()).val();assert.equal(final.sheets['inox-6_35'].quantity,5);assert.equal(Object.keys(final.movements).length,1);
});
