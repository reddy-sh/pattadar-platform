// Dev-only stand-in for the vite proxy. In AWS this route is unreachable —
// CloudFront/ALB route /api/* to the gateway before Next ever sees it.
// Each branch refuses independently when its target env is unset.
import { NextRequest } from 'next/server';

const API = process.env.DEV_API_TARGET;         // http://localhost:8080  (pattadar API, 'pattadar/' prefix stripped)
const GATEWAY = process.env.DEV_GATEWAY_TARGET; // http://localhost:8082  (storage/admin/assistant, Bearer passthrough)
const DEV_USER = process.env.DEV_USER_ID;       // injected as x-user-id on direct-API calls only

export const dynamic = 'force-dynamic';

const HOP = ['host', 'connection', 'content-encoding', 'content-length', 'transfer-encoding'];

async function forward(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const direct = path[0] === 'pattadar';
  const target = direct ? API : GATEWAY;
  if (!target) return new Response('dev proxy disabled for this target', { status: 404 });
  const search = req.nextUrl.search;
  const url = direct
    ? `${target}/${path.slice(1).join('/')}${search}`
    : `${target}/api/gateway/${path.join('/')}${search}`;
  const headers = new Headers(req.headers);
  HOP.forEach((h) => headers.delete(h));
  if (direct && DEV_USER) headers.set('x-user-id', DEV_USER);
  const sse = path[0] === 'assistant'; // SSE stream must not be time-capped
  const res = await fetch(url, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
    // AI extraction can run 180s; ≥200s and never retry (global invariant)
    // @ts-expect-error duplex required by node fetch for streamed bodies
    duplex: 'half',
    signal: sse ? undefined : AbortSignal.timeout(200_000),
  });
  const out = new Headers(res.headers);
  HOP.forEach((h) => out.delete(h));
  return new Response(res.body, { status: res.status, headers: out });
}
export { forward as GET, forward as POST, forward as PATCH, forward as PUT, forward as DELETE };
