// GET /api/hashi/leaderboard?puzzleId=YYYY-MM-DD
import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { validatePuzzleId } from '../../_shared/validation-helpers.js';
import { fetchLeaderboard } from '../../_shared/leaderboard-helpers.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'GET') return methodNotAllowed('GET');
  try {
    validateEnv(env);
    const puzzleId = new URL(request.url).searchParams.get('puzzleId');
    if (!validatePuzzleId(puzzleId)) return jsonError('Invalid or missing puzzleId');
    const data = await fetchLeaderboard(env.DB, 'hashi_scores', puzzleId);
    return jsonOk(data);
  } catch (err) {
    return internalError(err, 'Hashi leaderboard');
  }
}
