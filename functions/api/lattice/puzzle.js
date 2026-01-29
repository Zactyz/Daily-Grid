// GET /api/pathways/puzzle - Get today's puzzle (cached in KV)

import { getPTDateYYYYMMDD } from '../../_shared/snake-utils-server.js';

// Import puzzle generator (client-side generation, server caches)
// For server-side, we'll use a simplified version or cache client-generated puzzles

export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=3600',
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
    const today = getPTDateYYYYMMDD();
    const cacheKey = `pathways_puzzle:${today}`;
    
    // Try to get from KV cache first
    if (env.PUZZLE_CACHE) {
      const cached = await env.PUZZLE_CACHE.get(cacheKey, 'json');
      if (cached) {
        return new Response(JSON.stringify(cached), {
          status: 200,
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'X-Cache': 'HIT'
          }
        });
      }
    }
    
    // For Pathways, puzzle generation happens client-side
    // Server just caches the result
    // Return a placeholder that tells client to generate
    // Or we could generate server-side too, but client-side is simpler
    
    // Actually, let's return a simple response indicating client should generate
    // The client will generate and can optionally cache server-side later
    const response = {
      id: today,
      clientGenerate: true
    };
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'X-Cache': 'MISS'
      }
    });

  } catch (error) {
    console.error('Puzzle API error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get puzzle' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
