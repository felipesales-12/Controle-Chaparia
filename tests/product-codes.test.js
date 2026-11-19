import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { PRODUCT_CODES, productCode, missingProductTypes } from '../js/product-codes.js';
import { initialState, applyOperation, prepareRemnantImport } from '../js/domain.js';
import { stockWeightDetails } from '../js/weights.js';
import { weightsExcelBuffer } from '../js/weights-excel.js';
import { assertWorkbookSequences } from './ooxml-structure.js';
const actor = {uid:'pcp',email:'pcp@example.com'};
const batch = () => ({format:'chaparia-retalhos',version:1,batchId:'test-photo-batch',source:'Test photos',ensureProductCatalog:true,records:[
  {code:'CAR-PHOTO-1',material:'carbono',thickness:12.7,width:400,length:500,quantity:1,location:'PHOTO-1',notes:''},
  {code:'CAR-PHOTO-2',material:'carbono',thickness:19.05,width:200,length:900,quantity:1,location:'PHOTO-2',notes:'Meia-lua; envelope retangular'}
]});
const apply = (data,command) => applyOperation(data,command,actor,1700000000000);
test('all 13 supplied product codes map to exact material and thickness pairs',()=>{
  assert.deepEqual(PRODUCT_CODES.map(row=>[row.material,row.thickness,row.code]),[
    ['carbono',2,'3.0011.020.2'],['carbono',3,'3.0011.020.1'],['carbono',4.76,'3.0011.020.4'],['carbono',6.35,'3.0011.020.6'],['carbono',7.94,'3.0011.020.7'],['carbono',9.53,'3.0011.020.10'],['carbono',12.7,'3.0011.020.11'],['carbono',19.05,'3.0011.020.8'],
    ['inox',1.5,'3.0011.010.4'],['inox',2,'3.0011.010.11'],['inox',3,'3.0011.010.2'],['inox',5,'3.0011.010.20'],['inox',6.35,'3.0011.010.1']
  ]);
  assert.equal(productCode({material:'carbono',thickness:9.35}),'');
  assert.equal(productCode({material:'inox',thickness:6}),'3.0011.010.1');
  assert.equal(productCode({material:'inox',thickness:'6.35'}),'3.0011.010.1');
  assert.equal(productCode({material:'piso',thickness:2}),'');
});
test('missing coded types are added with zero stock while legacy balances and metadata remain intact',()=>{
  const original=initialState();original.sheets['inox-6_35'].quantity=5;original.sheets['inox-6_35'].location='I-6';original.sheets['carbono-9_35'].quantity=7;
  assert.deepEqual(missingProductTypes(original).map(r=>r.thickness),[9.53]);
  const next=apply(original,{type:'catalog-product-codes',eventId:'catalog'});
  for(const [id,sheet] of Object.entries(original.sheets))assert.deepEqual(next.sheets[id],sheet);
  assert.equal(next.sheets['carbono-9_53'].quantity,0);assert.equal(next.sheets['inox-6_35'].quantity,5);
  assert.equal(Object.keys(original.sheets).length,14);assert.equal(next.movements.catalog.after.codes.length,13);
  assert.equal(next.movements.catalog.actor.uid,'pcp');
  assert.throws(()=>apply(next,{type:'catalog-product-codes',eventId:'again'}),/já estão cadastradas/);
});
test('catalog update respects archived thicknesses and preserves tasks and remnants',()=>{
  const state=initialState();state.sheets['carbono-2'].active=false;state.tasks={legacy:{id:'legacy',title:'Atividade'}};state.remnants={legacy:{id:'legacy',quantity:0}};
  const next=apply(state,{type:'catalog-product-codes',eventId:'catalog'});
  assert.equal(next.sheets['carbono-2'].active,false);assert.deepEqual(next.tasks,state.tasks);assert.deepEqual(next.remnants,state.remnants);
});
test('prepared photo batch adds catalog types and each remnant in one audited operation',()=>{
  const original=initialState(),plan=prepareRemnantImport(batch(),original);
  assert.equal(plan.additions.length,1);assert.equal(Object.keys(original.sheets).length,14);
  const state=apply(original,{type:'remnant-import',batch:batch(),eventId:'photos'});
  assert.equal(Object.keys(state.remnants).length,2);assert.equal(Object.keys(state.sheets).length,15);
  assert.equal(Object.keys(state.movements).length,4);assert.equal(state.movements.photos.after.productCodes.length,13);
  const details=stockWeightDetails(state);
  assert.equal(details.remnants.find(r=>r.thickness===19.05).productCode,'3.0011.020.8');
  assert.equal(details.remnants.find(r=>r.thickness===12.7).productCode,'3.0011.020.11');
});
test('repeat photo import cannot restore consumed pieces or create duplicate catalog entries',()=>{
  let state=apply(initialState(),{type:'remnant-import',batch:batch(),eventId:'photos'});
  state=apply(state,{type:'remnant-consume',id:'test-photo-batch-CAR-PHOTO-2',revision:1,eventId:'consume'});
  assert.equal(prepareRemnantImport(batch(),state).skipped,2);
  assert.throws(()=>apply(state,{type:'remnant-import',batch:batch(),eventId:'again'}),/já foram importados/);
  assert.equal(state.remnants['test-photo-batch-CAR-PHOTO-2'].quantity,0);
});
test('styled Excel preserves codes as text in summary and both stock categories with valid XML',async()=>{
  const state=apply(initialState(),{type:'remnant-import',batch:batch(),eventId:'photos'});
  const buffer=await weightsExcelBuffer(state,{generatedAt:new Date('2026-11-19T12:00:00Z'),email:actor.email});
  await assertWorkbookSequences(buffer);const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);
  const remnant=book.getWorksheet('Retalhos');assert.equal(remnant.getCell('P8').value,'Código do material');
  assert.equal(remnant.getCell('P9').value,'3.0011.020.11');assert.equal(remnant.getCell('P10').value,'3.0011.020.8');
  const sheets=book.getWorksheet('Chapas inteiras');assert.equal(sheets.getCell('R8').value,'Código do material');assert.equal(sheets.getCell('R9').value,'3.0011.020.2');
  assert.equal(book.getWorksheet('Resumo').getCell('H10').value,'Código do material');assert.equal(book.getWorksheet('Resumo').getCell('H11').value,'3.0011.020.2');
  assert.equal(remnant.getCell('P9').type,ExcelJS.ValueType.String);
  assert.equal(remnant.getCell('G9').formula,'C9*D9*E9*I9/1000000000');
});
