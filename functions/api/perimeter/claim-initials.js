import { validateUUID, validateEnv } from '../../_shared/snake-utils-server.js';

export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    validateEnv(env);

    const body = await request.json();
    const { puzzleId, anonId, initials } = body;

    if (!validateUUID(anonId)) {
      return new Response(JSON.stringify({ error: 'Invalid anon ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!initials || initials.length > 3 || !/^[A-Z]{1,3}$/.test(initials)) {
      return new Response(JSON.stringify({ error: 'Initials must be 1-3 uppercase letters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const scoreCheck = await env.DB.prepare(`
      SELECT created_at
      FROM perimeter_scores
      WHERE puzzle_id = ?1 AND anon_id = ?2
    `).bind(puzzleId, anonId).first();

    if (!scoreCheck) {
      return new Response(JSON.stringify({ error: 'Score not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const scoreTime = new Date(scoreCheck.created_at).getTime();
    const now = Date.now();
    if (now - scoreTime > 600000) {
      return new Response(JSON.stringify({ error: 'Claim window expired (10 minutes)' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const updateResult = await env.DB.prepare(`
      UPDATE perimeter_scores
      SET initials = ?1
      WHERE puzzle_id = ?2 AND anon_id = ?3
    `).bind(initials, puzzleId, anonId).run();

    if ((updateResult.meta?.changes || 0) === 0) {
      return new Response(JSON.stringify({ error: 'Failed to update initials' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Initials claimed successfully'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Perimeter claim initials API error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
