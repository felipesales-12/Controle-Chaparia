import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
