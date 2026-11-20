import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [html, app, contentSource, geoSource, styles, workflow] = await Promise.all([
  read('index.html'), read('js/app.js'), read('data/content.js'), read('data/governorates.js'), read('css/styles.css'), read('.github/workflows/pages.yml')
]);

assert.match(html, /<html lang="ar" dir="rtl">/);
for (const path of ['css/styles.css', 'js/app.js', 'data/content.js', 'data/governorates.js', 'assets/icon.svg']) {
  assert.ok(html.includes(path), `index.html references ${path}`);
}
assert.match(app, /localStorage/);
assert.match(styles, /prefers-reduced-motion/);
assert.match(styles, /@media\(max-width:760px\)/);
assert.match(workflow, /actions\/checkout@v6/);
assert.match(workflow, /actions\/configure-pages@v5/);
assert.match(workflow, /actions\/upload-pages-artifact@v4/);
assert.match(workflow, /actions\/deploy-pages@v4/);

new vm.Script(app); // Syntax check without running browser-only code.
const scope = {window: {}};
vm.runInNewContext(contentSource, scope);
const content = scope.window.IRAQ_CONTENT;
const geoContext = {window: {}};
vm.runInNewContext(geoSource, geoContext);
const geo = geoContext.window.IRAQ_GEOJSON;

assert.equal(geo.type, 'FeatureCollection');
assert.equal(geo.features.length, 18, 'boundary source snapshot contains 18 features');
const sourceNames = new Set(geo.features.map(feature => feature.properties.nameAr));
assert.equal(sourceNames.size, 18, 'Arabic map names are unique');
for (const feature of geo.features) {
  assert.ok(feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon');
  assert.ok(feature.properties.shapeName && feature.properties.nameAr);
}
for (const gov of content.governorates) assert.ok(sourceNames.has(gov.ar), `boundary exists for ${gov.ar}`);

assert.ok(content.crops.length >= 20, 'the encyclopedia includes the requested crop families');
const cropIds = new Set(content.crops.map(crop => crop.id));
assert.equal(cropIds.size, content.crops.length, 'crop IDs are unique');
const required = ['wheat','barley','rice','yellow-corn','sunflower','sesame','groundnut','vegetables','fruit-citrus','date-palm','cotton','tobacco','tanbak','sugar-beet','sugarcane','alfalfa','clover','straw'];
for (const id of required) assert.ok(cropIds.has(id), `required crop exists: ${id}`);
for (const crop of content.crops) for (const gov of crop.mapGov) assert.ok(content.governorates.some(item => item.id === gov), `${crop.name} references a known governorate`);
for (const fact of content.facts) assert.ok(['2018','2019'].includes(fact.year), `${fact.crop} has an explicit historical year`);
for (const [crop,year,value,unit] of [['القمح المطري','2019',947,'ألف طن'],['الشعير المطري','2019',1273,'ألف طن'],['القمح الإروائي','2019',3396,'ألف طن'],['الرز','2018',18,'ألف طن'],['النخيل','2018',646,'ألف طن']]) {
  assert.ok(content.facts.some(fact => fact.crop===crop && fact.year===year && fact.value===value && fact.unit===unit), `${crop} preserves its source value and year`);
}
assert.ok(content.quiz.length >= 5);
assert.ok(content.scenarios.length >= 4);
assert.ok(content.glossary.length >= 8);
assert.match(html, /حلبجة/);
assert.match(html, /2022/);

console.log(`PASS: HTML references, RTL shell, responsive/reduced-motion styling, workflow, JavaScript syntax, ${content.crops.length} crop records, ${geo.features.length} dated map features, historical data years, and learning activities.`);
