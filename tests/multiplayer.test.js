import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as Y from 'yjs';

const STORE = 'mtg-table-state-v1';
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replaceAll('import.meta.env', '({ BASE_URL: "./" })');

function storage(entries = []) {
  const values = new Map(entries);
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    entries: () => [...values],
  };
}

// Run the actual application closure. Only browser rendering and timers are
// stubbed; mutations, serialization, storage and Yjs observers stay real.
function client({ local = storage(), session = storage(), reload = false, search = '?room=TESTROOM' } = {}) {
  const elements = new Map();
  const context = vm.createContext({
    Y, crypto: { randomUUID }, URL, URLSearchParams,
    localStorage: local, sessionStorage: session,
    location: { search, host: 'localhost', pathname: '/' },
    performance: { getEntriesByType: () => [{ type: reload ? 'reload' : 'navigate' }] },
    window: { addEventListener() {} },
    document: {
      readyState: 'loading', addEventListener() {},
      querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, { style: {} });
        return elements.get(selector);
      },
    },
    setInterval() {}, setTimeout() {}, clearTimeout() {},
  });
  const bridge = `
    render=()=>{};renderLog=()=>{};toast=()=>{};updateConnectionStatus=()=>{};
    globalThis.app={
      localPlayerId, playerSession, state:()=>state, save, publicCard,
      toggleCardTap, toggleHovered, untapLocal, toggleAttacker, refreshP2P,
      connect(doc){
        p2pDoc=doc;sharedPlayers=doc.getMap('players');sharedCards=doc.getMap('public-cards');
        sharedGame=doc.getMap('game');sharedLog=doc.getArray('log');
        p2pProvider={awareness:{getStates:()=>new Map([...sharedPlayers.keys()].map(pid=>[pid,{player:{id:pid}}]))}};
        room={code:'TESTROOM',userId:localPlayerId,format:'Standard',players:[],game:{}};
        state.roomFormat='Standard';
        sharedPlayers.observeDeep(refreshP2P);sharedCards.observe(refreshP2P);sharedGame.observe(refreshP2P);
        refreshP2P();
      }
    };
  `;
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `${bridge}\n})();`), context);
  return { ...context.app, local, session };
}

function table() {
  const app = client();
  const doc = new Y.Doc();
  // Yjs checks plain-object constructors. Normalize VM-realm JSON at the
  // boundary so it sees the same values it would receive in a browser realm.
  for (const name of ['public-cards', 'game']) {
    const map = doc.getMap(name), set = map.set.bind(map);
    map.set = (key, value) => set(key, value && typeof value === 'object' ? structuredClone(value) : value);
  }
  const log = doc.getArray('log'), push = log.push.bind(log);
  log.push = values => push(structuredClone(values));
  const players = doc.getMap('players');
  for (const pid of [app.localPlayerId, 'opponent']) {
    const player = new Y.Map();
    player.set('life', 20);player.set('joinedAt', pid === 'opponent' ? 2 : 1);
    players.set(pid, player);
  }
  app.connect(doc);
  return { app, doc, cards: doc.getMap('public-cards'), game: doc.getMap('game') };
}

function creature(app, overrides = {}) {
  return { id: randomUUID(), name: 'Test creature', type: 'Creature',
    ownerId: app.localPlayerId, originalOwnerId: app.localPlayerId,
    controllerId: app.localPlayerId, zone: 'battlefield', x: 20, y: 30,
    power: '2', toughness: '2', tapped: false, ...overrides };
}

test('tapping a stale card preserves the latest shared position and controller', () => {
  const { app, cards } = table();
  const old = creature(app);
  cards.set(old.id, old);
  cards.set(old.id, { ...old, x: 85, y: 60, controllerId: 'opponent', counters: 3, customState: 'keep' });
  app.toggleCardTap(old);
  const current = cards.get(old.id);
  assert.equal(current.tapped, true);
  assert.equal(current.x, 85);
  assert.equal(current.y, 60);
  assert.equal(current.controllerId, 'opponent');
  assert.equal(current.ownerId, app.localPlayerId);
  assert.equal(current.counters, 3);
  assert.equal(current.customState, 'keep');
});

test('a stale click cannot bring a moved or deleted card back onto the battlefield', () => {
  const { app, cards } = table();
  const old = creature(app);
  cards.set(old.id, { ...old, zone: 'graveyard' });
  app.toggleCardTap(old);
  assert.equal(cards.get(old.id).zone, 'graveyard');
  cards.delete(old.id);
  app.toggleCardTap(old);
  assert.equal(cards.has(old.id), false);
});

