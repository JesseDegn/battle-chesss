// Integration test for the ACTUAL src/room.js Durable Object code (not
// just the pure logic in roomLogic.js, which test/roomLogic.test.js
// already covers directly). This is the best verification available
// without a real Cloudflare Workers runtime: it runs the real,
// unmodified room.js against small fakes for the three Cloudflare-only
// pieces it depends on --
//   - the 'cloudflare:workers' module (DurableObject base class)
//   - `new WebSocketPair()`
//   - `ctx.storage.sql` / `ctx.acceptWebSocket` / `ctx.getWebSockets()`
// so the actual seat-assignment, move-validation, persistence-write,
// and broadcast code paths in room.js run for real, not just their pure
// sub-functions.
//
// See README.md for why this exists: the build sandbox can't install
// wrangler/miniflare to run a real Workers runtime.

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('./helpers/cf-loader.mjs', import.meta.url);

// ---- Fakes for the Cloudflare-only runtime pieces ----

class FakeSocket {
  constructor(label) {
    this.label = label;
    this.sent = [];
    this.readyState = 1;
    this._attachment = null;
  }
  send(message) {
    this.sent.push(JSON.parse(message));
  }
  close() {}
  serializeAttachment(value) {
    this._attachment = value;
  }
  deserializeAttachment() {
    return this._attachment;
  }
  lastMessage() {
    return this.sent[this.sent.length - 1];
  }
}

class FakeWebSocketPair {
  constructor() {
    this[0] = new FakeSocket('client');
    this[1] = new FakeSocket('server');
  }
}
globalThis.WebSocketPair = FakeWebSocketPair;

class FakeSql {
  constructor() {
    this.row = null;
  }
  exec(query, ...bindings) {
    const q = query.trim();
    if (q.startsWith('CREATE TABLE')) return { toArray: () => [] };
    if (q.startsWith('SELECT data FROM room')) {
      return { toArray: () => (this.row === null ? [] : [{ data: this.row }]) };
    }
    if (q.startsWith('INSERT INTO room')) {
      this.row = bindings[0];
      return { toArray: () => [] };
    }
    throw new Error(`FakeSql: unhandled query: ${q}`);
  }
}

function makeCtx() {
  const sockets = [];
  return {
    storage: { sql: new FakeSql() },
    acceptWebSocket(ws) {
      sockets.push(ws);
    },
    getWebSockets() {
      return sockets;
    },
  };
}

function makeFetchRequest(url) {
  return new Request(url, { headers: { Upgrade: 'websocket' } });
}

// Node's built-in Response (undici) enforces the plain HTTP spec's
// status range and rejects 101, but Cloudflare Workers specifically
// extends `new Response(body, { status: 101, webSocket })` as how a
// Durable Object hands back the client end of a WebSocket pair. This
// wrapper only exists so room.js's real, unmodified code can be tested
// here; Cloudflare's actual runtime accepts status 101 natively.
const RealResponse = globalThis.Response;
class TestResponse extends RealResponse {
  constructor(body, init) {
    if (init && init.status === 101) {
      super(body, { ...init, status: 200 });
      Object.defineProperty(this, 'status', { value: 101 });
      this.webSocket = init.webSocket;
      return;
    }
    super(body, init);
  }
}
globalThis.Response = TestResponse;

const { Room } = await import('../src/room.js');

