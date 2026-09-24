const API_ORIGIN = 'https://the-mulch-garden-api.bjmmentink.workers.dev';

export async function onRequest(context) {
  const incoming = new URL(context.request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, API_ORIGIN);
  const request = new Request(target, context.request);
  const response = await fetch(request);
  const headers = new Headers(response.headers);
  headers.delete('Access-Control-Allow-Origin');
  headers.delete('Access-Control-Allow-Credentials');
  headers.delete('Access-Control-Allow-Headers');
  headers.delete('Access-Control-Allow-Methods');
  return new Response(response.body, { status: response.status, headers });
}
