import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const APP_ROUTES = ['/documents', '/counterparties', '/import', '/settings'];
const AUTH_ROUTES = ['/login', '/register'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoggedIn = request.cookies.has('isLoggedIn');

  const isAppRoute = APP_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));

  if (isAppRoute && !isLoggedIn) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL('/documents', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
