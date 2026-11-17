import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { SaxesParser } from 'saxes';

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
// ECMA-376 / SpreadsheetML: CT_Worksheet and CT_SheetPr child sequences.
// These are file-format constraints, independent of how the report is built.
const SHEET_SEQUENCE = ['sheetPr','dimension','sheetViews','sheetFormatPr','cols','sheetData','sheetCalcPr','sheetProtection','protectedRanges','scenarios','autoFilter','sortState','dataConsolidate','customSheetViews','mergeCells','phoneticPr','conditionalFormatting','dataValidations','hyperlinks','printOptions','pageMargins','pageSetup','headerFooter','rowBreaks','colBreaks','customProperties','cellWatches','ignoredErrors','smartTags','drawing','legacyDrawing','legacyDrawingHF','picture','oleObjects','controls','webPublishItems','tableParts','extLst'];
const PROPERTIES_SEQUENCE = ['tabColor','outlinePr','pageSetUpPr'];
function checkSequence(children, expected, context) {
  let previous = -1;
  for (const child of children) {
    const rank = expected.indexOf(child);
    assert.notEqual(rank, -1, `${context}: elemento desconhecido ${child}`);
    assert.ok(rank >= previous, `${context}: ${child} está fora da ordem definida no SpreadsheetML`);
    previous = rank;
  }
}
export function assertWorksheetSequences(xml, filename = 'worksheet') {
  const path = [], worksheetChildren = [], propertyChildren = [];
  const parser = new SaxesParser({ xmlns: true });
  parser.on('opentag', node => {
    if (node.uri === MAIN) {
      if (path.length === 1 && path[0] === 'worksheet') worksheetChildren.push(node.local);
      if (path.length === 2 && path[1] === 'sheetPr') propertyChildren.push(node.local);
    }
    path.push(node.local);
  });
  parser.on('closetag', () => path.pop());
  parser.write(xml).close();
  checkSequence(worksheetChildren, SHEET_SEQUENCE, filename);
  checkSequence(propertyChildren, PROPERTIES_SEQUENCE, `${filename}/sheetPr`);
  assert.equal(worksheetChildren.filter(name => name === 'sheetData').length, 1, `${filename}: sheetData deve existir uma vez`);
}
export async function assertWorkbookSequences(buffer) {
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
  const worksheets = zip.file(/^xl\/worksheets\/sheet\d+\.xml$/);
  assert.equal(worksheets.length, 4, 'O relatório deve conter quatro abas');
  for (const worksheet of worksheets) assertWorksheetSequences(await worksheet.async('string'), worksheet.name);
}
