// POST /api/pipes/complete - Submit completion time

import { getPTDateYYYYMMDD, validateUUID, validateEnv } from '../../_shared/snake-utils-server.js';

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
    const { puzzleId, anonId, timeMs, hintsUsed = 0 } = body;

    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(puzzleId)) {
      return new Response(JSON.stringify({ error: 'Invalid puzzle ID format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!validateUUID(anonId)) {
      return new Response(JSON.stringify({ error: 'Invalid anon ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (timeMs < 3000 || timeMs > 3600000) {
      return new Response(JSON.stringify({ error: 'Invalid time' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const existingScore = await env.DB.prepare(`
      SELECT time_ms FROM pipes_scores
      WHERE puzzle_id = ?1 AND anon_id = ?2
    `).bind(puzzleId, anonId).first();

    let userTime = timeMs;

    if (existingScore) {
      userTime = existingScore.time_ms;
    } else {
      await env.DB.prepare(`
        INSERT INTO pipes_scores (puzzle_id, anon_id, time_ms, hints_used)
        VALUES (?1, ?2, ?3, ?4)
      `).bind(puzzleId, anonId, timeMs, hintsUsed).run();
    }

    const fasterCountResult = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM pipes_scores
      WHERE puzzle_id = ?1 AND time_ms < ?2
    `).bind(puzzleId, userTime).first();

    const totalResult = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM pipes_scores
      WHERE puzzle_id = ?1
    `).bind(puzzleId).first();

    const fasterCount = fasterCountResult?.count || 0;
    const total = totalResult?.count || 1;
    const rank = fasterCount + 1;
    const percentile = Math.floor(((total - rank) / Math.max(total, 1)) * 100);

    return new Response(JSON.stringify({
      success: true,
      rank,
      percentile,
      total
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Pipes complete API error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
