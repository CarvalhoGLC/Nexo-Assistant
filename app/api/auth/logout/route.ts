import { NextResponse } from 'next/server';
import { SESSION_COOKIE, getCurrentSession } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST() {
  const session = await getCurrentSession();
  if (session) await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
