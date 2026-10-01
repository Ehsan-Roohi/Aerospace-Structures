import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

// Resolve the bundled artifact runtime through the conversation-local junction.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qa = path.join(root, 'tmp/hw2');
const requireRuntime = createRequire(path.join(qa, 'package.json'));
const { Workbook, SpreadsheetFile } = await import(pathToFileURL(requireRuntime.resolve('@oai/artifact-tool')));
const out = path.join(root, 'assignments/homework-02');
await fs.mkdir(out, { recursive: true });
await fs.mkdir(qa, { recursive: true });
const wb = Workbook.create();
const wing = wb.worksheets.add('WingLoads');
const controls = wb.worksheets.add('Controls');
const paper = wb.worksheets.add('Paper');
const font = { name: 'Times New Roman', size: 12, color: '#000000' };

function put(sheet, cell, value) { sheet.getRange(cell).values = [[value]]; }
function text(sheet, row, value) { put(sheet, `A${row}`, value); }
function header(sheet, address, labels) {
  const r = sheet.getRange(address);
  r.values = [labels];
  r.format = { fill: '#E6E6E6', font: { ...font, bold: true }, wrapText: true, verticalAlignment: 'center', horizontalAlignment: 'center', rowHeight: 44 };
}
function blank(sheet, address) {
  const r = sheet.getRange(address);
  r.format.fill = '#F2F2F2';
  r.format.borders = { preset: 'outside', style: 'thin', color: '#888888' };
}
for (const [sheet, rows, cols] of [[wing,137,'L'],[controls,53,'L'],[paper,25,'F']]) {
  sheet.showGridLines = false;
  sheet.getRange(`A1:${cols}${rows}`).format = { font, rowHeight: 22, verticalAlignment: 'center', columnWidth: 16 };
  sheet.getRange(`A2:${cols}2`).format.font = { ...font, size: 17, bold: true };
  sheet.getRange(`A2:${cols}2`).format.borders = { bottom: { style: 'thin', color: '#000000' } };
}

text(wing,2,'Homework 2: distributed wing loads');
text(wing,3,'Complete the gray calculation cells. See the handout Q2 and Notebook 1, section 7A-3b.');
wing.getRange('A5:B13').values = [
  ['Density (kg/m^3)',1.225],['Speed (m/s)',15],['Semispan (m)',0.45],
  ['Root chord (m)',0.16],['Tip chord (m)',0.10],['Control starts (m)',0.30],
  ['Lift-loss coefficient',0.30],['Drag coefficient',0.10],['Intervals N',90],
];
put(wing,'A14','q (Pa): calculate');
blank(wing,'B14');
wing.getRange('B5:B12').setNumberFormat('0.000');
wing.getRange('B13').setNumberFormat('0');
wing.getRange('B14').setNumberFormat('0.000000');
wing.getRange('A5:A14').format.columnWidth = 26;
wing.getRange('D4:G8').values = [
  ['Result','Excel','MATLAB N=90','Difference'],
  ['Delta Fz (N)',null,null,null],['Delta Fx (N)',null,null,null],
  ['Delta Mx (N m)',null,null,null],['Delta Mz (N m)',null,null,null],
];
wing.getRange('D4:G4').format.font = { ...font, bold: true };
blank(wing,'E5:G8'); wing.getRange('E5:G8').setNumberFormat('0.00000000');
put(wing,'D10','Difference = Excel minus MATLAB, using the same 91 stations.');
put(wing,'D12','Teaching model: these inputs are not measurements of Lilienthal’s glider.');
put(wing,'D14','Body axes: x forward, y right, z down. M is about the CG.');
text(wing,16,'B14: enter =0.5*B5*B6^2. Use absolute references to shared inputs when filling down.');
text(wing,17,'A and B are supplied. Fill C21:H111. Interval contributions start in row 22, not row 21.');
text(wing,18,'There are 91 stations and 90 intervals. Row 111 is the tip at s = 0.450 m.');
header(wing,'A20:L20',['Station i','s (m)','c (m)','g (-)','Delta fz (N/m)','Delta fx (N/m)','s Delta fz (N)','-s Delta fx (N)','Interval Fz (N)','Interval Fx (N)','Interval Mx (N m)','Interval Mz (N m)']);
wing.getRange('A21:B111').values = Array.from({length:91},(_,i)=>[i,Number((i*0.005).toFixed(6))]);
wing.getRange('A21:A111').setNumberFormat('0');
wing.getRange('B21:D111').setNumberFormat('0.000000');
wing.getRange('E21:L111').setNumberFormat('0.00000000');
blank(wing,'C21:H111'); blank(wing,'I22:L111');
wing.getRange('I21:L21').values = [['n.a.','n.a.','n.a.','n.a.']];
text(wing,113,'Excel formulas to enter (shown as text; the handout explains each step)');
const formulaHelp = [
  ['B14','=0.5*B5*B6^2'],
  ['C21','=$B$8+($B$9-$B$8)*B21/$B$7'],
  ['D21','=MAX(0,(B21-$B$10)/($B$7-$B$10))'],
  ['E21','=$B$14*C21*$B$11*D21'],
  ['F21','=-$B$14*C21*$B$12*D21'],
  ['G21','=B21*E21'],['H21','=-B21*F21'],
  ['I22','=(B22-B21)*(E22+E21)/2'],['J22','=(B22-B21)*(F22+F21)/2'],
  ['K22','=(B22-B21)*(G22+G21)/2'],['L22','=(B22-B21)*(H22+H21)/2'],
  ['E5','=SUM(I22:I111)'],['E6','=SUM(J22:J111)'],['E7','=SUM(K22:K111)'],['E8','=SUM(L22:L111)'],
];
for(let i=0;i<formulaHelp.length;i++) { put(wing,`A${115+i}`,formulaHelp[i][0]); put(wing,`B${115+i}`,"'"+formulaHelp[i][1]); }
put(wing,'F115','Fill each C21:H21 formula down through row 111.');
put(wing,'F117','Fill each I22:L22 formula down through row 111.');
put(wing,'F119','Enter E5:E8 after completing all interval contributions.');
put(wing,'F121','Paste MATLAB N=90 results in F5:F8. Enter =E5-F5 in G5 and fill down.');
put(wing,'F123','Change B6 to 10, 15 and 20. Record each result in your report.');
put(wing,'F125','Restore B6 to 15. N=180 is required in MATLAB only.');
text(wing,132,'Positive Delta fz means a reduction of upward lift, not downward total lift.');
text(wing,134,'The interval columns are contributions from the preceding station to the current station.');
text(wing,136,'Keep full precision in cells. Round only the reported results.');
wing.freezePanes.freezeRows(20);

