import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
const cookieName = 'wp_admin_session';
async function proxy(request: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path;
  if (!path?.length || path.some(p => !/^[a-zA-Z0-9_-]+$/.test(p))) {
    return NextResponse.json({ error: 'Invalid operation' }, { status: 400 });
  }
  const mutation = !['GET', 'HEAD'].includes(request.method);
  // Cookie-authenticated writes must originate on this site; no cross-site forms/fetches.
  if (mutation && request.headers.get('origin') !== (process.env.WINNERPIP_URL || request.nextUrl.origin)) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }
  const login = path.length === 1 && path[0] === 'login' && request.method === 'POST';
  if (path.length === 1 && path[0] === 'logout' && request.method === 'POST') {
    const response = NextResponse.json({ success: true });
    response.cookies.set(cookieName, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/api/management', maxAge: 0 });
    return response;
  }
  const session = request.cookies.get(cookieName)?.value;
  if (!login && !session) return NextResponse.json({ error: 'Admin login required' }, { status: 401 });
  const adminPath = process.env.WINNERPIP_ADMIN_PATH;
  const backend = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!adminPath || !backend) return NextResponse.json({ error: 'Admin connection is not configured' }, { status: 503 });
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (session) headers.set('Authorization', `Bearer ${session}`);
  // Preserve optional backend IP restrictions through the authenticated server proxy.
  const proxyKey = process.env.WINNERPIP_ADMIN_PROXY_SECRET;
  if (proxyKey) {
    const ip = (request.headers.get('x-forwarded-for') || '').split(',').pop()?.trim() || '';
    const timestamp = String(Date.now());
    headers.set('x-management-ip', ip);
    headers.set('x-management-time', timestamp);
    headers.set('x-management-signature', crypto.createHmac('sha256', proxyKey).update(`${timestamp}:${ip}`).digest('hex'));
  }
  try {
    const upstream = await fetch(`${backend.replace(/\/$/, '')}/api/admin/${encodeURIComponent(adminPath)}/${path.join('/')}${request.nextUrl.search}`, {
      method: request.method, headers, cache: 'no-store', redirect: 'error',
      body: mutation ? await request.text() : undefined,
      signal: AbortSignal.timeout(120000),
    });
    if (login) {
      const data = await upstream.json();
      const response = NextResponse.json({ success: upstream.ok, error: data.error }, { status: upstream.status });
      if (upstream.ok && typeof data.token === 'string') {
        response.cookies.set(cookieName, data.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/api/management', maxAge: 8 * 3600 });
      }
      return response;
    }
    const response = new NextResponse(upstream.body, { status: upstream.status, headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store',
    } });
    if (upstream.status === 401) response.cookies.set(cookieName, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/api/management', maxAge: 0 });
    return response;
  } catch { return NextResponse.json({ error: 'Admin service unavailable' }, { status: 502 }); }
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
