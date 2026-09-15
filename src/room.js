// room.js — the Durable Object that referees ONE online game room. Every
// room code maps to exactly one instance of this class (see
// env.ROOM.getByName(roomCode) in worker.js). This is the "server" the
// brief means when it says "the server decides every move": every move
// message is checked against roomLogic.js's tryApplyMove before the
// position changes, and the resulting position is what gets sent back
// to every connected browser — the browsers never decide anything on
// their own in this mode.
//
// SQLite-backed Durable Object storage (ctx.storage.sql) means the room
// survives the Durable Object being unloaded ("hibernated") when no one
// is connected, and ctx.acceptWebSocket() (rather than holding the
// WebSocket "the normal way") is what lets Cloudflare hibernate this
// object between messages without dropping anyone's connection. No
// timers of any kind are used anywhere in this file — the position is
// written to SQLite storage after every single move and every seat
// assignment, immediately, so there is nothing time-sensitive to get
// wrong.

import { DurableObject } from 'cloudflare:workers';
import { getGameStatus } from '../public/js/rules.js';
import { deserializeRoom, serializeRoom, assignSeat, tryApplyMove, resetGame } from './roomLogic.js';

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)`
    );
  }

  loadRoom() {
    const rows = this.sql.exec('SELECT data FROM room WHERE id = 1').toArray();
    return rows.length === 0 ? deserializeRoom(null) : deserializeRoom(rows[0].data);
  }

  saveRoom(room) {
    this.sql.exec(
      `INSERT INTO room (id, data) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      serializeRoom(room)
    );
  }

  statusMessage(room) {
    return {
      state: room.state,
      countries: room.countries,
      status: getGameStatus(room.state),
    };
  }

  broadcast(room, excludeWs, move = null) {
    // Including the move that was just made (when there is one) lets
    // every browser play the same slide/capture animation the local
    // modes use, instead of the board just silently snapping to the new
    // position. Joining a room or starting a New Game has no single
    // "move" behind it, so those broadcasts omit it and the client just
    // redraws the board directly.
    const message = JSON.stringify({ type: 'state', payload: { ...this.statusMessage(room), move } });
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === excludeWs) continue;
      try {
        ws.send(message);
      } catch {
        // Socket is on its way out; ignore, it'll get a close event.
      }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade request.', { status: 426 });
    }

    const playerId = url.searchParams.get('player') || crypto.randomUUID();
    const countryId = url.searchParams.get('country') || 'france';

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Hibernatable accept: Cloudflare may unload this Durable Object
    // between messages and wake it back up later without dropping the
    // connection, as long as we use acceptWebSocket() instead of just
    // holding a reference to the socket ourselves.
    this.ctx.acceptWebSocket(server);

    let room = this.loadRoom();
    const assigned = assignSeat(room, playerId, countryId);
    room = assigned.room;
    this.saveRoom(room);

    // Player identity for this connection travels with the WebSocket
    // itself (survives hibernation) rather than living in a plain JS
    // object in memory, which hibernation would throw away.
    server.serializeAttachment({ playerId, seat: assigned.seat });

    server.send(JSON.stringify({ type: 'welcome', payload: { seat: assigned.seat, ...this.statusMessage(room) } }));
    // Tell everyone ELSE in the room (if any) that a seat/spectator
    // count just changed.
    this.broadcast(room, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, rawMessage) {
    let msg;
    try {
      msg = JSON.parse(typeof rawMessage === 'string' ? rawMessage : '');
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    const { seat } = ws.deserializeAttachment();
    const room = this.loadRoom();

    if (msg.type === 'move') {
      const result = tryApplyMove(room, seat, msg.payload);
      if (!result.ok) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: result.reason } }));
        return;
      }
      this.saveRoom(result.room);
      this.broadcast(result.room, null, result.move); // everyone, including the mover, gets the authoritative echo
      return;
    }

    if (msg.type === 'newGame') {
      if (seat !== 'w' && seat !== 'b') {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Only a seated player can start a new game.' } }));
        return;
      }
      const next = resetGame(room);
      this.saveRoom(next);
      this.broadcast(next, null);
    }
  }

  async webSocketClose(ws, code, reason) {
    try {
      ws.close(code, reason);
    } catch {
      // already closed
    }
    // Nothing else to do: the seat stays reserved for this playerId in
    // SQLite storage (see assignSeat), and the position is already
    // saved, so reconnecting later (even to a freshly-woken Durable
    // Object) picks up exactly where this player left off.
  }

  async webSocketError(_ws, _error) {
    // No timers/reconnect bookkeeping needed here — see webSocketClose.
  }
}