text(controls,2,'Homework 2: concentrated forces and control mixing');
text(controls,3,'Gray cells are student calculations. All given forces are increments. Distances are measured from the CG.');
text(controls,5,'Q3. Side force: use M = r cross F (Notebook 1, 7A-3b).');
header(controls,'A6:J6',['Case','x (m)','y (m)','z (m)','Fx (N)','Fy (N)','Fz (N)','Mx (N m)','My (N m)','Mz (N m)']);
controls.getRange('A7:G9').values = [['A',0,.35,0,0,2,0],['B',-.15,.35,.04,0,2,0],['C',-.15,.35,-.04,0,2,0]];
blank(controls,'H7:J9'); controls.getRange('B7:J9').setNumberFormat('0.0000');
text(controls,11,'Enter H7 = C7*G7-D7*F7, I7 = D7*E7-B7*G7, J7 = B7*F7-C7*E7. Fill down to row 9.');
text(controls,13,'Q4. Elevon mixer (Notebook 1, 7A-11). Positive surface angle is trailing-edge up.');
controls.getRange('A14:B18').values = [['Limit (deg)',15],['k (N/deg)',.05],['x left (m)',-.15],['y left (m)',-.35],['z left (m)',0]];
controls.getRange('D16:E18').values = [['x right (m)',-.15],['y right (m)',.35],['z right (m)',0]];
controls.getRange('B14:B18').setNumberFormat('0.000'); controls.getRange('E16:E18').setNumberFormat('0.000');
put(controls,'D14','Delta Fz = k times the clipped surface angle. Forces Fx and Fy are zero in this model.');
text(controls,20,'Calculate requested angles, clip to the limit, calculate the two forces, then add the two moment vectors.');
header(controls,'A21:L21',['Case','P (deg)','R (deg)','Left req. (deg)','Right req. (deg)','Left limited (deg)','Right limited (deg)','Delta Fz left (N)','Delta Fz right (N)','Total Mx (N m)','Total My (N m)','Total Mz (N m)']);
controls.getRange('A22:C25').values = [['Pitch',8,0],['Roll',0,5],['Combined',8,5],['Saturated',12,8]];
blank(controls,'D22:L25'); controls.getRange('B22:L25').setNumberFormat('0.0000');
text(controls,27,'Start D22 = B22-C22, E22 = B22+C22, F22 = MAX(-$B$14,MIN($B$14,D22)); use E22 for G22.');
text(controls,28,'Use the handout to finish H:L. Compute Mx and My before and after clipping in MATLAB.');
text(controls,29,'Q5. H is the moment about the control-surface pivot (Notebook 1, 7A-1, 7A-5 and 7A-14).');
put(controls,'A30','H (N m)'); put(controls,'B30',.12); controls.getRange('B30').setNumberFormat('0.000');
header(controls,'A33:C33',['Case','Perpendicular arm (m)','Cable tension (N)']);
controls.getRange('A34:B36').values = [['1',.010],['2',.020],['3',.030]];
controls.getRange('B34:B36').setNumberFormat('0.000'); blank(controls,'C34:C36');controls.getRange('C34:C36').setNumberFormat('0.000');
text(controls,38,'Enter C34 = $B$30/B34 and fill to C36. Sketch the pivot, force line and perpendicular distance.');
text(controls,40,'M about the aircraft CG and H about the control-surface pivot are different moments.');
text(controls,42,'Input source for Q3–Q5: prescribed teaching cases in the Homework 2 handout.');
text(controls,43,'Q4 comparison: requested moments and commands recovered from the limited surface angles.');
header(controls,'A44:F44',['Case','Requested Mx (N m)','Requested My (N m)','Requested Mz (N m)','Recovered P (deg)','Recovered R (deg)']);
controls.getRange('A45:A48').values = [['Pitch'],['Roll'],['Combined'],['Saturated']];
blank(controls,'B45:F48'); controls.getRange('B45:F48').setNumberFormat('0.0000');
text(controls,50,'Rows 45–48 correspond to rows 22–25. Recovered P = (left + right)/2; R = (right - left)/2.');
text(controls,52,'Compare requested and limited moments. Explain how clipping one elevon changes both channels.');
controls.getRange('A1:A53').format.columnWidth=20;

