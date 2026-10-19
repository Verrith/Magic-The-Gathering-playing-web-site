# MTG Table

A static, peer-to-peer Magic: The Gathering tabletop. Players connect directly through WebRTC, share public game state with Yjs, and use Scryfall for card data and images. No account or game server is required.

## Run locally

Requirements: Node.js 20+ and npm.

```sh
npm install
npm run dev
```

Open the printed URL in two browser tabs. In the first tab, click **New room**, choose Standard or Commander, and copy the invite link. Open it in the second tab, load a deck in each tab, and click **Ready up** in both. Rooms support up to four players and share the chosen format and starting life total: Standard starts everyone at 20 life; Commander starts everyone at 40 and moves the first card in the imported list into the Command Zone. The board seats follow join order: first at upper left, second below, third to the right of the first, fourth below the third. Drag cards anywhere on the shared table, including outside your own board; each player's board color affects its felt, frame, and life panel. Click anywhere on the blue library pile to draw one card; right-click it to browse the deck or open the library actions. For local testing both clients can share the same browser `localStorage`; the app independently shuffles each loaded deck when entering a room.

Deck import accepts one card per line (`Lightning Bolt`) or quantities (`4x Lightning Bolt`, `4 x Lightning Bolt`, or `4 Lightning Bolt`). A 60-card list is recommended for Standard and 100 cards for Commander. Card names are looked up through Scryfall; unmatched names are shown in the import review UI. For Commander, the first parsed card is the commander even when the export does not label a Commander section; one copy is removed from the library.

The Moxfield importer accepts a public deck URL and uses Moxfield's selected printing and card data. Art is loaded by that printing's Scryfall UUID: Moxfield's CDN face IDs can resolve to an unrelated card (for example, Ultimecia's face ID returned Gilt-Leaf Seer). Existing imported decks are corrected locally when the app loads, and importing the same Moxfield link updates that saved deck. The import works on GitHub Pages out of the box through the public `cors.tools` GET relay because Moxfield does not permit direct browser reads from another origin. Only the public Moxfield deck URL is sent to that relay; room discovery and all game state remain P2P. The free relay has response/time limits and is an external dependency. For a self-hosted relay, the repository also includes a narrow Cloudflare Worker in `worker/`.

### Optional: use your own Moxfield relay

GitHub Pages cannot run server functions. The default importer uses `cors.tools` and needs no setup. To avoid relying on that public relay, deploy the included Worker once, then point the static app at it:

```sh
npx wrangler@4 deploy --config worker/wrangler.toml
```

Wrangler prints a `workers.dev` URL. Copy that URL and add `/api/decks` to it in `config.js`, for example:

```js
moxfieldProxyUrl: 'https://mtg-moxfield-proxy.<your-subdomain>.workers.dev/api/decks'
```

Commit and push the `config.js` change to redeploy GitHub Pages. For local development, run `npx wrangler@4 dev --config worker/wrangler.toml --port 8787`, set the URL to `http://localhost:8787/api/decks`, then start Vite in another terminal. The Worker only accepts deck IDs (never arbitrary URLs), caches public responses briefly, and has no credentials or game logic. If Moxfield changes or blocks its undocumented API, it returns a clear error; the TXT deck-list import continues to work.

## Playing

- All joined players ready to start (two to four players). The initial active player is chosen deterministically from the seat join time.
- Play a creature or permanent by clicking it in your hand. Click an instant or sorcery to put it on the shared stack, then use **Pass** to resolve the LIFO stack when both players pass.
- Turn phases are Untap, Upkeep, Main 1, Combat, Main 2, and End. Pass priority twice to advance. A card is drawn at the beginning of later turns.
- In Combat, the active player clicks their creatures to declare attackers, then finishes attackers. The defending player clicks untapped creatures to assign blockers and finishes blockers. Combat damage is simultaneous; lethal creatures go to their owners' graveyards and unblocked damage reduces life.
- Adjust life with the table controls. Reaching zero life ends the game. Shared actions appear in the log.
- Right-click a card for zone, tap, counter, copy, and card detail actions. The opponent's hand is hidden; library, graveyard, and exile counts are public.
- Aura-style shortcuts work while hovering one of your cards: `Space` tap, `X` untap all, `Z` summoning-sick marker, `F` flip / face down, `U` and `I` counters, `K` clone, `Backspace` delete, `H` hand, `D` discard, `S` exile, `T` / `Y` library top / bottom, and `B` sideboard. The same actions and keys appear in the card's right-click menu. Double-faced Moxfield cards keep both printing-specific face images and `F` switches between them.
- Right-click an empty area of the playmat for Aura-style board actions: `C` draw, `A` add a card by name, `X` untap all, and `U` / `I` create draggable +1/+1 or -1/-1 counters. Open **Keyword counters** to place other markers, then drag a marker onto a permanent to apply it.
- Click or right-click the library, graveyard, or exile pile to search and browse that zone. Graveyard and exile cards are face-up; hover one and press `H` for hand, `S` for exile, `D` for graveyard, or `T` / `Y` for the top / bottom of the library.
- Open another player's graveyard from their seat to inspect its public cards. Request access before viewing their library; selecting a card from either zone sends its owner an approval prompt. Accepted cards move into the requester's hand.

