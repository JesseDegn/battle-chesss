// A minimal stand-in for the 'cloudflare:workers' built-in module, used
// only so room.js's `import { DurableObject } from 'cloudflare:workers'`
// resolves under plain Node for testing (see test/room.test.js and
// cf-loader.mjs). Cloudflare's real runtime provides the real thing when
// this code actually runs as a Worker.
export class DurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}
