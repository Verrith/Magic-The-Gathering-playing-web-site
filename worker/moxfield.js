const allowedOrigins = new Set([
  'https://verrith.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
]);

function json(body, status, origin) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60',
    'X-Content-Type-Options': 'nosniff',
  });
  if (origin && allowedOrigins.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin');
    if (request.method === 'OPTIONS') {
      if (!origin || !allowedOrigins.has(origin)) return new Response(null, { status: 403 });
      const headers = new Headers({
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Accept, Content-Type',
        'Access-Control-Max-Age': '86400',
      });
      if (origin) {
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Vary', 'Origin');
      }
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, origin);
    if (!origin || !allowedOrigins.has(origin)) return json({ error: 'Origin not allowed.' }, 403, origin);

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/decks\/([\w-]{6,80})\/?$/);
    if (!match) return json({ error: 'Expected /api/decks/{public-deck-id}.' }, 400, origin);

    try {
      // Moxfield does not expose browser CORS access to its deck API. This narrow
      // relay fetches one public deck by ID; it never accepts arbitrary URLs or
      // handles room/game state. The game itself remains peer-to-peer.
      const upstream = await fetch(`https://api2.moxfield.com/v3/decks/all/${encodeURIComponent(match[1])}`, {
        headers: {
          Accept: 'application/json',
          Origin: 'https://moxfield.com',
          Referer: 'https://moxfield.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
        },
        cf: { cacheTtl: 60, cacheEverything: true },
      });
      if (upstream.status === 404) return json({ error: 'Deck Moxfield introuvable ou privé.' }, 404, origin);
      if (!upstream.ok) return json({ error: `Moxfield a refusé l’accès (HTTP ${upstream.status}). Vérifie que le deck est public.` }, 502, origin);
      const deck = await upstream.json();
      if (!deck || !deck.boards) return json({ error: 'Réponse Moxfield invalide.' }, 502, origin);
      return json({ deck }, 200, origin);
    } catch {
      return json({ error: 'Moxfield ne répond pas. Réessaie dans quelques instants.' }, 502, origin);
    }
  },
};
