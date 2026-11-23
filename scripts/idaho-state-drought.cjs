/** Assemble the Idaho-wide USDM overlay from the validated, dated unit map assets. */
const fs = require('node:fs');
const path = require('node:path');
const directory = 'public/idaho-visual';
const files = fs.readdirSync(directory).filter(name => name.endsWith('.json'));
if (files.length !== 100) throw Error(`Expected 100 unit layers, got ${files.length}`);
const features = files.flatMap(name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')).drought.features);
features.sort((a, b) => a.properties.level - b.properties.level);
const date = require('../data/id-visual-meta.json').droughtDate.replaceAll('-', '');
fs.writeFileSync(`public/idaho-drought-${date}.json`, JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`Idaho game-unit drought layer: ${features.length} features`);
