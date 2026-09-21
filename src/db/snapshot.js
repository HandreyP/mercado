import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export function validateSnapshot(snapshot) {
  const errors = [];
  if (snapshot?.schemaVersion !== 1) errors.push('schemaVersion deve ser 1');
  if (!snapshot?.market?.id) errors.push('market.id em falta');
  if (!snapshot?.market?.name) errors.push('market.name em falta');
  if (!snapshot?.finishedAt) errors.push('finishedAt em falta');
  if (!Array.isArray(snapshot?.products)) errors.push('products deve ser uma lista');
  if (!Array.isArray(snapshot?.rejected)) errors.push('rejected deve ser uma lista');

  if (errors.length > 0) {
    throw new Error(`Snapshot inválido: ${errors.join('; ')}`);
  }
  return snapshot;
}

export async function readSnapshot(filePath) {
  const absolutePath = path.resolve(filePath);
  const source = await readFile(absolutePath, 'utf8');
  let snapshot;
  try {
    snapshot = JSON.parse(source);
  } catch (error) {
    throw new Error(`JSON inválido em ${absolutePath}`, { cause: error });
  }

  return {
    absolutePath,
    hash: createHash('sha256').update(source).digest('hex'),
    snapshot: validateSnapshot(snapshot),
  };
}
