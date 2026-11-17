import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createWeightsWorkbook, weightsExcelBuffer } from '../js/weights-excel.js';
import { initialState } from '../js/domain.js';
import { stockWeightDetails, stockWeightSummary } from '../js/weights.js';
const meta={generatedAt:new Date('2026-11-17T12:15:00Z'),email:'pcp@example.com'};
function stock(){
 const data=initialState();data.sheets['carbono-2'].quantity=2;data.sheets['carbono-2'].location='A-01';
 data.sheets['inox-2'].quantity=1;
 data.remnants={
   active:{id:'active',material:'carbono',thickness:2,width:500,length:1000,quantity:3,location:'R-01',notes:'Corte em L',parentId:'parent',createdAt:1763377200000,revision:2},
   consumed:{id:'consumed',material:'inox',thickness:3,width:800,length:1200,quantity:0,location:'R-02',notes:'=HYPERLINK("https://example.com")',revision:3}
 };
 return data;
}
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8);
test('per-record weights retain metadata, unit mass and zero-stock records',()=>{
 const data=stock(),original=structuredClone(data),details=stockWeightDetails(data);
 const whole=details.sheets.find(r=>r.id==='carbono-2');close(whole.unitKg,70.65);close(whole.totalKg,141.3);
 assert.equal(whole.quantity,2);assert.equal(whole.location,'A-01');
 const consumed=details.remnants.find(r=>r.id==='consumed');assert.equal(consumed.status,'Consumido');assert.equal(consumed.totalKg,0);assert.ok(consumed.unitKg>0);
 const combined=[...details.sheets,...details.remnants].reduce((sum,r)=>sum+r.totalKg,0);close(combined,stockWeightSummary(data).totalKg);assert.deepEqual(data,original);
});
test('Excel report separates stock types and preserves the full inventory fields',async()=>{
 const buffer=await weightsExcelBuffer(stock(),meta);assert.equal(Buffer.from(buffer).subarray(0,2).toString(),'PK');
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer);
 assert.deepEqual(workbook.worksheets.map(s=>s.name),['Resumo','Chapas inteiras','Retalhos','Critérios']);
 const sheets=workbook.getWorksheet('Chapas inteiras'),remnants=workbook.getWorksheet('Retalhos');
 assert.equal(sheets.getTable('TabelaChapas').table.tableRef,'A8:Q22');
 assert.equal(remnants.getTable('TabelaRetalhos').table.tableRef,'A8:O10');
 assert.equal(sheets.getCell('A9').value,'carbono-2');assert.equal(sheets.getCell('F9').value,2);assert.equal(sheets.getCell('J9').value,'A-01');
 close(sheets.getCell('G9').result,70.65);close(sheets.getCell('H9').result,141.3);
 assert.equal(remnants.getCell('K9').value,'Corte em L');assert.equal(remnants.getCell('M9').value,'parent');assert.equal(remnants.getCell('O9').value,2);assert.ok(remnants.getCell('N9').value);
 assert.equal(remnants.getCell('L10').value,'Consumido');assert.equal(remnants.getCell('K10').type,ExcelJS.ValueType.String);assert.match(remnants.getCell('K10').value,/^=HYPERLINK/);
});
test('workbook has numeric formulas with cached results, formatted styles, filters and fixed print headers',async()=>{
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await weightsExcelBuffer(stock(),meta));
 const overview=workbook.getWorksheet('Resumo'),sheets=workbook.getWorksheet('Chapas inteiras');
 assert.equal(sheets.getCell('G9').formula,'C9*D9*E9*I9/1000000000');assert.equal(sheets.getCell('H9').formula,'F9*G9');
 assert.match(overview.getCell('D11').formula,/SUMIFS/);close(overview.getCell('G11').result,164.85);close(overview.getCell('E7').result,236.85);
 assert.equal(sheets.getCell('H23').formula,'SUBTOTAL(109,H9:H22)');assert.match(sheets.getCell('G9').numFmt,/kg/);
 assert.equal(sheets.getCell('A1').fill.fgColor.argb,'FF142F3E');assert.equal(sheets.getRow(8).getCell(1).font.bold,true);
 assert.equal(sheets.views[0].ySplit,8);assert.equal(sheets.views[0].xSplit,3);assert.equal(sheets.pageSetup.orientation,'landscape');assert.equal(sheets.pageSetup.printTitlesRow,'8:8');assert.equal(sheets.pageSetup.printTitlesColumn,'A:C');assert.equal(sheets.pageSetup.fitToWidth,2);assert.equal(sheets.getColumn(11).width,52);
 assert.equal(sheets.getTable('TabelaChapas').table.columns.every(c=>c.filterButton),true);
});
test('empty and zero-stock reports serialize without phantom records or invalid totals',async()=>{
 for(const data of [{},initialState()]){
   const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await weightsExcelBuffer(data,meta));
   assert.match(workbook.getWorksheet('Retalhos').getCell('A10').value,/Nenhum registro/);
   assert.equal(workbook.getWorksheet('Retalhos').getCell('H12').value,0);
   const overview=workbook.getWorksheet('Resumo');assert.equal(overview.getTable('ResumoPorEspessura').table.tableRef,'A10:G24');
   assert.equal(overview.getCell('E7').result??0,0);
 }
});
test('report identifies the emission time, operator and offline snapshot without modifying stock',()=>{
 const data=stock(),original=structuredClone(data);const workbook=createWeightsWorkbook(data,{...meta,connected:false});
 assert.match(workbook.getWorksheet('Resumo').getCell('A3').value,/17\/11\/2026,? 09:15/);
 assert.match(workbook.getWorksheet('Resumo').getCell('A3').value,/pcp@example.com/);
 assert.match(workbook.getWorksheet('Resumo').getCell('A4').value,/SEM CONEXÃO/);assert.deepEqual(data,original);
});
