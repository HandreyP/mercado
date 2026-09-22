import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const sourceRoot = path.resolve('src');

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return javascriptFiles(target);
      return entry.name.endsWith('.js') ? [target] : [];
    }),
  );
  return nested.flat();
}

test('todo o SQL e acesso ao driver ficam em ficheiros *.repository.js', async () => {
  const violations = [];
  for (const file of await javascriptFiles(sourceRoot)) {
    const relative = path.relative(sourceRoot, file);
    const source = await readFile(file, 'utf8');
    const accessesDatabase = /\.query\s*\(|from ['"]pg['"]/.test(source);
    if (accessesDatabase && !relative.endsWith('.repository.js')) {
      violations.push(relative);
    }
  }

  assert.deepEqual(violations, []);
});

test('URLs e regras de cada mercado ficam no respetivo *.scrap.js', async () => {
  const violations = [];
  for (const file of await javascriptFiles(sourceRoot)) {
    const relative = path.relative(sourceRoot, file);
    const source = await readFile(file, 'utf8');
    if (/pingodoce\.pt/.test(source) && !relative.endsWith('.scrap.js')) {
      violations.push(relative);
    }
  }

  assert.deepEqual(violations, []);
});

test('os pontos de extensão seguem os nomes acordados', async () => {
  await assert.doesNotReject(() =>
    access(path.join(sourceRoot, 'scrapers', 'mercado_pingo_doce.scrap.js')),
  );
  await assert.doesNotReject(() =>
    access(path.join(sourceRoot, 'repositories', 'database.repository.js')),
  );
});
