import { NextResponse } from 'next/server';

/**
 * Server-side only route that returns the admin path.
 * This keeps the admin path out of the client JS bundle.
 * The ADMIN_PATH env var (without NEXT_PUBLIC_ prefix) is only available server-side.
 */
export async function GET() {
  // Use WINNERPIP_ADMIN_PATH (server-only) or fall back to NEXT_PUBLIC version
  const adminPath = process.env.WINNERPIP_ADMIN_PATH || process.env.ADMIN_PATH || process.env.NEXT_PUBLIC_ADMIN_PATH || '';
  return NextResponse.json({ path: adminPath });
}
