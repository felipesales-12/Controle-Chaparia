import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applyOperation, criticalSheets, purchaseText } from '../js/domain.js';
import { getMaterials, reorderPoint, orderInventory } from '../js/catalog.js';
import { pieceWeightKg, stockWeightSummary } from '../js/weights.js';
import { createWeightsWorkbook } from '../js/weights-excel.js';
let sequence=0;
const apply=(state,command)=>applyOperation(state,{...command,eventId:`catalog-event-${++sequence}`},{uid:'pcp',email:'pcp@example.com'},1700000000000);
const newMaterial={type:'material-add',id:'piso',name:'Chapa piso',density:7850};
const newThickness={type:'sheet-add',material:'piso',thickness:3,width:1500,length:3000,reorderPoint:5,location:'P-01'};
const setup=()=>apply(apply(initialState(),newMaterial),newThickness);
test('legacy data keeps its existing catalog and the default replenishment point of two',()=>{
 const old=initialState();assert.equal(Object.values(getMaterials(old)).flatMap(m=>m.thicknesses).length,14);assert.equal(reorderPoint(old.sheets['carbono-2']),2);assert.equal(criticalSheets(old.sheets).length,14);
 const original=structuredClone(old);getMaterials(old);assert.deepEqual(old,original);
});
test('new steel families and thicknesses are shared catalog records with audited zero initial balance',()=>{
 let state=setup();state=apply(state,{...newThickness,thickness:4.76});assert.equal(state.materials.piso.name,'Chapa piso');assert.equal(state.sheets['piso-3'].quantity,0);assert.deepEqual(getMaterials(state).piso.thicknesses,[3,4.76]);assert.equal(state.sheets['piso-3'].reorderPoint,5);assert.equal(Object.keys(state.movements).length,3);
 assert.throws(()=>apply(state,{...newMaterial,id:'duplicate',name:' CHÁPA   PISO '}),/Já existe/);assert.throws(()=>apply(state,newThickness),/já está cadastrada/);
});
test('configurable replenishment changes purchase alerts and supports zero as a threshold',()=>{
 let state=apply(setup(),{type:'sheet-in',id:'piso-3',quantity:4});assert.ok(criticalSheets(state.sheets).some(s=>s.id==='piso-3'));
 state=apply(state,{type:'sheet-edit',id:'piso-3',revision:2,width:1500,length:3000,location:'P-01',reorderPoint:3});assert.equal(criticalSheets(state.sheets).some(s=>s.id==='piso-3'),false);
 state=apply(state,{type:'sheet-out',id:'piso-3',quantity:1});assert.match(purchaseText(state.sheets,state),/Chapa piso 3mm — Restam 3 chapas \(ponto de reposição: 3/);
 state=apply(state,{type:'sheet-edit',id:'piso-3',revision:4,width:1500,length:3000,reorderPoint:0});assert.equal(criticalSheets(state.sheets).some(s=>s.id==='piso-3'),false);
 state=apply(state,{type:'sheet-out',id:'piso-3',quantity:3});assert.ok(criticalSheets(state.sheets).some(s=>s.id==='piso-3'));
 for(const reorderPoint of [-1,1.5,''])assert.throws(()=>apply(state,{type:'sheet-edit',id:'piso-3',width:1500,length:3000,reorderPoint}));
});
test('remnants use only active catalog pairs, including newly registered thicknesses',()=>{
 let state=setup();state=apply(state,{type:'remnant-add',id:'floor-scrap',material:'piso',thickness:3,width:500,length:1000,quantity:2,location:'R1'});
 assert.equal(state.remnants['floor-scrap'].material,'piso');assert.throws(()=>apply(state,{type:'remnant-add',id:'other',material:'piso',thickness:4.76,width:500,length:1000,quantity:1,location:'R1'}),/catálogo ativo/);
});
test('removal is blocked for available stock and stale forms, then archives without deleting audit records',()=>{
 let state=apply(setup(),{type:'sheet-in',id:'piso-3',quantity:1});assert.throws(()=>apply(state,{type:'sheet-remove',id:'piso-3',revision:2}),/Dê baixa/);
 state=apply(state,{type:'sheet-out',id:'piso-3',quantity:1});assert.throws(()=>apply(state,{type:'sheet-remove',id:'piso-3',revision:2}),/outro aparelho/);
 state=apply(state,{type:'remnant-add',id:'scrap',material:'piso',thickness:3,width:500,length:1000,quantity:1,location:'R1'});assert.throws(()=>apply(state,{type:'sheet-remove',id:'piso-3',revision:3}),/Dê baixa/);
 state=apply(state,{type:'remnant-consume',id:'scrap',revision:1});const events=Object.keys(state.movements).length;
 state=apply(state,{type:'sheet-remove',id:'piso-3',revision:3});assert.equal(state.sheets['piso-3'].active,false);assert.equal(state.remnants.scrap.quantity,0);assert.equal(Object.keys(state.movements).length,events+1);assert.deepEqual(getMaterials(state).piso.thicknesses,[]);assert.equal(criticalSheets(state.sheets).some(s=>s.id==='piso-3'),false);
 assert.throws(()=>apply(state,{type:'sheet-in',id:'piso-3',quantity:1}),/removida/);
 state=apply(state,newThickness);assert.equal(state.sheets['piso-3'].active,true);assert.equal(state.sheets['piso-3'].revision,5);assert.equal(state.remnants.scrap.quantity,0);
});
test('numeric ordering combines thickness and length without changing source arrays',()=>{
 const items=[{id:'a',material:'carbono',thickness:12.7,length:1000,width:500},{id:'b',material:'carbono',thickness:2,length:1000,width:500},{id:'c',material:'carbono',thickness:2,length:600,width:500},{id:'d',material:'carbono',thickness:3,length:600,width:500}];
 assert.deepEqual(orderInventory(items,'thickness-length-asc').map(r=>r.id),['c','b','d','a']);assert.deepEqual(orderInventory(items,'length-thickness-asc').map(r=>r.id),['c','d','b','a']);assert.deepEqual(orderInventory(items,'thickness-length-desc').map(r=>r.id),['a','d','b','c']);assert.deepEqual(items.map(r=>r.id),['a','b','c','d']);
});
test('custom density, labels and restock points reach weights and Excel exports',()=>{
 let state=apply(setup(),{type:'sheet-in',id:'piso-3',quantity:2});state=apply(state,{type:'remnant-add',id:'floor-scrap',material:'piso',thickness:3,width:500,length:1000,quantity:1,location:'R1'});
 assert.equal(pieceWeightKg(state.sheets['piso-3'],state),105.975);const group=stockWeightSummary(state).materials.find(m=>m.material==='piso');assert.equal(group.name,'Chapa piso');assert.ok(Math.abs(group.totalKg-223.725)<1e-8);
 const workbook=createWeightsWorkbook(state);const sheet=workbook.getWorksheet('Chapas inteiras');const row=sheet.getRows(9,15).find(r=>r.getCell(2).value==='Chapa piso');assert.ok(row);assert.equal(row.getCell(16).value,5);assert.equal(workbook.getWorksheet('Retalhos').getCell('B9').value,'Chapa piso');
});
test('an entirely archived catalog exports zero totals without circular summary formulas',()=>{
 let state=initialState();for(const id of Object.keys(state.sheets))state=apply(state,{type:'sheet-remove',id,revision:1});const summary=stockWeightSummary(state);assert.equal(summary.totalKg,0);assert.equal(summary.materials.flatMap(m=>m.rows).length,0);
 const workbook=createWeightsWorkbook(state);assert.equal(workbook.getWorksheet('Resumo').getCell('C11').formula,'0');
});
