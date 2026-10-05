// Pure-function and generated-page checks. Browser interaction is tested separately.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const E = require("./engine.js");
const source = readFileSync(new URL("./wing_lab_template.html", import.meta.url), "utf8").replaceAll("\r\n", "\n");
const engine = readFileSync(new URL("./engine.js", import.meta.url), "utf8").replaceAll("\r\n", "\n");
const published = readFileSync(new URL("../../../docs/wing-lab.html", import.meta.url), "utf8").replaceAll("\r\n", "\n");
const page = source.replace("/*__ENGINE__*/", engine).replace("/*__BEAM_ENGINE__*/",readFileSync(new URL("./beam_learning_engine.js",import.meta.url),"utf8").replaceAll("\r\n","\n")).replace("/*__FOUNDATIONS__*/",readFileSync(new URL("./foundations_ui.js",import.meta.url),"utf8").replaceAll("\r\n","\n")).replace("/*__TEACHING_MODELS__*/",readFileSync(new URL("./teaching_models.js",import.meta.url),"utf8").replaceAll("\r\n","\n")).replace("/*__TEACHING_PANELS__*/",readFileSync(new URL("./teaching_panels.js",import.meta.url),"utf8").replaceAll("\r\n","\n"));
const endTitle = page.indexOf("</title>") + 8;
const endStyle = page.indexOf("</style>") + 8;
const expected = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  + page.slice(0, endTitle) + "\n" + page.slice(endTitle, endStyle)
  + "\n</head>\n<body>\n" + page.slice(endStyle) + "\n</body>\n</html>\n";
assert.equal(published, expected, "Rebuild docs/wing-lab.html after editing the template");
let scripts = 0;
for (const match of published.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  if (match[1].trim()) { new vm.Script(match[1]); scripts++; }
}
assert.equal(scripts, 4);
assert.ok(source.includes('<div id="foundations"></div>'));
assert.ok(source.includes('<div id="app" class="learning-view" hidden>'));
const context = vm.createContext({ E, nf: (v, d = 2) => Number(v).toFixed(d) });
const figures = source.slice(source.indexOf("  function svgFrame("), source.indexOf("  function renderDesignLab("));
vm.runInContext(figures, context);
for (const modules of [2, 3]) {
  const geometry = E.makeGeometry({ modules });
  const plan = context.ribPlanFigure(geometry);
  const section = context.sectionFigure(geometry);
  for (let i = 0; i < E.ribStations(geometry).length; i++) assert.ok(plan.includes(`>R${i + 1}</text>`));
  for (const image of [plan, section, context.beamFigure(1), context.beamFigure(2)]) {
    assert.ok(!/NaN|undefined|Infinity/.test(image));
    assert.ok(image.includes('role="img"'));
  }
}
assert.deepEqual(E.ribStations(E.makeGeometry()), [112.5, 146, 154, 225, 296, 304, 337.5]);
assert.ok(source.includes('plot: "model", deformed: false'));
assert.ok(source.includes('data-tab="learn" aria-selected="true"'));
assert.equal((source.match(/data-lesson="\d"/g) || []).length, 6);
assert.ok(source.includes('data-tab="design"'));
const custom = E.makeGeometry({ customInteriorRibs: [56.3, 112.5, 225, 337.5] });
assert.ok(context.ribPlanFigure(custom).includes('>R8</text>'));
assert.deepEqual(Array.from(context.interiorStations(custom)), [56.3, 112.5, 225, 337.5]);
console.log("PASS: generated page matches template and engines; four inline scripts parse; 2/3-module and custom-rib figures are finite and labelled; beam landing screen and initially hidden wing workspace are present; wing lesson and Design lab remain available.");
