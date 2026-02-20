// POST /api/shikaku/claim-initials
import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { validatePuzzleId, validateUUID, validateInitials } from '../../_shared/validation-helpers.js';
import { claimInitials } from '../../_shared/claim-helpers.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return methodNotAllowed('POST');
  try {
    validateEnv(env);
    const { puzzleId, anonId, initials } = await request.json();
    if (!validatePuzzleId(puzzleId)) return jsonError('Invalid puzzle ID format');
    if (!validateUUID(anonId)) return jsonError('Invalid anon ID');
    if (!validateInitials(initials)) return jsonError('Initials must be 1-3 uppercase letters');
    const result = await claimInitials(env.DB, 'shikaku_scores', puzzleId, anonId, initials);
    if (result.error) return jsonError(result.error, result.status);
    return jsonOk(result);
  } catch (err) {
    return internalError(err, 'Shikaku claim-initials');
  }
}
