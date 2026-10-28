import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE, makeSessionCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { loginRateLimited } from '@/lib/limits';
import { verifyPassword } from '@/lib/password';

const Body = z.object({ email: z.string().min(3).max(200), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Informe e-mail e senha.' }, { status: 400 });
  const email = parsed.data.email.trim().toLowerCase();
  if (loginRateLimited(email)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um minuto.' }, { status: 429 });

  const user = await db.user.findUnique({ where: { email } });
  // Mesma resposta para e-mail inexistente e senha errada (não revela quais e-mails existem).
  if (!user || !verifyPassword(parsed.data.password, user.password))
    return NextResponse.json({ error: 'E-mail ou senha inválidos.' }, { status: 401 });

  const session = await db.session.create({ data: { userId: user.id } });
  const res = NextResponse.json({ id: user.id, role: user.role, name: user.name, email: user.email });
  res.cookies.set(SESSION_COOKIE, makeSessionCookie(session.id), {
    httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 12,
  });
  return res;
}
