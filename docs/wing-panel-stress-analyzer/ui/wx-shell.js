/* Wing AeroStruct UI shell: compact command bar (File, Aerodynamics, Structure & Stress, View, Help), one
 * anchored input panel at a time, and a slim result strip (Model, Stress, Displacement, More results).
 * UI and interaction only. It moves the page's own controls, so their listeners, validation and confirmation dialogs are
 * unchanged; it never copies an input, never edits study data and never starts a solver except through the page's own
 * buttons (Solve Aerodynamics, Apply aerodynamic loads to structure, Solve Structure / Stress, Auto-solve).
 * Hooks used: WingLabUI.shell (workspace, select, renderPM, renderInputs, discardGeometryDraft, cancelLoadDraft,
 * gateOpen); this file sets WingLabUI.shell.onShowInputs, .reveal and .addStructureSubgroup. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v; else if (k === 'html') n.innerHTML = v; else n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids) if (k != null) n.append(k);
    return n;
  };
  const app = $('#app'), ui = window.WingLabUI, hooks = ui && ui.shell;
  const pw = hooks && hooks.workspace && hooks.workspace();
  const bar = $('#app > header.bar'), side = $('#wingSide');
  const tools = pw && pw.tools;
  const need = {
    app, ui, hooks, pw, bar, side, tools, brand: bar && $(':scope > .brand', bar), runBtn: $('#runBtn'), stateChip: $('#stateChip'),
    wlStatus: $('.wl-status'), aeroHost: $('#wingAeroPanel'), wlGeometry: $('#wlGeometry'), wlStructure: $('#wlStructure'),
    form: $('#wingStructureForm'), wlLoads: $('#wlLoads'), wlInventory: $('#wlInventory'), wlFiles: $('#wlFiles'), pm: $('#pm'), tree: $('#tree'),
    viewBody: $('#wingViewPanel .wl-vbody'), help: $('#wingInputHelp'), openBtn: tools && $('[data-wing-action="open-json"]', tools),
    saveBtn: tools && $('[data-wing-action="save-json"]', tools), clearBtn: tools && $('[data-wing-action="clear"]', tools),
    autoLabel: $('#wingAutoSolve') && $('#wingAutoSolve').closest('label'), partEditor: $('#wingPartEditor'),
  };
  const missing = Object.entries(need).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) { console.warn('Wing AeroStruct UI shell not applied (the previous layout stays); missing:', missing.join(', ')); return; }
  const { brand, runBtn, wlStatus, aeroHost, wlGeometry, wlStructure, form, wlLoads, wlInventory, wlFiles, viewBody, help, openBtn, saveBtn, clearBtn, autoLabel, partEditor } = need;
  const helpSummary = $(':scope > summary', help), helpBody = $(':scope > .wing-help-content', help);
  if (!helpSummary || !helpBody) { console.warn('Wing AeroStruct UI shell not applied: Help menu not found.'); return; }
  // Resolve every control before anything is re-parented: a node inside a detached container is invisible to queries.
  const example = $('#wgCourseExample'), dimensions = $('.wing-view-dimensions', helpBody), refineInput = $('#wingRefineTorsion');

  const parking = el('div', { id: 'wxParking', hidden: true, 'aria-hidden': 'true' });
  app.append(parking);
  const park = (...nodes) => nodes.forEach((n) => n && parking.append(n));
  const add = (parent, ...kids) => { for (const k of kids) if (k) parent.append(k); return parent; };
  const cap = (text) => el('p', { class: 'wx-cap', text });
  const row = (...kids) => el('div', { class: 'wx-row' }, ...kids);
  const sep = () => el('span', { class: 'wx-sep', 'aria-hidden': 'true' });
  const setLabel = (details, text) => { const s = $(':scope > summary', details); if (!s) return; const t = [...s.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()); if (t) t.textContent = text + ' '; else s.prepend(document.createTextNode(text + ' ')); };
  const subgroup = (id, title, badge = '') => {
    const d = el('details', { class: 'wl-acc wx-sub', id }, el('summary', {}, title + ' ', badge ? el('span', { class: 'wl-badge', text: badge }) : null));
    const body = el('div', { class: 'wl-acc-body' }); d.append(body); return { d, body };
  };
  const topButton = (id, label, controls) => el('button', { type: 'button', class: 'wx-top', id, 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': controls }, el('span', { text: label }));

  // ---------------------------------------------------------------- command bar
  const plotButtons = $$('[data-plot]', bar), moreSelect = $('#wingMoreResults');
  const learnBtn = $('#learnBtn'), oldGroups = $$(':scope > .group', bar), wlRun = $(':scope > .wl-run', bar);
  const fileBtn = topButton('wxFileBtn', 'File', 'wxFileMenu');
  const aeroBtn = topButton('wxAeroBtn', 'Aerodynamics', 'wingSide'), structBtn = topButton('wxStructBtn', 'Structure & Stress', 'wingSide');
  const aeroDot = el('span', { class: 'wx-dot', 'aria-hidden': 'true' }), structDot = el('span', { class: 'wx-dot', 'aria-hidden': 'true' });
  aeroBtn.append(aeroDot); structBtn.append(structDot);
  const aeroDotText = el('span', { class: 'wx-sr', id: 'wxAeroDotText' }), structDotText = el('span', { class: 'wx-sr', id: 'wxStructDotText' });
  aeroBtn.append(aeroDotText); structBtn.append(structDotText);
  const viewBtn = topButton('wxViewBtn', 'View', 'wxViewMenu');
  openBtn.className = 'wx-quick'; openBtn.innerHTML = 'Open<span class="wx-long">JSON</span>'; openBtn.setAttribute('aria-label', 'Open JSON');
  openBtn.title = 'Open a saved study file (.json). You review it before it replaces the inputs on screen.';
  saveBtn.className = 'wx-quick'; saveBtn.innerHTML = 'Save<span class="wx-long">JSON</span>'; saveBtn.setAttribute('aria-label', 'Save JSON');
  saveBtn.title = 'Save the inputs on screen as a study file (.json).';
  helpSummary.className = ''; helpSummary.textContent = 'Help'; helpSummary.setAttribute('aria-haspopup', 'dialog');
  const menubar = el('div', { class: 'wx-menubar', role: 'group', 'aria-label': 'Main commands' }, fileBtn, sep(), aeroBtn, structBtn, sep(), viewBtn, help);
  const historyTools = $('.wing-history-tools', tools);
  if (historyTools) historyTools.removeAttribute('style');
  const barEnd = el('div', { class: 'wx-bar-end' }, historyTools);
  bar.classList.add('wx-bar');

  // ---------------------------------------------------------------- File menu (single location for study files and exports)
  const fileMenu = el('div', { id: 'wxFileMenu', class: 'wx-menu', role: 'dialog', 'aria-label': 'File', hidden: true });
  clearBtn.className = 'btn wx-danger'; clearBtn.removeAttribute('style'); clearBtn.textContent = 'New / Clear…';
  if (example) example.textContent = 'Open the course example wing…';
  const printButtons = ['#wingDownloadSTL', '#wingDownloadDXF', '#wingDownloadSTEP'].map((s) => $(s)).filter(Boolean);
  const symmetry = $('#wingFullSymmetric') && $('#wingFullSymmetric').closest('label'), symmetryNote = $('#wingSymmetryNote');
  const openSTL = $('#wingOpenSTL'), stlInput = openSTL && $('input[type="file"][accept=".stl"]', openSTL.parentElement);
  const stlPanel = openSTL && [...openSTL.parentElement.children].find((n) => n.tagName === 'DIV' && n.classList.contains('wing-print-dialog'));
  if (stlPanel) document.body.append(stlPanel);   // a fixed dialog must not live inside a closed menu
  if (openSTL) openSTL.textContent = 'Open STL reference…';
  setLabel(wlFiles, 'Design parameters, paste & share link');
  add(fileMenu,
    cap('Study files'), row(openBtn, saveBtn), row(clearBtn, example),
    printButtons.length ? cap('Export for 3-D printing') : null, printButtons.length ? row(...printButtons) : null,
    openSTL ? cap('Reference geometry (view only)') : null, openSTL ? row(openSTL, stlInput) : null,
    openSTL ? el('p', { class: 'note', text: 'Shows an STL surface in the view for comparison. It does not change the study and computes no stress.' }) : null,
    wlFiles,
  );

  // ---------------------------------------------------------------- View menu (display only; camera buttons stay on the model)
  const viewMenu = el('div', { id: 'wxViewMenu', class: 'wx-menu', role: 'dialog', 'aria-label': 'View', hidden: true });
  const zoomRow = $('#zoomLabel') && $('#zoomLabel').parentElement;
  const anatomyRow = $('[data-anatomy="assembled"]', viewBody) && $('[data-anatomy="assembled"]', viewBody).closest('.hud-row');
  const cameraRow = $$('.hud-row', viewBody).find((r) => r.querySelector('[data-view]'));   // duplicate of the camera buttons on the model
  const explodeRow = $('#explodeIn') && $('#explodeIn').closest('.hud-row');
  const resultRow = $('#defBtn') && $('#defBtn').closest('.hud-row');
  const defBtn = $('#defBtn'), scaleLabel = $('#scaleIn') && $('#scaleIn').closest('label');
  const contour = $('#wingContourOptions');
  if (dimensions) setLabel(dimensions, 'Scale bar & dimensions');
  add(viewMenu,
    cap('Wing symmetry'), symmetry ? row(symmetry, symmetryNote) : null,
    cap('Zoom'), zoomRow, cap('Show'), anatomyRow, cap('Display'), row($('#xrayBtn'), $('#shearCentreBtn')),
    cap('Explode & clip'), explodeRow, contour, dimensions,
  );

  // ---------------------------------------------------------------- Help (teaching material; lessons open beside it)
  const lessonButtons = $$('[data-wing-lesson]', tools);
  if (learnBtn) { learnBtn.className = 'btn primary'; learnBtn.textContent = 'Guided lesson'; }
  const aeroIntro = $(':scope > .wae > p.note', aeroHost);
  const helpTop = el('div', { class: 'wx-help-top' }, learnBtn,
    lessonButtons.length ? cap('Experiments & theory') : null, lessonButtons.length ? row(...lessonButtons) : null);
  const where = el('details', { id: 'wxHelpWhere' }, el('summary', { text: 'Where the controls are' }),
    el('p', { class: 'note', text: 'File holds Open JSON, Save JSON, New / Clear, the course example and STL/DXF/STEP export. Aerodynamics and Structure & Stress each open one input panel: set the inputs there, then press its Solve button. Apply aerodynamic loads to structure transfers the panel load and re-solves the structure. Result buttons change what is displayed; View holds symmetry, zoom, visibility and colours.' }));
  const aeroHelp = aeroIntro ? el('details', { id: 'wxHelpAero' }, el('summary', { text: 'Aerodynamics · panel method' }), aeroIntro) : null;
  helpBody.prepend(...[helpTop, where, aeroHelp].filter(Boolean));

  // ---------------------------------------------------------------- result strip
  const results = el('section', { id: 'wxResults', 'aria-label': 'Displayed result and solver status' });
  const plots = el('div', { class: 'wx-plots', role: 'group', 'aria-label': 'Displayed result' }, el('span', { class: 'wx-strip-cap', 'aria-hidden': 'true', text: 'Results' }), ...plotButtons, moreSelect);
  const display = el('div', { class: 'wx-disp', role: 'group', 'aria-label': 'Deformed shape' }, defBtn, scaleLabel);
  const aeroStatusBtn = el('button', { type: 'button', class: 'wx-st', id: 'wxAeroStatus', 'aria-controls': 'wingSide', title: 'Open Aerodynamics', 'aria-label': 'Aerodynamics status: open Aerodynamics' },
    el('span', { class: 'wx-name-long', text: 'Aerodynamics' }), el('span', { class: 'wx-name-short', text: 'Aero' }));
  const aeroChip = el('span', { class: 'chip idle', id: 'wxAeroChip', text: 'Not solved' }), aeroText = el('span', { class: 'wx-st-text', id: 'wxAeroText' });
  const aeroGroup = el('div', { class: 'wx-st-group', id: 'wxAeroGroup', role: 'status', 'aria-live': 'polite' }, aeroStatusBtn, aeroChip, aeroText);
  const structStatusBtn = el('button', { type: 'button', class: 'wx-st', id: 'wxStructStatus', 'aria-controls': 'wingSide', title: 'Open Structure & Stress' }, 'Structure');
  const structGroup = el('div', { class: 'wx-st-group', id: 'wxStructGroup' }, structStatusBtn, wlStatus);
  const selection = $('.wing-selection-feedback', tools);
  add(results, plots, display, el('div', { class: 'wx-status' }, aeroGroup, structGroup), selection);

  // ---------------------------------------------------------------- the input panel: one element, two modes
  const panelTitle = el('h2', { id: 'wxPanelTitle', tabindex: '-1' }), panelSub = el('p', { class: 'wx-panel-sub', id: 'wxPanelSub' });
  const panelClose = el('button', { type: 'button', class: 'wx-x', 'aria-label': 'Close panel', text: '×' });
  const panelHead = el('header', { class: 'wx-panel-head' }, el('div', {}, panelTitle, panelSub), panelClose);
  const panelState = el('div', { class: 'wx-panel-state', id: 'wxPanelState' });
  const footButtons = (label) => {
    const discard = el('button', { type: 'button', class: 'btn wx-discard', text: 'Discard unapplied edits', title: 'Reset fields you have not applied yet to the inputs in use. Applied changes stay; Undo reverts them.' });
    const done = el('button', { type: 'button', class: 'btn wx-done', text: 'Close', 'aria-label': 'Close ' + label });
    return { discard, done, row: el('div', { class: 'wx-foot-row' }, discard, done) };
  };
  const geoSlotAero = el('div', { class: 'wx-geo-slot' }), geoSlotStruct = el('div', { class: 'wx-geo-slot' });
  const geoDirtyBadge = el('span', { class: 'wx-dirty', hidden: true, text: 'unapplied edits' });
  $(':scope > summary', wlGeometry).append(geoDirtyBadge);
  setLabel(wlGeometry, 'Wing shape');
  const geoWarn = () => el('p', { class: 'wx-warnline', hidden: true, text: 'Wing shape has unapplied edits: press Apply geometry inside Wing shape, or Discard unapplied edits.' });

  // Aerodynamics mode: inputs, then explicit Solve Aerodynamics and Apply aerodynamic loads to structure.
  const aeroSec = el('div', { class: 'wx-sec wx-sec-aero' });
  const wae = $(':scope > .wae', aeroHost), aeroRun = $('#aeroRun', aeroHost), aeroApply = $('#aeroApply', aeroHost);
  const aeroFoot = footButtons('Aerodynamics'), aeroWarn = geoWarn();
  const groups = { aero: [], structure: [] }, prepares = new Map();
  let flowG = null, resG = null, admG = null, outCap = null;
  if (wae && aeroRun && aeroApply) {
    const grid = $(':scope > .wae-grid', wae), seqLabel = $('#aeroSequence', aeroHost).closest('label');
    const notes = $$(':scope > p.note', wae), seqNote = notes[0];
    const air = $(':scope > details', wae), actions = aeroRun.parentElement;
    const status = $('#aeroStatus', aeroHost), applied = $('#aeroApplied', aeroHost), admission = $('#aeroAdmission', aeroHost), out = $('#aeroResults', aeroHost);
    flowG = subgroup('wxAeroFlow', 'Flow conditions', 'V, ρ, α');
    const meshG = subgroup('wxAeroMesh', 'Panel mesh sequence', 'Standard or Fine');
    admG = subgroup('wxAeroAdm', 'Applied load & admission check'); resG = subgroup('wxAeroRes', 'Solver report & load CSV');
    flowG.body.append(grid); meshG.body.append(seqLabel, seqNote);
    if (air) { air.classList.add('wl-acc', 'wx-sub'); air.id = 'wxAeroAir'; const body = el('div', { class: 'wl-acc-body' }); body.append(...[...air.children].filter((c) => c.tagName !== 'SUMMARY')); air.append(body); }
    admG.body.append(applied, admission); resG.body.append(out);
    admG.d.hidden = true; resG.d.hidden = true;
    outCap = cap('Aerodynamic outputs'); outCap.hidden = true;
    const scroll = el('div', { class: 'wx-scroll' }, cap('Shared wing shape'), geoSlotAero, cap('Aerodynamic inputs'), flowG.d, meshG.d, air, outCap, admG.d, resG.d);
    scroll.append(...[...wae.children].filter((c) => c !== scroll));   // anything else the module renders stays visible
    const hint = el('p', { class: 'wx-hint', text: 'Apply aerodynamic loads to structure replaces the prescribed loads (self-weight is kept) and re-solves the structure for the admission check.' });
    wae.replaceChildren(scroll, el('div', { class: 'wx-foot' }, status, actions, hint, aeroWarn, aeroFoot.row));
    aeroSec.append(aeroHost);
    groups.aero.push(wlGeometry, flowG.d, meshG.d, ...(air ? [air] : []), admG.d, resG.d);
  } else {
    aeroSec.append(el('div', { class: 'wx-scroll' }, geoSlotAero, aeroHost), el('div', { class: 'wx-foot' }, aeroWarn, aeroFoot.row));
    groups.aero.push(wlGeometry);
  }

  // Structure & Stress mode: every structural input, then Solve Structure / Stress.
  const structSec = el('div', { class: 'wx-sec wx-sec-structure' });
  setLabel(wlStructure, 'Ribs'); setLabel(wlLoads, 'Loads & self-weight'); setLabel(wlInventory, 'Model inventory');
  const rodsG = subgroup('wxRods', 'Rods & sleeves'), sparsG = subgroup('wxSpars', 'Spars · caps & webs');
  const matsG = subgroup('wxMaterials', 'Materials & printed thickness'), jointsG = subgroup('wxJoints', 'Joints & root support');
  const anaG = subgroup('wxAnalysis', 'Mesh & analysis settings'), partsG = subgroup('wxParts', 'Select & edit parts on the model');
  const treeG = subgroup('wxTree', 'Study tree (all inputs)'), moreG = subgroup('wxMore', 'More tools');
  moreG.d.hidden = true;
  const tabs = (items) => el('div', { class: 'wx-tabs', role: 'group' }, ...items.map(([id, label]) => el('button', { type: 'button', class: 'btn', 'data-wx-select': id, 'aria-pressed': 'false', text: label })));
  const matTabs = tabs([['mat-pla', 'Shell / ribs'], ['mat-rod', 'Rods'], ['mat-spar', 'Spars']]);
  const jointTabs = tabs([['con', 'Rods & seams'], ['fix', 'Root support']]);
  matTabs.setAttribute('aria-label', 'Material'); jointTabs.setAttribute('aria-label', 'Joint or support');
  matsG.body.append(matTabs); jointsG.body.append(jointTabs);
  const meshLabel = $('#wingMeshElements') && $('#wingMeshElements').closest('label');
  const refineLabel = refineInput && refineInput.closest('label');
  const reserved = el('div', { id: 'wxAnalysisModelSlot', hidden: true });   // reserved for analysis options added later; empty and hidden now
  add(anaG.body, reserved, meshLabel, refineLabel, refineLabel ? el('p', { class: 'note', text: 'Optional finer torsion for bonded spars; slower first solve. Details: Help → Torsion accuracy.' }) : null);
  partsG.body.append(partEditor);
  const pmAside = $('#pm').closest('aside'), treeAside = $('#tree').closest('aside'), treePm = treeAside && treeAside.parentElement;
  const sScroll = el('div', { class: 'wx-scroll' },
    cap('Shared wing shape'), geoSlotStruct, cap('Structure dimensions'), wlStructure, rodsG.d, sparsG.d,
    cap('Materials & loads'), matsG.d, wlLoads, jointsG.d, cap('Analysis & tools'), anaG.d, partsG.d, treeG.d, wlInventory, moreG.d);
  const structFoot = footButtons('Structure & Stress'), structWarn = geoWarn();
  add(structSec, $('#wingImportGate'), sScroll, el('div', { class: 'wx-foot' },
    el('div', { class: 'wx-foot-main' }, runBtn, autoLabel),
    el('p', { class: 'wx-hint', text: 'Fields apply when you press Enter or leave them; forms with their own Apply button wait for it. Results update only with Solve Structure / Stress (or Auto-solve).' }),
    structWarn, structFoot.row));
  groups.structure.push(wlGeometry, wlStructure, rodsG.d, sparsG.d, matsG.d, wlLoads, jointsG.d, anaG.d, partsG.d, treeG.d, wlInventory, moreG.d);

  // Previous side-column content that this layout replaces (kept, hidden, with listeners intact).
  const keepInSide = [$('#wlTreeSection'), $('.wing-input-library', side)].filter(Boolean);
  const sideOld = [...side.children];
  const sideKnown = new Set([sideOld.find((n) => n.tagName === 'BUTTON' && /close inputs/i.test(n.textContent)), $('#wlAero'), $('#wingMaterialShortcuts')].filter(Boolean));
  side.replaceChildren(panelHead, panelState, aeroSec, structSec, ...keepInSide);
  side.classList.add('wx-panel'); side.hidden = true; side.dataset.mode = 'structure';
  side.setAttribute('role', 'dialog'); side.setAttribute('aria-modal', 'false'); side.setAttribute('aria-labelledby', 'wxPanelTitle');
  geoSlotStruct.append(wlGeometry);

  // ---------------------------------------------------------------- assemble the page
  bar.replaceChildren(brand, menubar, barEnd);
  bar.after(results);
  results.after(fileMenu, viewMenu);
  park(...oldGroups, wlRun, $('#inputsBtn'), $('#wingAeroOpenBtn'), $('#wingShowBendingTwist'), $('#wingStudyTreeButton'), cameraRow, resultRow,
    ...['geometry', 'structure', 'materials', 'rib', 'rod', 'spar', 'load'].map((id) => $(`[data-wing-action="${id}"]`, tools)));
  const experiments = $('.wing-experiments', tools); park(experiments);
  // Anything the previous containers still hold that this layout does not know stays reachable under More tools.
  const interactive = 'button, input, select, textarea, a[href], summary';
  const leftovers = [];
  const sweep = (container, skip = () => false) => { if (!container) return; for (const c of [...container.children]) { if (skip(c) || c.hidden) continue; if (c.matches(interactive) || c.querySelector(interactive)) leftovers.push(c); } };
  for (const r of $$(':scope > .wing-tool-row', tools)) sweep(r);
  sweep(tools, (c) => c.classList.contains('wing-tool-row') || c.classList.contains('wing-quick-hint'));
  sweep(viewBody, (c) => c.id === 'hudControls' || c.id === 'wingSparResults');
  sweep($('#hudControls'), (c) => c.classList.contains('wl-vlabel'));
  for (const node of sideOld) {
    if (node.isConnected) continue;   // moved into the new layout
    if (!sideKnown.has(node) && !node.hidden && (node.matches(interactive) || node.querySelector(interactive))) leftovers.push(node); else park(node);
  }
  if (leftovers.length) { moreG.d.hidden = false; moreG.body.append(...leftovers); console.info('Wing AeroStruct UI shell: controls kept under Structure & Stress → More tools:', leftovers.map((n) => n.id || n.textContent.trim().slice(0, 40))); }
  park(tools, $('#wingInlineDisplay'));
  app.classList.add('wx');
  app.classList.remove('learning-view', 'tablet-inputs-open');

  // ---------------------------------------------------------------- one structure form, three views (Ribs, Rods & sleeves, Spars)
  const annotateForm = () => {
    let part = 'ribs';
    for (const c of form.children) {
      if (c.matches('section.wl-spars')) { c.dataset.wxPart = 'spars'; continue; }
      if (c.tagName === 'H4') { const t = c.textContent.toLowerCase(); part = /\brod/.test(t) ? 'rods' : /\brib/.test(t) ? 'ribs' : 'other'; }
      c.dataset.wxPart = part;
    }
  };
  new MutationObserver(annotateForm).observe(form, { childList: true }); annotateForm();
  const showForm = (view) => { const host = view === 'rods' ? rodsG.body : view === 'spars' ? sparsG.body : wlStructure; if (form.parentElement !== host) host.append(form); form.dataset.wxView = view; };
  showForm('ribs');

  // ---------------------------------------------------------------- the property pane serves Materials, Loads, Joints, Mesh and the study tree
  const sel = () => (ui.state() || {}).selected || '';
  const placePM = (body) => { if (pmAside && pmAside.parentElement !== body) body.append(pmAside); };
  const syncTabs = () => { const s = sel(); for (const b of $$('[data-wx-select]', side)) b.setAttribute('aria-pressed', String(b.dataset.wxSelect === s || (b.dataset.wxSelect === 'con' && s === 'con-seam'))); };
  const family = (id) => (/^mat/.test(id) || id === 'materials' ? matsG.d : id === 'load' || id === 'loads' ? wlLoads : ['con', 'con-seam', 'connections', 'fix', 'fixtures'].includes(id) ? jointsG.d : id === 'mesh' ? anaG.d : null);
  for (const b of $$('[data-wx-select]', side)) b.addEventListener('click', () => { hooks.select(b.dataset.wxSelect); syncTabs(); });
  prepares.set(wlStructure, () => showForm('ribs'));
  prepares.set(rodsG.d, () => showForm('rods'));
  prepares.set(sparsG.d, () => showForm('spars'));
  prepares.set(matsG.d, () => { placePM(matsG.body); if (!/^mat/.test(sel())) hooks.select('mat-pla'); syncTabs(); });
  prepares.set(wlLoads, () => { placePM($(':scope > .wl-acc-body', wlLoads) || wlLoads); if (!['load', 'loads'].includes(sel())) hooks.select('load'); });
  prepares.set(jointsG.d, () => { placePM(jointsG.body); if (family(sel()) !== jointsG.d) hooks.select('con'); syncTabs(); });
  prepares.set(anaG.d, () => { placePM(anaG.body); if (sel() !== 'mesh') hooks.select('mesh'); });
  prepares.set(treeG.d, () => { if (treePm) { if (treePm.parentElement !== treeG.body) treeG.body.append(treePm); if (pmAside.parentElement !== treePm) treePm.append(pmAside); } });
  let routing = false;
  new MutationObserver(() => { if (!routing) setTimeout(routePM, 0); }).observe($('#pm'), { childList: true });
  function routePM() {
    if (side.hidden || side.dataset.mode !== 'structure' || pw.popup.contains($('#pm'))) return;
    const open = groups.structure.find((d) => d.open);
    if (open === treeG.d) return;
    const target = family(sel());
    syncTabs();
    if (!target || open === target) return;
    routing = true; try { openSub(target); target.scrollIntoView({ block: 'nearest' }); } finally { routing = false; }
  }

  // ---------------------------------------------------------------- subgroups: open one at a time inside the same panel
  const lastOpen = { aero: flowG ? flowG.d : null, structure: null };
  const modeOf = () => side.dataset.mode;
  function beforeOpen(d) { const f = prepares.get(d); if (f) f(); for (const o of groups[modeOf()]) if (o !== d && o.open) o.open = false; lastOpen[modeOf()] = d; }
  function openSub(d) { if (!d) return; beforeOpen(d); d.open = true; }
  function scrollSubIntoView(d) {
    const sc = d.closest('.wx-scroll'); if (!sc || side.hidden) return;
    const top = d.getBoundingClientRect().top - sc.getBoundingClientRect().top;
    if (top < 0 || top > sc.clientHeight * 0.35) sc.scrollTop += top - 2;
  }
  const wired = new WeakSet();
  function wire(d) {
    if (wired.has(d)) return; wired.add(d);
    const s = $(':scope > summary', d);
    if (s) s.addEventListener('click', () => { if (!d.open) beforeOpen(d); });
    d.addEventListener('toggle', () => { if (d.open && groups[modeOf()].includes(d)) { beforeOpen(d); scrollSubIntoView(d); } });
  }
  for (const d of [...groups.aero, ...groups.structure]) wire(d);
  for (const d of [...groups.aero, ...groups.structure]) if (d.open && d !== (flowG && flowG.d)) d.open = false;
  if (flowG) flowG.d.open = true;

  // ---------------------------------------------------------------- menus: one open at a time, anchored to its command
  const menus = {
    file: { btn: fileBtn, panel: fileMenu, width: 420 },
    view: { btn: viewBtn, panel: viewMenu, width: 460 },
    aero: { btn: aeroBtn, panel: side, width: 528, mode: 'aero', title: 'Aerodynamics', sub: 'Potential-flow panel method on the shared wing shape. Solve it, then apply its loads to the structure.' },
    structure: { btn: structBtn, panel: side, width: 528, mode: 'structure', title: 'Structure & Stress', sub: 'Spatial-beam structure and nominal stresses. Set the inputs, then press Solve Structure / Stress.' },
    help: { btn: helpSummary, panel: helpBody },
  };
  let openKey = null;
  const menuListeners = [];   // run after a menu opens or closes (the message toast moves beside it)
  function setMode(mode) { side.dataset.mode = mode; const slot = mode === 'aero' ? geoSlotAero : geoSlotStruct; if (wlGeometry.parentElement !== slot) slot.append(wlGeometry); }
  function place(key = openKey) {
    if (!key) return;
    if (key === 'help') { placeHelp(); return; }
    const m = menus[key], vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const b = bar.getBoundingClientRect(), r = m.btn.getBoundingClientRect();
    const top = Math.max(4, Math.round(b.bottom + 6)), narrow = vw < 700, width = narrow ? vw - 16 : Math.min(m.width, vw - 16);
    const left = narrow ? 8 : Math.round(Math.max(8, Math.min(r.left, vw - width - 8)));
    Object.assign(m.panel.style, { left: left + 'px', top: top + 'px', width: width + 'px', maxHeight: Math.max(220, vh - top - 10) + 'px' });
  }
  function placeHelp() {
    const vw = document.documentElement.clientWidth, b = bar.getBoundingClientRect(), r = helpSummary.getBoundingClientRect(), width = Math.min(460, vw - 16);
    const top = Math.round(b.bottom + 6), left = vw < 700 ? 8 : Math.round(Math.max(8, Math.min(r.left, vw - width - 8)));
    help.style.setProperty('--wx-help-left', left + 'px'); help.style.setProperty('--wx-help-top', top + 'px');
    help.style.setProperty('--wx-help-maxh', Math.max(220, window.innerHeight - top - 10) + 'px');
  }
  function openMenu(key, { focus = true } = {}) {
    const m = menus[key]; if (!m) return;
    if (openKey === key) { place(key); return; }
    if (openKey) closeMenus();
    if (!pw.popup.hidden) pw.close();
    pw.menu.hidden = true;
    if (key === 'help') { openKey = 'help'; help.open = true; placeHelp(); for (const f of menuListeners) f(); return; }
    if (m.mode) {
      setMode(m.mode); panelTitle.textContent = m.title; panelSub.textContent = m.sub;
      panelClose.setAttribute('aria-label', 'Close ' + m.title);
      const open = groups[m.mode].find((d) => d.open);
      if (open) beforeOpen(open); else if (lastOpen[m.mode]) openSub(lastOpen[m.mode]);
    }
    m.panel.hidden = false; openKey = key; m.btn.setAttribute('aria-expanded', 'true');
    renderPanelState(); place(key);
    for (const f of menuListeners) f();
    if (focus) { const target = m.mode ? panelTitle : m.panel.querySelector('button, select, input, summary, [tabindex]:not([tabindex="-1"])'); if (target) target.focus({ preventScroll: true }); }
  }
  function closeMenus({ returnFocus = false } = {}) {
    const key = openKey; if (!key) return;
    openKey = null;
    const m = menus[key];
    if (key === 'help') { if (help.open) help.open = false; }
    else { m.panel.hidden = true; m.btn.setAttribute('aria-expanded', 'false'); }
    if (returnFocus) m.btn.focus({ preventScroll: true });
    for (const f of menuListeners) f();
  }
  const toggleMenu = (key) => (openKey === key ? closeMenus({ returnFocus: true }) : openMenu(key));
  fileBtn.addEventListener('click', () => toggleMenu('file'));
  viewBtn.addEventListener('click', () => toggleMenu('view'));
  aeroBtn.addEventListener('click', () => toggleMenu('aero'));
  structBtn.addEventListener('click', () => toggleMenu('structure'));
  aeroStatusBtn.addEventListener('click', () => openMenu('aero'));
  structStatusBtn.addEventListener('click', () => openMenu('structure'));
  panelClose.addEventListener('click', () => closeMenus({ returnFocus: true }));
  aeroFoot.done.addEventListener('click', () => closeMenus({ returnFocus: true }));
  structFoot.done.addEventListener('click', () => closeMenus({ returnFocus: true }));
  help.addEventListener('toggle', () => {
    if (help.open) { if (openKey && openKey !== 'help') closeMenus(); if (!pw.popup.hidden) pw.close(); openKey = 'help'; placeHelp(); }
    else if (openKey === 'help') openKey = null;
    for (const f of menuListeners) f();
  });
  const overlay = (t) => !!(t && t.closest && t.closest('dialog, .wing-editor-pop, .wing-print-dialog, .wing-context-menu, .wx-toast'));
  document.addEventListener('pointerdown', (e) => {
    if (!openKey || openKey === 'help') return;
    const m = menus[openKey];
    if (m.panel.contains(e.target) || m.btn.contains(e.target) || overlay(e.target)) return;
    closeMenus();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !openKey || openKey === 'help' || e.defaultPrevented || $('dialog[open]')) return;
    const m = menus[openKey], a = document.activeElement;
    e.preventDefault();
    closeMenus({ returnFocus: !a || a === document.body || m.panel.contains(a) || m.btn.contains(a) });
  });
  for (const panel of [fileMenu, viewMenu, side]) panel.addEventListener('focusout', (e) => {
    const to = e.relatedTarget, m = openKey && menus[openKey];
    if (!to || !m || m.panel !== panel || panel.contains(to) || m.btn.contains(to) || overlay(to)) return;
    closeMenus();
  });
  menubar.addEventListener('keydown', (e) => {
    const items = $$('.wx-top, .wx-quick, #wingInputHelp > summary', menubar).filter((n) => n.getClientRects().length);
    const i = items.indexOf(document.activeElement); if (i < 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); items[(i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length].focus(); }
    else if (e.key === 'ArrowDown' && items[i].matches('.wx-top, summary')) {
      e.preventDefault();
      const key = Object.keys(menus).find((k) => menus[k].btn === items[i]); if (key) openMenu(key);
    }
  });
  window.addEventListener('resize', () => place());
  window.addEventListener('scroll', (e) => { if (openKey && !(e.target instanceof Element && menus[openKey].panel.contains(e.target))) place(); }, { capture: true, passive: true });
  if (window.ResizeObserver) new ResizeObserver(() => place()).observe(bar);
  for (const name of ['wing-learning-stage', 'beam-show', 'metal-wing-open']) window.addEventListener(name, () => closeMenus());

  // The shared editor popup (canvas clicks, right-click actions, lessons, Open JSON preview) never overlaps a menu.
  // An anchor inside a closed menu is replaced by that menu's command so the popup opens beside a visible control.
  const originalOpen = pw.open;
  const resolveAnchor = (at) => {
    if (!(at instanceof Element)) return at;
    if (side.contains(at)) return side.dataset.mode === 'aero' ? aeroBtn : structBtn;
    if (fileMenu.contains(at)) return fileBtn;
    if (viewMenu.contains(at)) return viewBtn;
    if (helpBody.contains(at)) return helpSummary;
    if (parking.contains(at) || !at.getClientRects().length) return structBtn;
    return at;
  };
  // A popup that belongs to a command of the bar (Open JSON review, New / Clear, lessons from Help) opens below the bar,
  // aligned with that command, instead of beside it where it would cover the bar; its scrolling body is shortened to
  // fit the window under the bar. The workspace places its popup from anchor.getBoundingClientRect() only.
  const belowBar = (cmd) => ({ getBoundingClientRect: () => {
    const top = Math.round(bar.getBoundingClientRect().bottom + 8), x = cmd.getBoundingClientRect().left - 10;
    pw.popup.style.setProperty('--wx-pop-top', top + 'px');   // read by the height limit in wx-shell.css
    return { left: x, right: x, x, top, y: top, bottom: top, width: 0, height: 0 };
  } });
  pw.open = function (heading, node, at) {
    let anchor = resolveAnchor(at);
    const inBar = anchor instanceof Element && bar.contains(anchor);
    pw.popup.classList.toggle('wx-below-bar', inBar);
    if (inBar) anchor = belowBar(anchor);
    if (openKey) closeMenus();
    return originalOpen.call(this, heading, node, anchor);
  };
  // The exporter dialogs (STL/DXF/STEP, STL reference) open below the command bar and replace the menu that opened
  // them; when one closes and its trigger sits in a closed menu, focus returns to that menu's command.
  for (const dialog of $$('.wing-print-dialog')) new MutationObserver(() => {
    if (!dialog.hidden) {
      const top = Math.round(bar.getBoundingClientRect().bottom + 8);
      dialog.style.top = top + 'px'; dialog.style.maxHeight = `calc(100dvh - ${top + 12}px)`;
      if (openKey && openKey !== 'help') closeMenus();
    } else {
      const a = document.activeElement;
      if (!a || a === document.body || !a.getClientRects().length) fileBtn.focus({ preventScroll: true });
    }
  }).observe(dialog, { attributes: true, attributeFilter: ['hidden'] });
  fileMenu.addEventListener('click', (e) => {   // an export started again while its dialog is already open
    if (!(e.target instanceof Element) || !e.target.closest('#wingDownloadSTL, #wingDownloadDXF, #wingDownloadSTEP, #wingOpenSTL')) return;
    setTimeout(() => { if (openKey === 'file' && $$('.wing-print-dialog').some((d) => !d.hidden)) closeMenus(); }, 0);
  });

  // ---------------------------------------------------------------- status: which solver is current, stale or failed
  let keyCache = { stamp: null, key: null };
  function currentAeroKey(S) {
    const stamp = JSON.stringify(S.geometry); if (stamp === keyCache.stamp) return keyCache.key;
    let key = null; try { key = WingStudyIO.sha256(WingAeroPanel.geometryKey(WingEngine.makeGeometry(S.geometry))); } catch (e) { key = null; }
    keyCache = { stamp, key }; return key;
  }
  const num = (id) => { const t = String(($('#' + id) || {}).value ?? '').trim(); return t === '' ? NaN : Number(t); };
  const near = (x, y) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y));
  function flowMatches(last) {
    const f = last.flow || {}, target = String(($('#aeroTarget') || {}).value ?? '').trim();
    return near(num('aeroV'), f.speed) && near(num('aeroRho'), f.density) && near(num('aeroMu'), f.viscosity) && near(num('aeroSound'), f.speedOfSound)
      && ((($('#aeroSequence') || {}).value || 'standard') === last.sequence) && (target !== '' || near(num('aeroAlpha'), f.alphaDeg));
  }
  const fmt = (v) => String(Number(Number(v).toPrecision(4)));
  function aeroState() {
    const a = ui.aero && ui.aero(); const S = ui.state();
    if (!a) return { cls: 'idle', label: 'Unavailable', detail: '', dot: 'idle', title: 'The aerodynamic panel module is not available in this build.' };
    if (a.running) return { cls: 'run', label: 'Solving…', detail: 'aerodynamic mesh sequence', dot: 'run', title: ($('#aeroStatus') || {}).textContent || '' };
    const last = a.result, key = currentAeroKey(S), errText = (($('#aeroStatus .wae-err') || {}).textContent || '').trim();
    let load = '', loadCls = '';
    if (S.aeroLoad) {
      const R = ui.result(), adm = R && R.aeroAdmission;
      if (S.aeroLoad.geometrySha256 !== key) { load = 'applied load is for an older wing shape'; loadCls = 'warn'; }
      else if (ui.isRunning()) load = 'load applied · structure solving';
      else if (!R || ui.isStale() || !adm) { load = 'load applied · structure not solved'; loadCls = 'warn'; }
      else if (!adm.admitted) { load = 'load applied · NOT admitted (coupled result withheld)'; loadCls = 'bad'; }
      else { load = adm.claims && adm.claims.twist === 'shown' ? 'load applied · admitted' : `load applied · admitted, ${adm.claims && adm.claims.torque === 'shown' ? 'twist' : 'torque & twist'} withheld`; loadCls = 'ok'; }
    } else if (last) load = 'load not applied to structure';
    if (!last) {
      if (errText) return { cls: 'bad', label: 'Error', detail: errText, dot: 'bad', title: errText };
      return S.aeroLoad ? { cls: loadCls || 'idle', label: 'Load applied', detail: load, dot: loadCls || 'idle', title: (S.aeroLoad.label || '') + ' · ' + load }
        : { cls: 'idle', label: 'Not solved', detail: '', dot: 'idle', title: 'Set the flow conditions, then press Solve Aerodynamics.' };
    }
    const fresh = !!key && a.solvedKey === key, flow = flowMatches(last);
    const what = `${last.sequence === 'fine' ? 'Fine' : 'Standard'} · α ${fmt(last.flow.alphaDeg)}° · V ${fmt(last.flow.speed)} m/s`;
    if (errText) return { cls: 'bad', label: 'Error', detail: errText, dot: 'bad', title: errText };
    if (!fresh || !flow) {
      const why = !fresh ? 'wing shape changed since the solve' : 'flow inputs changed since the solve';
      return { cls: 'warn', label: 'Out of date', detail: why, dot: 'warn', title: `Last solve: ${what}. ${why[0].toUpperCase() + why.slice(1)}: press Solve Aerodynamics. ${load}` };
    }
    return { cls: loadCls === 'bad' ? 'bad' : 'ok', label: 'Solved', detail: load ? `${what} · ${load}` : what, dot: loadCls === 'bad' ? 'bad' : loadCls === 'warn' ? 'warn' : 'ok', title: `${what}. ${load}` };
  }
  function structState() {
    const chip = $('#stateChip'), label = chip.textContent.trim(), running = ui.isRunning() || /^Solving/i.test(label);
    const cls = (chip.className.match(/\b(ok|warn|bad|idle)\b/) || [])[1] || 'idle';
    return { label, running, dot: running ? 'run' : /^Solved/i.test(label) && cls === 'idle' ? 'ok' : cls, full: ($('#stateText') || {}).textContent || label };
  }
  let seenResult = null, seenAdmission = null, pendingAero = null, geoDirty = false, geoStamp = JSON.stringify(ui.state().geometry);
  // Aerodynamic result views (separate from Model / Stress / Displacement): the stored panel solution only.
  function aeroResultState() {
    const a = ui.aero && ui.aero(); if (!a) return { status: 'none' };
    if (a.running) return { status: 'running' };
    const last = a.result; if (!last || !last.base) return { status: 'none' };
    const key = currentAeroKey(ui.state());
    if (!key || a.solvedKey !== key) return { status: 'stale', why: 'the wing shape changed after the aerodynamic solve' };
    if (!flowMatches(last)) return { status: 'stale', why: 'the flow inputs changed after the aerodynamic solve' };
    return { status: 'ok', result: last, combined: a.combined, admission: a.admission };
  }
  const view = $('#app > main.view');
  const aeroResults = window.WingAeroStructResults && view ? window.WingAeroStructResults.install({ el, ui, strip: results, view, state: aeroResultState, openAero: () => openMenu('aero') }) : null;
  if (aeroResults) results.insertBefore(aeroResults.selector, display);
  // Read the worker's real mesh-stage messages. This is a progress display, not a guessed solve percentage.
  const aeroBusyStep = el('p', { class: 'wx-aero-busy-step', text: 'Starting the aerodynamic mesh sequence…' });
  const aeroBusyTime = el('span', { class: 'wx-aero-busy-time', 'aria-live': 'off' });
  const aeroBusyProgress = el('progress', { 'aria-label': 'Completed aerodynamic meshes', max: '7' });
  const aeroBusy = el('div', { class: 'wx-aero-busy', role: 'status', 'aria-live': 'polite', hidden: true },
    el('div', { class: 'wx-aero-busy-title' }, el('span', { class: 'wx-aero-spinner', 'aria-hidden': 'true' }), el('strong', { text: 'Solving aerodynamic panels' })),
    aeroBusyStep, aeroBusyProgress, aeroBusyTime);
  document.body.append(aeroBusy);
  let aeroBusyStart = 0, aeroBusyTimer = 0;
  function syncAeroBusy(a) {
    const running = !!(a && a.running);
    aeroBusy.hidden = !running || app.hidden;
    if (!running) { if (aeroBusyTimer) clearInterval(aeroBusyTimer); aeroBusyTimer = 0; aeroBusyStart = 0; return; }
    if (!aeroBusyStart) aeroBusyStart = performance.now();
    const tick = () => {
      aeroBusyTime.textContent = `Elapsed ${((performance.now() - aeroBusyStart) / 1000).toFixed(1)} s`;
      const message = ($('#aeroStatus')?.textContent || '').trim(), stage = /Mesh\s+(\d+)\s+of\s+(\d+)/i.exec(message);
      const shown = message || 'Starting the aerodynamic mesh sequence…';
      if (aeroBusyStep.textContent !== shown) aeroBusyStep.textContent = shown;
      if (stage) { aeroBusyProgress.max = Number(stage[2]); aeroBusyProgress.value = Math.max(0, Number(stage[1]) - 1); }
      else aeroBusyProgress.removeAttribute('value');
    };
    if (!aeroBusyTimer) aeroBusyTimer = setInterval(tick, 250);
    tick();
  }
  if (aeroRun) aeroRun.addEventListener('click', () => { pendingAero = 'solve'; }, true);
  if (aeroApply) aeroApply.addEventListener('click', () => { pendingAero = 'apply'; }, true);
  function renderPanelState() {
    if (side.hidden && openKey !== 'aero' && openKey !== 'structure') return;
    panelState.replaceChildren();
    if (modeOf() === 'aero') {
      const s = aeroState();
      panelState.append(el('span', { class: 'chip ' + s.cls, text: s.label }), el('span', { text: s.detail || s.title || '' }));
      if (aeroResults && aeroResultState().status === 'ok') {
        const go = el('button', { type: 'button', class: 'btn wx-linkbtn', id: 'wxShowAeroResults', text: 'Show aerodynamic results' });
        go.addEventListener('click', () => { closeMenus(); aeroResults.show('cp'); });
        panelState.append(go);
      }
    } else {
      const s = structState(), chip = $('#stateChip');
      panelState.append(el('span', { class: chip.className, text: s.label }), el('span', { text: s.full }));
    }
  }
  function updateStatus() {
    const s = aeroState();
    aeroChip.className = 'chip ' + s.cls; aeroChip.textContent = s.label; aeroText.textContent = s.detail || '';
    aeroGroup.title = s.title || s.detail || s.label; aeroDot.dataset.s = s.dot; aeroDotText.textContent = ' (' + s.label + ')';
    const t = structState();
    structDot.dataset.s = t.dot; structDotText.textContent = ' (' + t.label + ')';
    const a = ui.aero && ui.aero();
    syncAeroBusy(a);
    if (admG && resG) {   // write only real changes: an attribute write inside the observed host would re-trigger this update
      const setHidden = (n, v) => { if (n && n.hidden !== v) n.hidden = v; };
      setHidden(admG.d, !($('#aeroApplied').textContent.trim() || $('#aeroAdmission').textContent.trim()));
      setHidden(resG.d, !$('#aeroResults').textContent.trim());
      setHidden(outCap, admG.d.hidden && resG.d.hidden);
      if (a && !a.running && a.result && a.result !== seenResult) { seenResult = a.result; if (pendingAero === 'solve') pendingAero = null; }
      if (a && a.admission && a.admission !== seenAdmission) { seenAdmission = a.admission; if (pendingAero === 'apply') { pendingAero = null; if (openKey === 'aero') openSub(admG.d); } }
    }
    const stamp = JSON.stringify(ui.state().geometry);
    if (stamp !== geoStamp) { geoStamp = stamp; setGeoDirty(false); }
    renderPanelState();
    if (aeroResults) aeroResults.refresh();
  }
  let statusTimer = 0;
  const queueStatus = () => { if (!statusTimer) statusTimer = setTimeout(() => { statusTimer = 0; updateStatus(); }, 0); };
  const watch = (node, opts) => { if (node) new MutationObserver(queueStatus).observe(node, opts); };
  watch($('#stateChip'), { attributes: true, childList: true, characterData: true, subtree: true });
  watch($('#stateText'), { childList: true, characterData: true, subtree: true });
  watch(aeroHost, { attributes: true, attributeFilter: ['disabled', 'hidden'], childList: true, characterData: true, subtree: true });
  for (const id of ['aeroV', 'aeroRho', 'aeroAlpha', 'aeroTarget', 'aeroMu', 'aeroSound', 'aeroSequence']) { const n = $('#' + id); if (n) { n.addEventListener('input', queueStatus); n.addEventListener('change', queueStatus); } }
  const gate = $('#wingImportGate');
  if (gate) new MutationObserver(() => { if (!gate.hidden && openKey !== 'structure' && !app.hidden) openMenu('structure', { focus: false }); queueStatus(); }).observe(gate, { attributes: true, attributeFilter: ['hidden'] });
  updateStatus();

  // ---------------------------------------------------------------- drafts: Wing shape edits wait for Apply geometry
  function setGeoDirty(v) { geoDirty = v; geoDirtyBadge.hidden = !v; aeroWarn.hidden = !v; structWarn.hidden = !v; }
  const geoForm = $('#wingAdvancedGeometry form');
  if (geoForm) for (const name of ['input', 'change']) geoForm.addEventListener(name, (e) => { if (e.isTrusted) setGeoDirty(true); });
  structFoot.discard.addEventListener('click', () => {
    hooks.discardGeometryDraft(); hooks.cancelLoadDraft(); hooks.renderInputs(); hooks.renderPM(); setGeoDirty(false); syncTabs();
    showToast('Unapplied edits in Structure & Stress were discarded. Applied inputs are unchanged; Undo reverts applied edits.');
  });
  aeroFoot.discard.addEventListener('click', () => {
    hooks.discardGeometryDraft(); const a = ui.aero && ui.aero(); if (a) a.refresh(); setGeoDirty(false); queueStatus();
    showToast('Unapplied edits in Aerodynamics were discarded: the flow fields show the settings of the last Solve Aerodynamics again.');
  });

  // ---------------------------------------------------------------- file and session messages appear briefly under the bar
  const toast = el('div', { class: 'wx-toast', id: 'wxToast', role: 'status', 'aria-live': 'polite', hidden: true },
    el('span', { class: 'wx-toast-text' }), el('button', { type: 'button', class: 'wx-toast-x', 'aria-label': 'Dismiss message', text: '×' }));
  document.body.append(toast);
  let toastTimer = 0;
  function showToast(text) {
    $('.wx-toast-text', toast).textContent = text; toast.hidden = false; placeToast();
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 9000);
  }
  // Under the bar at the right; beside an open panel or menu instead of over it whenever the window leaves room.
  function placeToast() {
    if (toast.hidden) return;
    const vw = document.documentElement.clientWidth, w = toast.getBoundingClientRect().width;
    let right = 14;
    const open = openKey === 'help' ? helpBody : openKey ? menus[openKey].panel : null;
    if (open && vw >= 700) {
      const r = open.getBoundingClientRect();
      if (r.width && r.right > vw - 14 - w && r.left < vw - 14) {
        if (r.left - 8 - w >= 8) right = vw - r.left + 8;
        else if (vw - r.right - 8 - 14 >= w) right = 14;
      }
    }
    toast.style.setProperty('--wx-toast-top', Math.round(bar.getBoundingClientRect().bottom + 8) + 'px');
    toast.style.right = right + 'px';
  }
  $('.wx-toast-x', toast).addEventListener('click', () => { toast.hidden = true; });
  menuListeners.push(placeToast); window.addEventListener('resize', placeToast);
  const echo = (node, keep) => { if (!node) return; let last = node.textContent; new MutationObserver(() => { const t = node.textContent.trim(); if (t && t !== last && keep(t) && !app.hidden) showToast(t); last = t; }).observe(node, { childList: true, characterData: true, subtree: true }); };
  echo($('#wingFilesNote'), () => true);
  echo($('#wingSessionStatus'), (t) => !/^(Autosaved|Changes are saved in this browser)/.test(t));

  // ---------------------------------------------------------------- page hooks
  hooks.onShowInputs = (show) => { app.classList.remove('learning-view', 'tablet-inputs-open'); if (show) openMenu('structure', { focus: false }); else if (openKey === 'aero' || openKey === 'structure') closeMenus(); };
  // Make a section (and the control in it) visible before the page focuses it: Go to the input, openSection.
  hooks.reveal = (details, target) => {
    const node = target || details; if (!node || !node.isConnected || pw.popup.contains(node)) return;
    if (fileMenu.contains(node)) { openMenu('file', { focus: false }); if (details && fileMenu.contains(details)) details.open = true; return; }
    if (viewMenu.contains(node)) { openMenu('view', { focus: false }); if (details && viewMenu.contains(details)) details.open = true; return; }
    if (helpBody.contains(node)) { openMenu('help'); return; }
    if (!side.contains(node)) return;
    const mode = aeroSec.contains(node) && !wlGeometry.contains(node) ? 'aero' : wlGeometry.contains(node) && openKey === 'aero' ? 'aero' : 'structure';
    openMenu(mode, { focus: false });
    let group = null;
    if (form.contains(node)) { const part = ([...form.children].find((c) => c.contains(node)) || {}).dataset?.wxPart; group = part === 'rods' ? rodsG.d : part === 'spars' ? sparsG.d : wlStructure; }
    else if (node === wlStructure) group = wlStructure;
    else group = groups[mode].find((d) => d.contains(node)) || null;
    if (group) openSub(group);
  };
  hooks.addStructureSubgroup = ({ id, title, node, open = false } = {}) => {
    const g = subgroup(id, title); if (node) g.body.append(node);
    anaG.d.after(g.d); groups.structure.splice(groups.structure.indexOf(anaG.d) + 1, 0, g.d); wire(g.d);
    if (open) { openMenu('structure', { focus: false }); openSub(g.d); }
    return g.d;
  };

  // ---------------------------------------------------------------- page chrome: white workspace, sticky bar below the navigation
  const nav = $('#wingNavigation');
  const syncNav = () => {
    app.style.setProperty('--wx-nav-h', (nav && !nav.hidden ? Math.round(nav.getBoundingClientRect().height) : 0) + 'px');
    if (!view || app.hidden) return;
    const top = view.getBoundingClientRect().top + window.scrollY, vh = window.innerHeight, narrow = document.documentElement.clientWidth < 700;
    const h = Math.round(Math.max(narrow ? 300 : 380, Math.min(narrow ? vh * 0.62 : 1100, vh - top - 12)));
    app.style.setProperty('--wx-view-h', h + 'px');
  };
  if (window.ResizeObserver) { const ro = new ResizeObserver(syncNav); if (nav) ro.observe(nav); ro.observe(bar); ro.observe(results); }
  window.addEventListener('resize', syncNav); syncNav();
  const syncVisible = () => { document.body.classList.toggle('wx-wing-on', !app.hidden); if (app.hidden) { closeMenus(); toast.hidden = true; } else syncNav(); syncAeroBusy(ui.aero && ui.aero()); };
  new MutationObserver(syncVisible).observe(app, { attributes: true, attributeFilter: ['hidden'] }); syncVisible();
  document.documentElement.dataset.wxShell = 'ready';
})();
