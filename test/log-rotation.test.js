import assert from 'node:assert/strict';
import { access, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { rotateLog } from '../scripts/rotate-logs.js';

test('roda o log acima do limite e conserva apenas os arquivos mais recentes', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'mercado-logs-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const logPath = join(directory, 'daily-sync.log');
  await writeFile(logPath, '1234567890');
  await writeFile(`${logPath}.2026-09-20T00-00-00-000Z`, 'oldest');
  await writeFile(`${logPath}.2026-09-21T00-00-00-000Z`, 'older');

  const result = await rotateLog({
    logPath,
    maxBytes: 5,
    retention: 2,
    now: new Date('2026-09-23T03:00:00.000Z'),
  });

  assert.equal(result.rotated, true);
  await assert.rejects(access(logPath), { code: 'ENOENT' });
  assert.deepEqual((await readdir(directory)).sort(), [
    'daily-sync.log.2026-09-21T00-00-00-000Z',
    'daily-sync.log.2026-09-23T03-00-00-000Z',
  ]);
});

test('mantém um log abaixo do limite', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'mercado-logs-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const logPath = join(directory, 'daily-sync.log');
  await writeFile(logPath, 'small');

  const result = await rotateLog({ logPath, maxBytes: 100, retention: 2 });

  assert.deepEqual(result, { rotated: false, removed: [] });
  await assert.doesNotReject(access(logPath));
});
