// Immutable course-interface snapshot, not a regenerated build or a claimed v1.0 package tag.
// Source: b9049b490c27eca6d4b4abbbb7d2d6de7a67e92c:docs/wing-lab.html
// Original Git blob: 5225a38e5be900684b6084cccb5728b9ef97ed0d.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const page=readFileSync(new URL('../../../docs/wing-lab-v1.html',import.meta.url),'utf8').replace(/\r\n?/g,'\n');
assert.equal(Buffer.byteLength(page,'utf8'),1359098,'legacy page preserves the complete original standalone artifact');
assert.equal(createHash('sha256').update(page,'utf8').digest('hex'),'135f7703ace205aa1b9a92ae1cd9ddb7058dd6d8b1eb34a52ed6b8743bb17ff2','v1 page must remain byte-identical to its source after LF normalization');
const readme=readFileSync(new URL('../../../README.md',import.meta.url),'utf8');
for(const link of ['https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab.html#wing','https://ehsan-roohi.github.io/Aerospace-Structures/wing-lab-v1.html#wing','https://colab.research.google.com/github/Ehsan-Roohi/Aerospace-Structures/blob/v1.3.1/notebooks/MIE446_Code_to_Print_Wing.ipynb'])assert.ok(readme.slice(0,readme.indexOf('## Course information')).includes(link),'version and matching-notebook links appear at the top of the course README');
console.log('Wing v1 snapshot PASS: exact b9049b4 artifact SHA-256 after LF normalization; distinct v1/v1.3 and pinned matching-notebook links.');
