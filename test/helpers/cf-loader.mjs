// Node module-resolution hook that redirects the 'cloudflare:workers'
// specifier to cf-fake.mjs, so room.js (which is real, unmodified
// production code) can be imported and exercised under plain Node in
// test/room.test.js.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') {
    return { url: new URL('./cf-fake.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
