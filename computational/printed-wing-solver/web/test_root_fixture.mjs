import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./wing_lab_template.html', import.meta.url), 'utf8');
const fixture = source.slice(source.indexOf('// Clamped root: a hatched backing plate'), source.indexOf('const loads = new THREE.Group();'));
assert.ok(fixture.includes('new THREE.LineSegments'), 'root support uses hatching');
assert.ok(fixture.includes('new THREE.BoxGeometry'), 'root support retains its plate');
assert.ok(!fixture.includes('ArrowHelper'), 'support must not look like an applied force');
assert.ok(source.includes('Clamped root · hatched support, not a force'), 'legend distinguishes support from load');
console.log('Root fixture: hatched support, no force arrows, explicit legend passed.');
