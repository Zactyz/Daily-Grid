// POST /api/perimeter/complete
import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { validatePuzzleId, validateTimeMs, validateUUID } from '../../_shared/validation-helpers.js';
import { submitAndRank, resolveSubmitUserId } from '../../_shared/complete-helpers.js';

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
    const userId = await resolveSubmitUserId(env.DB, request);
    const result = await submitAndRank(env.DB, 'perimeter_scores', puzzleId, anonId, timeMs, hintsUsed, userId);
    return jsonOk({ success: true, ...result });
  } catch (err) {
    return internalError(err, 'Perimeter complete');
  }
}
