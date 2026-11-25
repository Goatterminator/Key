// Builds artifact/index.html: the same app as index.html, as page content for a
// claude.ai artifact (the platform adds the <!doctype>/<head>/<body> skeleton itself).
//
//   node scripts/build-artifact.mjs
//
// Publish it with these files next to it: css/app.css, js/*.js, vendor/earcut.js.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1].trim();
const out = `${title}
<link rel="stylesheet" href="css/app.css">
${body}
`;
fs.mkdirSync(path.join(root, 'artifact'), { recursive: true });
fs.writeFileSync(path.join(root, 'artifact', 'index.html'), out);
console.log('artifact/index.html written');
