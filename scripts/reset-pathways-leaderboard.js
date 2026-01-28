// Script to reset Pathways leaderboard for a specific date
// Usage: node scripts/reset-pathways-leaderboard.js [YYYY-MM-DD]
// If no date provided, uses today's date in Pacific Time

function getPTDateYYYYMMDD(now = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = dtf.formatToParts(now);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

const puzzleId = process.argv[2] || getPTDateYYYYMMDD();

console.log(`Resetting Pathways leaderboard for puzzle: ${puzzleId}`);
console.log('');
console.log('Run this SQL command in your Cloudflare D1 database:');
console.log('');
console.log(`DELETE FROM pathways_scores WHERE puzzle_id = '${puzzleId}';`);
console.log('');
console.log('To execute via wrangler:');
console.log(`npx wrangler d1 execute --remote --command="DELETE FROM pathways_scores WHERE puzzle_id = '${puzzleId}';"`);
