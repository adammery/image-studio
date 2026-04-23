/**
 * Usage: node inline-image.mjs <staging-dir>
 *
 * Rewrites <staging-dir>/README.md to inline the screenshot as a base64
 * data URI. Called by package.sh after staging. Leaves the source
 * README alone so the repo stays readable.
 */
import fs from 'node:fs';
import path from 'node:path';

const stageDir = process.argv[2];
if (!stageDir) {
  console.error('Usage: node inline-image.mjs <staging-dir>');
  process.exit(1);
}

const imgPath = path.join(stageDir, 'media', 'screenshot.png');
const readmePath = path.join(stageDir, 'README.md');

const b64 = fs.readFileSync(imgPath).toString('base64');
const dataUri = `data:image/png;base64,${b64}`;

let readme = fs.readFileSync(readmePath, 'utf8');
readme = readme.replace(
  /!\[Image Studio[^\]]*\]\([^)]+\)/,
  `![Image Studio — editing a PNG with the compare slider active](${dataUri})`
);
fs.writeFileSync(readmePath, readme);
console.log(`  └─ README image inlined (${Math.round(b64.length / 1024)} KB base64)`);
