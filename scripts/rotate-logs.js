#!/usr/bin/env node

import { readdir, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function rotateLog({
  logPath,
  maxBytes = 5 * 1024 * 1024,
  retention = 7,
  now = new Date(),
}) {
  let details;
  try {
    details = await stat(logPath);
  } catch (error) {
    if (error.code === 'ENOENT') return { rotated: false, removed: [] };
    throw error;
  }
  if (details.size <= maxBytes) return { rotated: false, removed: [] };

  const directory = dirname(logPath);
  const name = basename(logPath);
  const timestamp = now.toISOString().replace(/[.:]/g, '-');
  const archivePath = `${logPath}.${timestamp}`;
  await rename(logPath, archivePath);

  const archives = (await readdir(directory))
    .filter((entry) => entry.startsWith(`${name}.`))
    .sort()
    .reverse();
  const removed = [];
  for (const archive of archives.slice(retention)) {
    const target = join(directory, archive);
    await unlink(target);
    removed.push(target);
  }

  return { archivePath, removed, rotated: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const logPath = process.argv[2];
  if (!logPath) throw new Error('Utilização: node scripts/rotate-logs.js <log>');
  await rotateLog({
    logPath,
    maxBytes: Number(process.env.DAILY_SYNC_LOG_MAX_BYTES ?? 5 * 1024 * 1024),
    retention: Number(process.env.DAILY_SYNC_LOG_RETENTION ?? 7),
  });
}
