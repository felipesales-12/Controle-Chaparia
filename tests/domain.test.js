import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applyOperation, criticalSheets, purchaseText, fits, remnantValues, transactionReducer } from '../js/domain.js';
import { createTask, selectTasks, getMetrics } from '../js/tasks.js';
import { backupJSON, validateBackup, tasksCSV } from '../js/backup.js';
const actor = { uid:'operator-1', email:'pcp@example.com' };
let sequence=0;
const apply = (state, operation) => applyOperation(state,{...operation,eventId:`event-${++sequence}`},actor,1700000000000);
const task = () => createTask({ title:'Inspecionar corte', requester:'PCP', location:'Máquina 01', priority:'high', status:'pending', description:'Conferir largura', notes:'', dueDate:'2030-01-01' });
test('empty database seeds exactly 14 catalog items with zero balance', () => {
  const state=initialState(); assert.equal(Object.keys(state.sheets).length,14); assert.equal(criticalSheets(state.sheets).length,14);
  assert.deepEqual(Object.values(state.sheets).filter(s=>s.material==='carbono').map(s=>s.thickness),[2,3,4.76,6.35,7.94,9.35,12.7,19.05]);
  assert.deepEqual(Object.values(state.sheets).filter(s=>s.material==='inox').map(s=>s.thickness),[1.5,2,3,4,5,6.35]);
  assert.ok(Object.values(state.sheets).every(s=>s.quantity===0));
});
test('stock and audit commit together without mutating the old state',()=>{
  const old=initialState(), next=apply(old,{type:'sheet-in',id:'carbono-2',quantity:3,reason:'NF 102'});
  assert.equal(old.sheets['carbono-2'].quantity,0); assert.equal(next.sheets['carbono-2'].quantity,3);
  const log=Object.values(next.movements)[0]; assert.equal(log.before.quantity,0);assert.equal(log.after.quantity,3);assert.equal(log.actor.uid,actor.uid);assert.equal(log.reason,'NF 102');assert.equal(log.timestamp,1700000000000);
});
test('critical threshold includes 2 and excludes 3',()=>{
  let state=apply(initialState(),{type:'sheet-in',id:'carbono-2',quantity:3});assert.equal(criticalSheets(state.sheets).length,13);
  state=apply(state,{type:'sheet-out',id:'carbono-2',quantity:1});assert.equal(criticalSheets(state.sheets).length,14);assert.match(purchaseText(state.sheets),/Aço Carbono 2mm — Restam 2 chapas/);
});
test('insufficient or fractional stock movements leave no change',()=>{
  const state=initialState();assert.throws(()=>apply(state,{type:'sheet-out',id:'carbono-2',quantity:1}),/Saldo insuficiente/);
  for(const quantity of [0,-1,1.5,'',Infinity,1000001])assert.throws(()=>apply(state,{type:'sheet-in',id:'carbono-2',quantity}));
  assert.equal(state.movements,undefined);
});
test('two withdrawals are checked against the latest balance',()=>{
  const state=apply(initialState(),{type:'sheet-in',id:'inox-3',quantity:1});
  const first=apply(state,{type:'sheet-out',id:'inox-3',quantity:1});assert.throws(()=>apply(first,{type:'sheet-out',id:'inox-3',quantity:1}),/Saldo insuficiente/);
});
test('dimension updates reject concurrent stale edits',()=>{
  const next=apply(initialState(),{type:'sheet-edit',id:'inox-2',revision:1,width:1000,length:2000,location:'A1'});
  assert.throws(()=>apply(next,{type:'sheet-edit',id:'inox-2',revision:1,width:1200,length:2400,location:'B1'}),/outro aparelho/);
});
const remnant={type:'remnant-add',id:'remnant-1',material:'carbono',thickness:4.76,width:800,length:1200,quantity:3,location:'R-02',notes:'Corte em L'};
test('remnants accept only the specified material and thickness pairs',()=>{
  assert.throws(()=>remnantValues({...remnant,material:'inox',thickness:4.76}));assert.throws(()=>remnantValues({...remnant,location:''}));assert.throws(()=>remnantValues({...remnant,width:0}));
});
test('fit search accounts for 90 degree rotation and unavailable stock',()=>{
  assert.equal(fits(remnant,1000,700,true),true);assert.equal(fits(remnant,1000,700,false),false);assert.equal(fits(remnant,900,1300),false);assert.equal(fits({...remnant,quantity:0},100,100),false);
});
test('cutting one piece from a batch preserves uncut pieces',()=>{
  let state=apply(initialState(),remnant);
  state=apply(state,{type:'remnant-resize',id:remnant.id,childId:'child-1',revision:1,width:400,length:600,location:'R-03',notes:'Retangular'});
  assert.equal(state.remnants[remnant.id].quantity,2);assert.equal(state.remnants[remnant.id].width,800);
  assert.equal(state.remnants['child-1'].quantity,1);assert.equal(state.remnants['child-1'].width,400);assert.equal(state.remnants['child-1'].parentId,remnant.id);
});
test('sub-remnant rejects larger dimensions and stale requests',()=>{
  const state=apply(initialState(),remnant);
  for(const values of [{width:900,length:1300},{width:800,length:1200},{width:-1,length:100}])assert.throws(()=>apply(state,{type:'remnant-resize',id:remnant.id,childId:'child-1',revision:1,...values}));
  const consumed=apply(state,{type:'remnant-consume',id:remnant.id,revision:1});assert.equal(consumed.remnants[remnant.id].quantity,0);
  assert.throws(()=>apply(consumed,{type:'remnant-resize',id:remnant.id,childId:'child-1',revision:1,width:100,length:100}),/outro aparelho/);
});
test('single-piece cut changes its dimensions and preserves identity',()=>{
  const state=apply(initialState(),{...remnant,quantity:1});const next=apply(state,{type:'remnant-resize',id:remnant.id,revision:1,width:200,length:600});
  assert.equal(next.remnants[remnant.id].quantity,1);assert.equal(next.remnants[remnant.id].width,200);assert.equal(Object.keys(next.remnants).length,1);
});
test('task CRUD, audit and revision protection',()=>{
  const t=task();let state=apply(initialState(),{type:'task-add',task:t});
  state=apply(state,{type:'task-put',task:{...state.tasks[t.id],status:'progress'}});assert.equal(state.tasks[t.id]._cloudRevision,2);
  assert.throws(()=>apply(state,{type:'task-put',task:{...t,_cloudRevision:1}}),/outro aparelho/);
  state=apply(state,{type:'task-remove',id:t.id,revision:2});assert.equal(state.tasks[t.id],undefined);assert.equal(Object.keys(state.movements).length,3);
});
test('all activity fields and dates survive JSON backup restoration',()=>{
  const t=task(), decoded=validateBackup(JSON.parse(backupJSON([t],{theme:'dark'})));
  assert.deepEqual(decoded.tasks,[t]);assert.equal(decoded.settings.theme,'dark');
  const old=apply(initialState(),{type:'task-add',task:t});const next=apply(old,{type:'task-replace',tasks:[],expected:JSON.stringify(old.tasks)});
  assert.deepEqual(next.tasks,{});assert.deepEqual(next.sheets,old.sheets);assert.equal(Object.keys(next.movements).length,2);
});
test('stale backup restore cannot overwrite activities changed by another user',()=>{
  const state=apply(initialState(),{type:'task-add',task:task()});assert.throws(()=>apply(state,{type:'task-replace',tasks:[],expected:'{}'}),/outro aparelho/);
});
test('existing task search, filters, completion and CSV remain compatible',()=>{
  const t=task(), completed={...t,id:'finished',status:'completed',completedAt:new Date().toISOString()};
  assert.equal(selectTasks([t],{search:'MAQUINA'}).length,1);assert.equal(selectTasks([t],{priority:'critical'}).length,0);assert.equal(selectTasks([t,completed],{},true).length,1);assert.equal(getMetrics([t,completed]).active,1);
  assert.match(tasksCSV([{...t,title:'=HYPERLINK(1)'}]),/"'=HYPERLINK\(1\)"/);
});
test('unsafe Firebase keys and unsupported schemas are rejected',()=>{
  assert.throws(()=>apply(initialState(),{...remnant,id:'bad.key'}),/Identificador/);assert.throws(()=>apply({schemaVersion:2},remnant),/Estrutura/);
});

test('Firebase retry callbacks abort with an actionable error instead of throwing',()=>{
  const operation=transactionReducer({type:'sheet-out',id:'carbono-2',quantity:1,eventId:'retry-cut'},actor,1700000000000);
  const available=apply(initialState(),{type:'sheet-in',id:'carbono-2',quantity:1});
  assert.equal(operation.update(available).sheets['carbono-2'].quantity,0);assert.equal(operation.error,null);
  assert.equal(operation.update(initialState()),undefined);assert.match(operation.error.message,/Saldo insuficiente/);
});
