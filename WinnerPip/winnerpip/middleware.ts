import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const adminPath = process.env.NEXT_PUBLIC_ADMIN_PATH;
  const pathname = request.nextUrl.pathname;

  // Block direct access to /admin/* — return 404
  if (pathname.startsWith('/admin')) {
    return new NextResponse(null, { status: 404 });
  }

  // Rewrite /{secretpath}/{id} → /admin/{id}
  if (adminPath) {
    const prefix = `/${adminPath}`;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      const rest = pathname.slice(prefix.length) || '/';
      return NextResponse.rewrite(new URL(`/admin${rest}`, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Match all paths except static assets, api, _next
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|winnerpip-).*)'],
};
