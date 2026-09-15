// worker.js — the Cloudflare Worker entry point. Cloudflare runs this
// file's `fetch` handler for every request that `run_worker_first` in
// wrangler.jsonc says must not be answered straight from the static
// file server -- today that's just "/ws". Every other request falls
// through to `env.ASSETS.fetch(request)`, which serves the matching
// file out of public/ (or index.html, for the single-page-app fallback
// configured in wrangler.jsonc).
//
// "/ws" is where ONLINE mode connects. Its job here is small on
// purpose: find (or create) the one Durable Object that owns this room
// code, and hand the WebSocket upgrade straight to it. All of the
// actual game refereeing — seat assignment, move validation, state
// broadcasting — happens inside that Durable Object (src/room.js), not
// here.
//
// `Room` must be re-exported from this file (the Worker's `main`
// module) for the `durable_objects` binding in wrangler.jsonc to find
// it; Cloudflare only looks for Durable Object classes as named exports
// of the main entry point.
export { Room } from './room.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      const roomCode = (url.searchParams.get('room') || '').trim().toUpperCase();
      if (!roomCode) {
        return new Response('Missing "room" query parameter.', { status: 400 });
      }
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected a WebSocket upgrade request.', { status: 426 });
      }

      const id = env.ROOM.getByName(roomCode);
      return id.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
