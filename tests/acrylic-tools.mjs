import {readFileSync} from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const html=readFileSync(new URL("../src/acrylic-tools.html",import.meta.url),"utf8");
const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const context={window:{},document:{}};
vm.runInNewContext(js.slice(0,js.indexOf('let mode="panel"'))+'})();',context);
const {generate,modes}=context.window.AcrylicTools;
for(const [mode,m] of Object.entries(modes)){
 const result=generate(mode,{...m.defaults});
 assert(result.area>0);
 assert(result.svg.includes('width="'+result.w+'mm"'));
 assert(!result.svg.includes("<text"));
}
for(const [mode,patch] of [
 ["panel",{d:50}],["panel",{edge:300}],["grid",{cols:40,d:30}],
 ["grid",{rows:1.5}],["base",{slot:190}],["base",{insert:0.1,clearance:-0.2}],
 ["tag",{shape:"circle",edge:1}],["panel",{w:NaN}],["panel",{r:201}]
])assert.throws(()=>generate(mode,{...modes[mode].defaults,...patch}));
assert.equal(generate("base",{...modes.base.defaults}).slotWidth,3.2);
assert.equal(generate("panel",{...modes.panel.defaults,holes:"none"}).holes,0);
assert.equal(generate("tag",{...modes.tag.defaults,shape:"circle"}).h,50);
assert.equal(generate("grid",{...modes.grid.defaults,cols:1,rows:1}).holes,1);
const app=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
for(const [,script] of app.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script);
assert(app.includes('id="tab-acrylic-tools"'));
assert(app.includes('data-tab="acrylic-tools"'));
assert(!app.includes("<!-- ACRYLIC_TOOLS -->"));

const {categories}=context.window.AcrylicTools;
assert.equal(Object.keys(modes).length,10);
assert.equal(Object.keys(categories).length,3);
assert.equal(Object.values(modes).filter(m=>m.category==="gifts").length,5);
for(const m of Object.values(modes))assert(Object.hasOwn(categories,m.category));
for(const [mode,patch] of [
 ["medal",{strapW:70}],["medal",{edge:1}],["luggage",{strapH:20,strapW:5}],
 ["coaster",{w:4}],["magnet",{shape:"unknown"}],["stand",{baseW:50}],
 ["stand",{baseT:150}],["stand",{clearance:-0.2}],["stand",{h:5,baseT:6}]
])assert.throws(()=>generate(mode,{...modes[mode].defaults,...patch}));
for(const mode of ["coaster","medal","magnet"]){
 const a=generate(mode,{...modes[mode].defaults,shape:"circle"});assert.equal(a.h,a.w);
 const b=generate(mode,{...modes[mode].defaults,shape:"rect"});assert.equal(b.h,modes[mode].defaults.h);
}
assert.throws(()=>generate("__proto__",{}));
const stand=generate("stand",{...modes.stand.defaults});
assert.equal(stand.parts,2);
assert.equal(stand.slotWidth,3.2);
assert.equal(stand.h,210);
assert(stand.svg.includes('id="FACE"'));
assert(stand.svg.includes('id="BASE"'));
assert(stand.faceSVG.includes('width="90mm"'));
assert(stand.baseSVG.includes('width="140mm"'));
assert(stand.baseSVG.includes('width="90.2"'));
assert(app.includes('id="ag-categories"'));
assert(app.includes('id="ag-face-download"'));
console.log("PASS: 10 generators, 3 categories, 18 invalid geometries, gift shapes, two-part stand, SVG units and build integration");