This is a tabletop helper, not a full rules engine: spell effects, targeting, replacement effects, priority responses, and complex combat rules are not automatically enforced. Resolve printed card effects manually. The simplified stack tracks spells and resolves them last-in, first-out to their owner's graveyard.

## Architecture

```text
┌─────────────────────┐     WebRTC data channels     ┌─────────────────────┐
│ Browser A           │◄────────────────────────────►│ Browser B           │
│ React-free existing │       y-webrtc signaling     │ same static app     │
│ HTML/CSS/JS table   │       (room discovery only)  │                     │
│                     │                               │                     │
│ local private zones │       Yjs shared document    │ local private zones │
│ hand + library      │◄────────────────────────────►│ hand + library      │
│                     │   life, public cards, turns, │                     │
│                     │   stack, readiness, action log│                    │
└─────────────────────┘                               └─────────────────────┘
         │                                                       │
         └────────── Scryfall API / image CDN ──────────────────┘
```

The app keeps the existing vanilla HTML/CSS/JavaScript interface and adds Vite only for bundling Yjs and `y-webrtc`. A room ID is stored in `?room=...`; the `y-webrtc` provider uses `wss://y-webrtc-signaling.fly.dev` only to find peers and exchange WebRTC setup messages, then Yjs synchronizes the document over WebRTC. Signaling does not run game logic. Private hands and libraries remain in each browser; public battlefield cards, zone counts, life, readiness, turn/priority, stack, and the log are shared. Peer awareness reports connections and disconnects. Leaving destroys the local provider; a room with no remaining peers has no persistent state. The optional Cloudflare Worker is used only when importing Moxfield deck links.

### WebRTC relay for friends on restrictive networks

GitHub Pages can host the app, but it cannot relay WebRTC traffic. STUN is enough on many home networks; some school, work, mobile, or strict NAT networks also need a TURN relay. In that case, create TURN credentials with a provider such as [Metered Open Relay](https://www.metered.ca/tools/openrelay/) and add the provider's `iceServers` array to `config.js`:

```js
iceServers: [
  { urls: 'turn:your-turn-host:443', username: 'YOUR_USERNAME', credential: 'YOUR_CREDENTIAL' }
]
```

The TURN credentials in `config.js` are shipped to every browser, so use credentials intended for public client apps (ideally short-lived credentials), never an account password or secret key. The game still uses end-to-end encrypted WebRTC data channels; TURN only relays packets when a direct path cannot be made. Without a usable TURN service, some pairs of networks will be unable to join the same room regardless of the GitHub Pages deployment.

## Build and deploy

```sh
npm run build
npm run preview
```

The Vite build uses the repository path `/Magic-The-Gathering-playing-web-site/` for GitHub Pages. The workflow in `.github/workflows/pages.yml` builds and deploys the static `dist/` directory on pushes to `main`. For a different host/path, adjust the `--base` value in `package.json`.

No database, environment variables, cookies, or authentication are used by the P2P game runtime. The legacy `supabase/` and `config*.js` files are not loaded by the app.

## Existing table tools

Deck import review, local deck storage, commander/reserve zones, card details, counters, tokens, dice, playmat pan/zoom, and card context actions from the original table remain available. Local decks are stored in browser `localStorage`; only the live room state is transient.
