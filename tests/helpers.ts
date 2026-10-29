import { db } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import type { DecisionStep } from '@/lib/types';
import type { ActionCtx, TurnState } from '@/agent/actions';

export const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);

/** Limpa todas as tabelas em uma única transação. */
export async function resetDb() {
  await db.$transaction([
    db.message.deleteMany(), db.draft.deleteMany(), db.conversation.deleteMany(),
    db.session.deleteMany(), db.ticket.deleteMany(), db.helpArticle.deleteMany(), db.user.deleteMany(),
  ]);
}

export async function mkUser(name: string, role: 'EMPLOYEE' | 'ANALYST' = 'EMPLOYEE') {
  return db.user.create({ data: { name, email: `${name.toLowerCase().replace(/\W/g, '.')}@nexo.com.br`, password: hashPassword('x'), role, department: 'TI' } });
}

export async function mkTicket(userId: string, p: Partial<{ number: string; title: string; description: string; category: string; priority: string; status: string; lastUpdate: Date; resolvedAt: Date | null; type: string }> = {}) {
  return db.ticket.create({
    data: {
      number: p.number ?? `INC-${Math.floor(20000 + Math.random() * 9000)}`, type: p.type ?? 'INC', title: p.title ?? 'Teste', description: p.description ?? 'Teste',
      category: p.category ?? 'Hardware', priority: p.priority ?? 'MEDIUM', status: p.status ?? 'OPEN', affected: 'Só eu', userId,
      lastUpdate: p.lastUpdate ?? new Date(), resolvedAt: p.resolvedAt ?? null,
    },
  });
}

export function ctxFor(userId: string, conversationId: string): { ctx: ActionCtx; state: TurnState; steps: DecisionStep[] } {
  const state: TurnState = { steps: [], cards: [], escalated: false };
  return { ctx: { userId, conversationId, state, emit: () => undefined }, state, steps: state.steps };
}

export const R = { understood: 'teste', confidence: 0.9, reason: 'teste' };
