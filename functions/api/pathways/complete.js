// POST /api/pathways/complete
import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { validatePuzzleId, validateTimeMs, validateUUID } from '../../_shared/validation-helpers.js';
import { submitAndRank } from '../../_shared/complete-helpers.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return methodNotAllowed('POST');
  try {
    validateEnv(env);
    const { puzzleId, anonId, timeMs, hintsUsed = 0 } = await request.json();
    if (!validatePuzzleId(puzzleId)) return jsonError('Invalid puzzle ID format');
    if (!validateUUID(anonId)) return jsonError('Invalid anon ID');
    if (!validateTimeMs(timeMs)) return jsonError('Invalid time');
    const result = await submitAndRank(env.DB, 'pathways_scores', puzzleId, anonId, timeMs, hintsUsed);
    return jsonOk({ success: true, ...result });
  } catch (err) {
    return internalError(err, 'Pathways complete');
  }
}
