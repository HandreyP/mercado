import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

function safeTimestamp(isoTimestamp) {
  return isoTimestamp.replace(/[:.]/g, '-');
}

export async function writeCollectionSnapshot(
  collection,
  { outputDirectory = 'data' } = {},
) {
  const directory = path.join(outputDirectory, collection.market.id, 'products');
  const fileName = `${safeTimestamp(collection.finishedAt)}.json`;
  const target = path.join(directory, fileName);
  const temporary = `${target}.${process.pid}.tmp`;

  await mkdir(directory, { recursive: true });
  await writeFile(temporary, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');
  await rename(temporary, target);

  return path.resolve(target);
}
