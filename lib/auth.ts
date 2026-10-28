import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from './db';
import type { Role } from './types';

export const SESSION_COOKIE = 'nexo_session';

export class AuthError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
  }
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET ausente ou curto demais (veja .env.example)');
  return 'dev-only-secret-troque-no-env'; // apenas desenvolvimento local
}

const sign = (id: string): string => createHmac('sha256', secret()).update(id).digest('hex');

/** Valor do cookie: "<sessionId>.<hmac>". O cookie NÃO carrega o id do usuário: ele é resolvido no servidor pela sessão. */
export const makeSessionCookie = (sessionId: string): string => `${sessionId}.${sign(sessionId)}`;

export function parseSessionCookie(raw: string | undefined): string | null {
  if (!raw) return null;
  const [id, sig] = raw.split('.');
  if (!id || !sig) return null;
  const expected = sign(id);
  if (sig.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? id : null;
}

export async function getCurrentSession() {
  const id = parseSessionCookie((await cookies()).get(SESSION_COOKIE)?.value);
  if (!id) return null;
  const session = await db.session.findUnique({ where: { id }, include: { user: true } });
  return session ?? null;
}

export async function getCurrentUser() {
  return (await getCurrentSession())?.user ?? null;
}

/** Retorna sessão + usuário ou lança 401. O userId SEMPRE vem daqui, nunca do corpo/URL da requisição. */
export async function requireSession(role?: Role) {
  const session = await getCurrentSession();
  if (!session) throw new AuthError(401, 'Não autenticado');
  if (role && session.user.role !== role) throw new AuthError(403, 'Acesso negado');
  return session;
}

export const requireUser = async (role?: Role) => (await requireSession(role)).user;
export const requireRole = requireUser;
