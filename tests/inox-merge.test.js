import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,applyOperation,prepareRemnantImport,sheetId} from '../js/domain.js';
import {canonicalThickness,needsInoxMerge} from '../js/inox-merge.js';
import {getMaterials} from '../js/catalog.js';
import {productCode} from '../js/product-codes.js';
import {stockWeightDetails,stockWeightSummary} from '../js/weights.js';
import {parseRemnantRows} from '../js/remnant-file.js';
const actor={uid:'pcp',email:'pcp@example.com'};
const apply=state=>applyOperation(state,{type:'merge-inox-6-635',eventId:'unify'},actor,1700000000000);
function stock(){
  const state=initialState();state.sheets['inox-6_35'].quantity=3;state.sheets['inox-6_35'].location='A';state.sheets['inox-6_35'].reorderPoint=2;
  state.sheets['inox-6']={...state.sheets['inox-6_35'],id:'inox-6',thickness:6,quantity:2,revision:4,reorderPoint:5};
  state.remnants={old:{id:'old',material:'inox',thickness:6,width:500,length:1000,quantity:2,location:'R1',notes:'Circular; manter observação',revision:2,importBatch:'legacy-batch'},target:{id:'target',material:'inox',thickness:6.35,width:300,length:400,quantity:1,location:'R2',notes:'',revision:1},consumed:{id:'consumed',material:'inox',thickness:6,width:100,length:200,quantity:0,location:'R3',notes:'Já consumido',revision:3}};
  state.movements={past:{id:'past',type:'remnant-add',actor:{uid:'old-user'},timestamp:1,description:'Registro antigo',after:{thickness:6}}};
  return state;
}
test('identical whole sheets merge their quantities; all remnant IDs, notes and consumed stock survive',()=>{
  const original=stock(),next=apply(original);
  assert.equal(original.sheets['inox-6'].quantity,2);assert.equal(next.sheets['inox-6'],undefined);
  assert.equal(next.sheets['inox-6_35'].quantity,5);assert.equal(next.sheets['inox-6_35'].reorderPoint,5);
  assert.deepEqual(Object.keys(next.remnants),Object.keys(original.remnants));
  for(const [id,item] of Object.entries(original.remnants)){
    assert.equal(next.remnants[id].quantity,item.quantity);assert.equal(next.remnants[id].width,item.width);assert.equal(next.remnants[id].length,item.length);assert.equal(next.remnants[id].location,item.location);assert.equal(next.remnants[id].notes,item.notes);assert.equal(next.remnants[id].thickness,6.35);
  }
  assert.equal(next.remnants.consumed.quantity,0);assert.equal(next.remnants.old.importBatch,'legacy-batch');
  assert.deepEqual(next.movements.past,original.movements.past);
  assert.equal(next.movements.unify.before.sheets['inox-6'].quantity,2);
  assert.equal(next.movements.unify.before.remnants.old.thickness,6);
  assert.equal(next.movements.unify.after.productCode,'3.0011.010.1');
  assert.equal(next.movements.unify.actor.uid,'pcp');assert.equal(needsInoxMerge(next),false);
});
test('different dimensions or locations remain separate lots of the unified thickness',()=>{
  for(const change of [{width:1200},{location:'B'}]){
    const state=stock();Object.assign(state.sheets['inox-6'],change);const next=apply(state);
    const sheets=Object.values(next.sheets).filter(s=>s.material==='inox'&&s.thickness===6.35);
    assert.equal(sheets.length,2);assert.equal(sheets.reduce((n,s)=>n+s.quantity,0),5);
    assert.equal(next.sheets['inox-6'].quantity,2);assert.equal(next.sheets['inox-6'].thickness,6.35);
    for(const [key,value] of Object.entries(change))assert.equal(next.sheets['inox-6'][key],value);
  }
});
test('missing target catalog is created from the source without discarding its dimensions or location',()=>{
  const state=stock();delete state.sheets['inox-6_35'];state.sheets['inox-6'].width=1234;state.sheets['inox-6'].location='LEGACY';
  const next=apply(state);assert.equal(next.sheets['inox-6_35'].quantity,2);assert.equal(next.sheets['inox-6_35'].width,1234);assert.equal(next.sheets['inox-6_35'].location,'LEGACY');
});
test('archived and very large sheet balances are preserved in separate valid lots',()=>{
  const state=stock();state.sheets['inox-6'].active=false;state.sheets['inox-6'].quantity=0;
  const next=apply(state);assert.equal(next.sheets['inox-6'].active,false);assert.equal(next.sheets['inox-6'].quantity,0);assert.equal(next.sheets['inox-6_35'].quantity,3);
  const large=stock();large.sheets['inox-6'].quantity=1000000;large.sheets['inox-6_35'].quantity=1000000;
  const unified=apply(large);assert.equal(unified.sheets['inox-6'].quantity,1000000);assert.equal(unified.sheets['inox-6_35'].quantity,1000000);
});
test('repeat migration is a no-op and reimport cannot restore a consumed remnant',()=>{
  const next=apply(stock());assert.throws(()=>apply(next),/já está unificado/);
  const batch={format:'chaparia-retalhos',version:1,batchId:'legacy-batch',source:'old.xlsx',records:[{code:'R1',material:'inox',thickness:6,width:100,length:200,quantity:1,location:'R1',notes:''}]};
  next.remnants['legacy-batch-R1']={...next.remnants.consumed,id:'legacy-batch-R1',importBatch:'legacy-batch'};
  assert.equal(prepareRemnantImport(batch,next).skipped,1);assert.equal(next.remnants['legacy-batch-R1'].quantity,0);
});
test('new inputs, imports, weights and product codes use 6.35 while carbon remains unchanged',()=>{
  assert.equal(canonicalThickness('inox',6),6.35);assert.equal(canonicalThickness('carbono',6),6);
  assert.equal(sheetId('inox',6),'inox-6_35');assert.equal(productCode({material:'inox',thickness:6}),'3.0011.010.1');
  assert.deepEqual(getMaterials(stock()).inox.thicknesses,[1.5,2,3,4,5,6.35]);
  const details=stockWeightDetails(stock());assert.equal(details.remnants.find(r=>r.id==='old').unitKg,25.4);
  assert.equal(stockWeightSummary(stock()).materials.find(m=>m.material==='inox').rows.filter(r=>r.thickness===6).length,0);
  const parsed=parseRemnantRows([{A:'Código',B:'Material',C:'Espessura (mm)',D:'Formato',E:'Comprimento (mm)',F:'Largura (mm)',H:'Qtd.'},{A:'INOX-9001',B:'Aço inox',C:6,D:'Retangular',E:1000,F:500,H:1}],'legacy.xlsx');
  assert.equal(parsed.batch.records[0].thickness,6.35);assert.match(parsed.batch.records[0].notes,/original 6 mm/);
});
test('a conflicting canonical identifier aborts without changing the original inventory',()=>{
  const state=stock();state.sheets['inox-6_35'].material='carbono';const before=structuredClone(state);
  assert.throws(()=>apply(state),/outro material/);assert.deepEqual(state,before);
});
