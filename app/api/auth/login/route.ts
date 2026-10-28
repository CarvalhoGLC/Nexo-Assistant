import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE, makeSessionCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { loginRateLimited } from '@/lib/limits';

const Body = z.object({ email: z.string().min(3).max(200), password: z.string().min(1).max(200), remember: z.boolean().optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Informe e-mail e senha.' }, { status: 400 });
  const email = parsed.data.email.trim().toLowerCase();
  if (loginRateLimited(email)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um minuto.' }, { status: 429 });

  const user = await db.user.findUnique({ where: { email } });
  // Decisão de protótipo (PRD): os funcionários dos dados de exemplo entram com QUALQUER senha; a identidade é o e-mail corporativo.
  // O hash em User.password fica pronto para trocar por verifyPassword() quando houver autenticação real.
  if (!user) return NextResponse.json({ error: 'E-mail não encontrado entre os funcionários.' }, { status: 401 });

  const session = await db.session.create({ data: { userId: user.id } });
  const res = NextResponse.json({ id: user.id, role: user.role, name: user.name, email: user.email });
  res.cookies.set(SESSION_COOKIE, makeSessionCookie(session.id), {
    httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production',
    ...(parsed.data.remember === false ? {} : { maxAge: 60 * 60 * 12 }), // sem "manter conectado": cookie de sessão do navegador
  });
  return res;
}
