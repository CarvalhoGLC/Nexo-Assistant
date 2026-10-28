import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { maxMessagesPerSession } from '@/lib/limits';

export async function GET() {
  const s = await getCurrentSession();
  if (!s) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { user } = s;
  return NextResponse.json({
    id: user.id, name: user.name, email: user.email, role: user.role, department: user.department,
    session: { count: s.messageCount, max: maxMessagesPerSession() },
  });
}
