import { createHash } from 'node:crypto';

const FAILED_STATUSES = new Set(['rejected', 'error']);

function stableHash(candidate) {
  return createHash('sha256')
    .update(`${candidate.externalId}:${candidate.url}`)
    .digest('hex');
}

function hasChanged(candidate, previous) {
  return (
    candidate.url !== previous.url ||
    (candidate.lastModified !== null &&
      candidate.lastModified !== previous.lastModified)
  );
}

export function classifyCandidates(candidates, state) {
  return candidates.map((candidate) => {
    const previous = state?.products?.[candidate.externalId] ?? null;
    let status = 'unchanged';

    if (!previous) status = 'new';
    else if (hasChanged(candidate, previous)) status = 'changed';

    return {
      candidate,
      status,
      failedPreviously: previous ? FAILED_STATUSES.has(previous.status) : false,
    };
  });
}

export function selectIncrementalCandidates(
  candidates,
  state,
  { forceAll = false, retryFailed = false, sample = false } = {},
) {
  const classified = classifyCandidates(candidates, state);
  const selected = classified.filter(
    ({ status, failedPreviously }) =>
      forceAll ||
      status === 'new' ||
      status === 'changed' ||
      (retryFailed && failedPreviously),
  );

  selected.sort((left, right) => {
    if (retryFailed && left.failedPreviously !== right.failedPreviously) {
      return left.failedPreviously ? -1 : 1;
    }
    if (sample) {
      return stableHash(left.candidate).localeCompare(stableHash(right.candidate));
    }

    const leftDate = left.candidate.lastModified ?? '';
    const rightDate = right.candidate.lastModified ?? '';
    return rightDate.localeCompare(leftDate);
  });

  return {
    candidates: selected.map(({ candidate }) => candidate),
    stats: {
      discovered: classified.length,
      new: classified.filter(({ status }) => status === 'new').length,
      changed: classified.filter(({ status }) => status === 'changed').length,
      unchanged: classified.filter(({ status }) => status === 'unchanged').length,
      previouslyFailed: classified.filter(({ failedPreviously }) => failedPreviously)
        .length,
      eligible: selected.length,
    },
  };
}
