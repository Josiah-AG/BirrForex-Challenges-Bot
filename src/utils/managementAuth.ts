import crypto from 'crypto';

export interface ManagementSession {
  role: 'admin' | 'host';
  subject: number;
  version: number;
  exp: number;
}
function signingKey(role: ManagementSession['role']): string {
  const secret = process.env.WINNERPIP_TOKEN_SECRET;
  if (!secret) throw new Error('Management session signing key is not configured');
  // Changing the admin password invalidates all existing admin sessions.
  return `${secret}:${role}:${role === 'admin' ? process.env.WINNERPIP_ADMIN_KEY || '' : ''}`;
}
export function issueManagementSession(role: ManagementSession['role'], subject = 0, version = 0): string {
  const data = Buffer.from(JSON.stringify({ role, subject, version, exp: Date.now() + 8 * 3600000 })).toString('base64url');
  return `${data}.${crypto.createHmac('sha256', signingKey(role)).update(data).digest('base64url')}`;
}
export function verifyManagementSession(token: unknown, role: ManagementSession['role']): ManagementSession | null {
  try {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const expected = crypto.createHmac('sha256', signingKey(role)).update(parts[0]).digest();
    const supplied = Buffer.from(parts[1], 'base64url');
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
    const value = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (value.role !== role || !Number.isFinite(value.exp) || value.exp <= Date.now()
        || !Number.isSafeInteger(value.subject) || !Number.isSafeInteger(value.version)) return null;
    return value;
  } catch { return null; }
}
export function equalSecret(input: unknown, expected: string): boolean {
  if (!expected || typeof input !== 'string') return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
