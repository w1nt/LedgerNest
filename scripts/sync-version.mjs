import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = readFileSync(resolve(root, 'VERSION'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+(?:-SNAPSHOT)?$/.test(version)) throw new Error('Invalid VERSION');
const check = process.argv.includes('--check');
function update(path, transform) {
  const file = resolve(root, path);
  const original = readFileSync(file, 'utf8');
  const next = transform(original);
  if (next !== original) {
    if (check) throw new Error(`Version out of sync: ${path}`);
    writeFileSync(file, next);
  }
}
for (const path of ['package.json', 'package-lock.json', 'frontend/my-react-app/package.json', 'frontend/my-react-app/package-lock.json']) {
  update(path, text => {
    const data = JSON.parse(text);
    data.version = version;
    if (data.packages?.['']) data.packages[''].version = version;
    return JSON.stringify(data, null, 2) + '\n';
  });
}
update('backend/SpringBoot_demo/pom.xml', text => {
  const pattern = /(<artifactId>SpringBoot_demo<\/artifactId>\s*<version>)[^<]+(<\/version>)/;
  if (!pattern.test(text)) throw new Error('Backend project version not found');
  return text.replace(pattern, (_, before, after) => before + version + after);
});
update('frontend/my-react-app/index.html', text => {
  const pattern = /<!-- (?:前端|项目统一)版本：[^\r\n]*?-->/;
  if (!pattern.test(text)) throw new Error('HTML version marker not found');
  return text.replace(pattern, `<!-- 项目统一版本：${version}；以根目录 VERSION 为准。 -->`);
});
console.log(`Project version ${version}: ${check ? 'verified' : 'synchronized'}`);
