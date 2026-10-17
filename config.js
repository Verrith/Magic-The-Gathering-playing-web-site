// Configure with the Supabase project URL and anon/publishable key to enable rooms.
// This key is public; never put a service_role key in browser code.
window.MTG_TABLE_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  // URL of the optional Cloudflare Worker in worker/wrangler.toml.
  // Example: https://mtg-moxfield-proxy.<your-subdomain>.workers.dev/api/decks
  moxfieldProxyUrl: '',
  // Optional WebRTC relay servers (TURN), needed on some restrictive networks.
  // Example: [{ urls: 'turn:turn.example.com:443', username: '...', credential: '...' }]
  // Public TURN credentials belong here only if they are intended to be public.
  iceServers: []
};
