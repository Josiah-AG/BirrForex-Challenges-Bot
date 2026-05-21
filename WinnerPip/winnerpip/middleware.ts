import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const adminPath = process.env.ADMIN_PATH || process.env.NEXT_PUBLIC_ADMIN_PATH;
  const pathname = request.nextUrl.pathname;

  // Block direct access to /admin/* — return 404
  if (pathname.startsWith('/admin')) {
    return new NextResponse(null, { status: 404 });
  }

  // Rewrite /{secretpath} → /admin/panel (single admin page, no challenge ID in URL)
  if (adminPath) {
    const prefix = `/${adminPath}`;
    if (pathname === prefix || pathname === `${prefix}/`) {
      return NextResponse.rewrite(new URL('/admin/panel', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|challenges|challenge|login|register|public).*)'],
};