text(paper,2,'Homework 2: readings from the Lilienthal paper');
text(paper,3,'Q1. Read the solid markers at 6, 10 and 14 degrees. Values are approximate graph readings.');
text(paper,4,'Fig. 11: roll coefficient c_l. Fig. 12: yaw coefficient c_n. Circles: spoileron 90 deg. Crosses: wing warping.');
text(paper,5,'Use the paper’s aerodynamic axes and coefficient definitions. Do not treat these as dimensional body-axis moments.');
header(paper,'A6:F6',['Alpha (deg)','Mechanism','Roll c_l (-)','Yaw c_n (-)','Reading tolerance','Figure and curve notes']);
paper.getRange('A7:B12').values = [[6,'Wing warping'],[10,'Wing warping'],[14,'Wing warping'],[6,'Spoileron 90 deg'],[10,'Spoileron 90 deg'],[14,'Spoileron 90 deg']];
blank(paper,'C7:F12');paper.getRange('C7:D12').setNumberFormat('0.0000');
paper.getRange('A1:A25').format.columnWidth=18;paper.getRange('B1:B25').format.columnWidth=23;
paper.getRange('C1:D25').format.columnWidth=19;paper.getRange('E1:E25').format.columnWidth=26;paper.getRange('F1:F25').format.columnWidth=47;
text(paper,14,'Write separate roll/yaw reading tolerances in column E if the graph scales require different tolerances.');
text(paper,16,'Reading notes: identify the marker rather than the dashed trend line; use one consistent interpolation method.');
text(paper,18,'Source: Raffel et al., Lilienthal flight controls, Section II.C, Figs. 11–12.');
text(paper,19,'https://elib.dlr.de/191143/1/JoA_Paper_Lilienthal_Flight_Controls.pdf');
text(paper,21,'Add a labeled aircraft image and your comparison paragraph to the report, not to these raw-data cells.');
text(paper,23,'Notebook 1: 7A-3, 7A-3a and 7A-3b explain Lilienthal; 7A-7–7A-13 compare modern examples.');

wb.recalculate();
const inspect = await wb.inspect({ kind:'table', range:'WingLoads!A4:G14', include:'values,formulas', tableMaxRows:11, tableMaxCols:7, maxChars:2500 });
console.log(inspect.ndjson);
const errors = await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20}});
console.log(errors.ndjson);
for (const [name,range,suffix] of [['WingLoads','A1:L24','top'],['WingLoads','A109:L136','instructions'],['Controls','A1:L52','all'],['Paper','A1:F23','all']]) {
  if (process.env.HW2_RENDER_SHEETS && !process.env.HW2_RENDER_SHEETS.split(',').includes(name)) continue;
  const blob=await wb.render({sheetName:name,range,scale:1.4,format:'png'});
  await fs.writeFile(path.join(qa,`${name}_${suffix}.png`),new Uint8Array(await blob.arrayBuffer()));
}
const book = await SpreadsheetFile.exportXlsx(wb);
await book.save(path.join(out,'MIE446_HW2_Excel_Starter.xlsx'));
const sidecar=path.join(out,'MIE446_HW2_Excel_Starter.xlsx.inspect.ndjson');
try { await fs.rename(sidecar,path.join(qa,'Excel_Starter.inspect.ndjson')); }
catch (error) { if (error.code!=='ENOENT') throw error; }
console.log('Exported the student template; assessed calculations remain blank.');