test('untap all updates every controlled card without changing the opponent cards', () => {
  const { app, cards } = table();
  const own = [creature(app, { tapped: true }), creature(app, { tapped: true })];
  const other = creature(app, { tapped: true, controllerId: 'opponent' });
  for (const card of [...own, other]) cards.set(card.id, card);
  app.untapLocal();
  for (const card of own) assert.equal(cards.get(card.id).tapped, false);
  assert.equal(cards.get(other.id).tapped, true);
});

test('-1/-1 counters survive publication and synchronization to another Yjs document', () => {
  const { app, cards, doc } = table();
  const card = creature(app);
  cards.set(card.id, card);
  app.toggleHovered('minus-counter+', card.id);
  const peerDoc = new Y.Doc();
  Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(doc));
  assert.equal(peerDoc.getMap('public-cards').get(card.id).minusCounters, 1);
  assert.equal(app.publicCard(cards.get(card.id), 'graveyard').minusCounters, 1);
  app.toggleHovered('minus-counter-', card.id);
  assert.equal(cards.get(card.id).minusCounters, 0);
});

test('an attacker can be withdrawn after tapping, preserving its latest position', () => {
  const { app, cards, game } = table();
  const old = creature(app);
  cards.set(old.id, { ...old, x: 75 });
  app.toggleAttacker(old);
  assert.equal(cards.get(old.id).x, 75);
  assert.equal(cards.get(old.id).attacking, true);
  assert.equal(cards.get(old.id).tapped, true);
  assert.deepEqual(Array.from(game.get('combatAttackers')), [old.id]);
  app.toggleAttacker(cards.get(old.id));
  assert.equal(cards.get(old.id).attacking, false);
  assert.equal(cards.get(old.id).tapped, false);
  assert.equal(game.get('combatAttackers').length, 0);
});

test('two tabs joining the same room receive independent player identities', () => {
  const local = storage();
  const first = client({ local });
  const second = client({ local });
  assert.notEqual(first.localPlayerId, second.localPlayerId);
  assert.equal(second.playerSession.rejoinedRoom, '');
});

test('a tapped non-attacker cannot attack and another player cannot declare my creature', () => {
  const { app, cards, game } = table();
  const tapped = creature(app, { tapped: true });
  const other = creature(app, { controllerId: 'opponent' });
  for (const card of [tapped, other]) {
    cards.set(card.id, card);
    app.toggleAttacker(card);
    assert.equal(!!cards.get(card.id).attacking, false);
  }
  assert.equal((game.get('combatAttackers') || []).length, 0);
});

test('vigilance attackers remain untapped when declared and withdrawn', () => {
  const { app, cards } = table();
  const card = creature(app, { oracle: 'Vigilance' });cards.set(card.id, card);
  app.toggleAttacker(card);
  assert.equal(cards.get(card.id).attacking, true);
  assert.equal(cards.get(card.id).tapped, false);
  app.toggleAttacker(cards.get(card.id));
  assert.equal(cards.get(card.id).attacking, false);
  assert.equal(cards.get(card.id).tapped, false);
});

test('reloading keeps the same seat and private hand despite another tab saving', () => {
  const local = storage();
  const first = client({ local });
  first.state().hand = [{ id: 'first-hand', name: 'Forest' }];first.save();
  const second = client({ local });
  second.state().hand = [{ id: 'second-hand', name: 'Island' }];second.save();
  const reloaded = client({ local, session: first.session, reload: true });
  assert.equal(reloaded.localPlayerId, first.localPlayerId);
  assert.equal(reloaded.playerSession.rejoinedRoom, 'TESTROOM');
  assert.equal(reloaded.state().hand[0].id, 'first-hand');
  assert.equal(JSON.parse(local.getItem(STORE)).hand[0].id, 'second-hand');
});

test('duplicating a tab does not reuse the active original seat', () => {
  const first = client();
  const duplicate = client({ local: first.local, session: storage(first.session.entries()) });
  assert.notEqual(duplicate.localPlayerId, first.localPlayerId);
});

test('local table cards still tap and untap without a room', () => {
  const app = client({ search: '' });
  const card = creature(app);app.state().battlefield.push(card);
  app.toggleCardTap(card);
  assert.equal(app.state().battlefield[0].tapped, true);
  app.toggleCardTap(app.state().battlefield[0]);
  assert.equal(app.state().battlefield[0].tapped, false);
});