test('room.js: two players join, White moves, Black sees the broadcast state', async () => {
  const ctx = makeCtx();
  const room = new Room(ctx, {});

  const respA = await room.fetch(makeFetchRequest('https://example.com/ws?room=TEST&player=alice&country=france'));
  assert.equal(respA.status, 101);
  const serverA = ctx.getWebSockets()[0];
  assert.equal(serverA.lastMessage().type, 'welcome');
  assert.equal(serverA.lastMessage().payload.seat, 'w');

  const respB = await room.fetch(makeFetchRequest('https://example.com/ws?room=TEST&player=bob&country=japan'));
  assert.equal(respB.status, 101);
  const serverB = ctx.getWebSockets()[1];
  assert.equal(serverB.lastMessage().type, 'welcome');
  assert.equal(serverB.lastMessage().payload.seat, 'b');
  // A should have been notified (broadcast) that B just joined / countries filled in.
  assert.equal(serverA.lastMessage().payload.countries.b, 'japan');

  // White (alice) makes a legal move; both sockets should receive the
  // resulting state, and it should include the move for animation.
  await room.webSocketMessage(
    serverA,
    JSON.stringify({ type: 'move', payload: { from: { row: 1, col: 4 }, to: { row: 3, col: 4 } } })
  );
  assert.equal(serverA.lastMessage().type, 'state');
  assert.equal(serverA.lastMessage().payload.state.turn, 'b');
  assert.equal(serverA.lastMessage().payload.move.from.row, 1);
  assert.equal(serverB.lastMessage().payload.state.turn, 'b');

  // Black tries to move again immediately (it's not their... wait, it
  // IS their turn now) -- try an illegal move instead: moving a piece
  // that doesn't exist at that square.
  await room.webSocketMessage(
    serverB,
    JSON.stringify({ type: 'move', payload: { from: { row: 3, col: 3 }, to: { row: 3, col: 4 } } })
  );
  assert.equal(serverB.lastMessage().type, 'error');
});

test('room.js: a third joiner becomes a spectator and cannot move', async () => {
  const ctx = makeCtx();
  const room = new Room(ctx, {});
  await room.fetch(makeFetchRequest('https://example.com/ws?room=TEST2&player=alice&country=france'));
  await room.fetch(makeFetchRequest('https://example.com/ws?room=TEST2&player=bob&country=japan'));
  await room.fetch(makeFetchRequest('https://example.com/ws?room=TEST2&player=carol&country=brazil'));

  const serverC = ctx.getWebSockets()[2];
  assert.equal(serverC.lastMessage().payload.seat, 'spectator');

  await room.webSocketMessage(
    serverC,
    JSON.stringify({ type: 'move', payload: { from: { row: 1, col: 4 }, to: { row: 3, col: 4 } } })
  );
  assert.equal(serverC.lastMessage().type, 'error');
});

test('room.js: refresh-rejoin gets the same seat and current position back', async () => {
  const ctx = makeCtx();
  const room = new Room(ctx, {});
  await room.fetch(makeFetchRequest('https://example.com/ws?room=TEST3&player=alice&country=france'));
  await room.fetch(makeFetchRequest('https://example.com/ws?room=TEST3&player=bob&country=japan'));
  const serverA = ctx.getWebSockets()[0];

  await room.webSocketMessage(
    serverA,
    JSON.stringify({ type: 'move', payload: { from: { row: 1, col: 4 }, to: { row: 3, col: 4 } } })
  );

  // Simulate alice refreshing: a brand-new socket, same player id.
  const rejoinResp = await room.fetch(
    makeFetchRequest('https://example.com/ws?room=TEST3&player=alice&country=france')
  );
  assert.equal(rejoinResp.status, 101);
  const rejoinedSocket = ctx.getWebSockets()[ctx.getWebSockets().length - 1];
  const welcome = rejoinedSocket.lastMessage();
  assert.equal(welcome.type, 'welcome');
  assert.equal(welcome.payload.seat, 'w'); // same seat as before
  assert.equal(welcome.payload.state.turn, 'b'); // the e4 move from before the "refresh" is still there
});

test('room.js: New Game resets the board and broadcasts to everyone', async () => {
  const ctx = makeCtx();
  const room = new Room(ctx, {});
  await room.fetch(makeFetchRequest('https://example.com/ws?room=TEST4&player=alice&country=france'));
  await room.fetch(makeFetchRequest('https://example.com/ws?room=TEST4&player=bob&country=japan'));
  const [serverA, serverB] = ctx.getWebSockets();

  await room.webSocketMessage(
    serverA,
    JSON.stringify({ type: 'move', payload: { from: { row: 1, col: 4 }, to: { row: 3, col: 4 } } })
  );
  await room.webSocketMessage(serverB, JSON.stringify({ type: 'newGame', payload: {} }));

  assert.equal(serverA.lastMessage().type, 'state');
  assert.equal(serverA.lastMessage().payload.state.turn, 'w');
  assert.equal(serverA.lastMessage().payload.state.board[3][4], null); // e4 pawn is gone again
  assert.equal(serverB.lastMessage().payload.state.turn, 'w');
});
