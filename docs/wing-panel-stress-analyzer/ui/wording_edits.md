# Hook and wording edits in the AeroStruct sources

Each row: line in the built page, source file, old text → new text (shortened to the changed words with a little context). The full change is in `01-wing-aerostruct-ui-sources.patch`.

## Hooks (6 inserted lines)

| page line | source | inserted |
|---|---|---|
| 14678 | wing_aerostruct_template.html | `window.WingLabUI?.shell?.reveal?.(d, focusId ? $("#" + focusId) : null);   // UI shell hook` |
| 16933 | wing_aerostruct_template.html | `window.WingLabUI?.shell?.onShowInputs?.(show);   // UI shell hook: show or hide the input panel` |
| 17146 | wing_aerostruct_template.html | `// UI shell hooks (command bar and input panels at the end of this page): the shell moves these real editors and` |
| 17146 | wing_aerostruct_template.html | `// calls these page functions; it never solves or edits study data itself. The shell sets onShowInputs and reveal.` |
| 17146 | wing_aerostruct_template.html | `window.WingLabUI.shell = { workspace: () => printedWorkspace, select: (id) => select(id), renderPM: () => renderPM(), renderInputs: () => renderInputs` |
| 17146 | wing_aerostruct_template.html | `discardGeometryDraft: () => advancedGeometryEditor?.refresh(), cancelLoadDraft: () => wingLoadKeeper?.editor?.cancelDraft(), gateOpen: () => gateOpen(` |

## Replaced lines (39)

