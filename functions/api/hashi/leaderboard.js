export async function onRequest(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    if (!env.DB) {
      throw new Error('Database binding (DB) not configured');
    }

    const url = new URL(request.url);
    const puzzleId = url.searchParams.get('puzzleId');

    if (!puzzleId) {
      return new Response(JSON.stringify({ error: 'Missing puzzleId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const top10Result = await env.DB.prepare(`
      SELECT time_ms, initials, hints_used
      FROM hashi_scores
      WHERE puzzle_id = ?1
      ORDER BY time_ms ASC
      LIMIT 10
    `).bind(puzzleId).all();

    const totalResult = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM hashi_scores
      WHERE puzzle_id = ?1
    `).bind(puzzleId).first();

    const top10 = (top10Result.results || []).map((row, idx) => ({
      rank: idx + 1,
      timeMs: row.time_ms,
      initials: row.initials || null,
      hintsUsed: row.hints_used
    }));

    return new Response(JSON.stringify({
      top10,
      total: totalResult?.count || 0
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Hashi leaderboard API error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