| page line | source | old | new |
|---|---|---|---|
| 1069 | wing_aerostruct_template.html | fill="currentColor"/></svg>Solve</button></div> | fill="currentColor"/></svg>Solve Structure / Stress</button></div> |
| 1069 | wing_aerostruct_template.html | <label class="wl-auto" title="Solve automatically after | <label class="wl-auto" title="Run Solve Structure / Stress automatically after |
| 1176 | wing_aerostruct_template.html | solved model. Press Solve to update the 3-D view.</p> | solved model. Press Solve Structure / Stress to update the 3-D view.</p> |
| 1189 | wing_aerostruct_template.html | rod or spar to edit it. Use Inside wing above the model to reveal internal parts. | rod or spar to edit it. Use View → Inside wing to reveal internal parts. |
| 1303 | wing_aerostruct_template.html | expectation before you press Solve. Change one input, predict, | expectation before you press Solve Structure / Stress. Change one input, predict, |
| 11409 | wing_aero_ui.js | '))}).${twistFail}${adm.sequence === 'standard' ? ' Run the Fine sequence and apply it again.' : ' The Fine | '))}).${twistFail}${adm.sequence === 'standard' ? ' Choose the Fine mesh sequence, press Solve Aerodynamics and apply the loads again.' : ' The Fine |
| 11422 | wing_aero_ui.js | type="button" id="aeroRun">Run mesh sequence</button><button class="btn" type="button" id="aeroApply" disabled>Apply to structure and solve</button><button class="btn" | type="button" id="aeroRun">Solve Aerodynamics</button><button class="btn" type="button" id="aeroApply" disabled>Apply aerodynamic loads to structure</button><button class="btn" |
| 11477 | wing_aero_ui.js | the load: see below.' : 'Apply it to the structure to run the admission test.'}`); | the load: see below.' : 'Press Apply aerodynamic loads to structure to run the admission test (it re-solves the structure).'}`); |
| 11517 | wing_aero_ui.js | (!last) throw new Error('Run the mesh sequence first.'); | (!last) throw new Error('Press Solve Aerodynamics first.'); |
| 11519 | wing_aero_ui.js | after this aerodynamic solve. Run the mesh sequence again before applying | after this aerodynamic solve. Press Solve Aerodynamics again before applying |
| 11549 | wing_aero_ui.js | solve refuses it until you run the mesh sequence again and apply it, or remove it.</p>' | solve refuses it until you press Solve Aerodynamics again and apply the loads, or remove it.</p>' |
| 11551 | wing_aero_ui.js | the last aerodynamic solve: run the mesh sequence again before applying | the last aerodynamic solve: press Solve Aerodynamics again before applying |
| 11555 | wing_aero_ui.js | { return lastAdmission; } }; | { return lastAdmission; }, get solvedKey() { return lastKey; }, get running() { return running; } }; |
| 14286 | wing_aerostruct_template.html | the results.':'Press Solve to update results.'); | the results.':'Press Solve Structure / Stress to update results.'); |
| 14324 | wing_aerostruct_template.html | wing shape. In Aerodynamics, run the mesh sequence again and apply it, or remove the aerodynamic | wing shape. In Aerodynamics, press Solve Aerodynamics again and apply the loads, or remove the aerodynamic |
| 14501 | wing_aerostruct_template.html | across each seam (Structure → Rods); the wing would fall | across each seam (Structure & Stress → Rods & sleeves); the wing would fall |
| 14550 | wing_aerostruct_template.html | target=errorTarget;if(target?.isConnected)errorReturnFocus=target;close();if(target?.isConnected){target.closest('details')?.setAttribute('open','');target.scrollIntoView({block:'center',behavior:'smooth'});target.focus({preventScroll:true});}}; | target=errorTarget;if(target?.isConnected)errorReturnFocus=target;close();if(target?.isConnected){window.WingLabUI?.shell?.reveal?.(target.closest('details'),target);target.closest('details')?.setAttribute('open','');target.scrollIntoView({block:'center',behav |
| 14642 | wing_aerostruct_template.html | or choose epoxied seams (Study tree → Connections).`); | or choose epoxied seams (Structure & Stress → Joints & root support).`); |
| 14840 | wing_aerostruct_template.html | inputs. Add one in Structure → Bonded spars. Rods and spars | inputs. Add one in Structure &amp; Stress → Spars. Rods and spars |
| 14846 | wing_aerostruct_template.html | changed: geometry preview only; Solve to calculate spar stresses.':'Limit-load | changed: geometry preview only; press Solve Structure / Stress to calculate spar stresses.':'Limit-load |
| 14894 | wing_aerostruct_template.html | not solved yet; press Solve." : "<b>Inputs on screen</b>, | not solved yet; press Solve Structure / Stress." : "<b>Inputs on screen</b>, |
| 14928 | wing_aerostruct_template.html | arrows are hidden. Press Solve to update analysis. Results | arrows are hidden. Press Solve Structure / Stress to update analysis. Results |
| 14933 | wing_aerostruct_template.html | Correct inputs and press Solve.'; | Correct inputs and press Solve Structure / Stress.'; |
| 14964 | wing_aerostruct_template.html | planform.':label==='Out of date'?'Press Solve to update.':label==='Solving'?'Computing…':/no | planform.':label==='Out of date'?'Press Solve Structure / Stress.':label==='Solving'?'Computing…':/no |
| 14979 | wing_aerostruct_template.html | on screen. Press <b>Solve</b> to update them.</span>' | on screen. Press <b>Solve Structure / Stress</b> to update them.</span>' |
| 14986 | wing_aerostruct_template.html | inputs (list at the top of this column) before solving."; return; | inputs (list at the top of Structure & Stress) before solving."; return; |
| 14989 | wing_aerostruct_template.html | "Inputs changed — press Solve. Results shown are for the last solved model." : "Press Solve to compute the first | "Inputs changed — press Solve Structure / Stress. Results shown are for the last solved model." : "Press Solve Structure / Stress to compute the first |
| 15855 | wing_aerostruct_template.html | ${WingGeometry.closedTip(g)?'Exact closed-tip shape. Solve for nominal normal stress; apex unresolved.':'Stress and deformation hidden; press Solve for analysis.'}`; | ${WingGeometry.closedTip(g)?'Exact closed-tip shape. Press Solve Structure / Stress for nominal normal stress; apex unresolved.':'Stress and deformation hidden; press Solve Structure / Stress for analysis.'}`; |
| 15855 | wing_aerostruct_template.html | closed-tip geometry · Solve for nominal normal stress · exact apex unresolved.':'Geometry preview only · no structural result yet. Press Solve to analyse.'; | closed-tip geometry · Solve Structure / Stress for nominal normal stress · exact apex unresolved.':'Geometry preview only · no structural result yet. Press Solve Structure / Stress to analyse.'; |
| 16326 | wing_aerostruct_template.html | change an input and press Solve."; | change an input and press Solve Structure / Stress."; |
| 16472 | wing_aerostruct_template.html | ${stale?'Inputs changed: Solve before comparing results.':''}</p>`; | ${stale?'Inputs changed: press Solve Structure / Stress before comparing results.':''}</p>`; |
| 16474 | wing_aerostruct_template.html | thickness or spar dimension, then Solve. Keep the loads and | thickness or spar dimension, then press Solve Structure / Stress. Keep the loads and |
| 16802 | wing_aerostruct_template.html | thickness in <b>Structure</b> in the input column (below the 3-D view on a phone). Changes wait for <b>Solve</b> unless “Solve automatically” is ticked; this comparison | thickness in <b>Structure &amp; Stress → Ribs</b>. Changes wait for <b>Solve Structure / Stress</b> unless <b>Auto-solve</b> is ticked; this comparison |
| 16923 | wing_aerostruct_template.html | Input edits wait for Solve unless “Solve automatically” is ticked; lesson buttons | Input edits wait for Solve Structure / Stress unless Auto-solve is ticked; lesson buttons |
| 17041 | wing_aerostruct_template.html | items below: set each one in this column, then tick it. The study | items below: set each one in Structure &amp; Stress, then tick it. The study |
| 17046 | wing_aerostruct_template.html | "Structure confirmed: press Solve.";recordWingHistory();setStatus(); | "Structure confirmed: press Solve Structure / Stress.";recordWingHistory();setStatus(); |
| 17049 | wing_aerostruct_template.html | first (list at the top of the input column)."; | first (list at the top of Structure & Stress)."; |
| 17089 | wing_aerostruct_template.html | wing is shown; press Solve to update its results.'}`); | wing is shown; press Solve Structure / Stress to update its results.'}`); |
| 17286 | wing_aerostruct_template.html | selection. New / Clear is in the main toolbar; Undo restores your | selection. New / Clear is in the File menu; Undo restores your |
