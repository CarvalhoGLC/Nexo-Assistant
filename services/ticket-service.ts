import type { Ticket } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { db } from '../lib/db';
import { canReopen, dueAt, isOpenStatus, isOverdue } from '../lib/sla';
import type { Category, Priority, TicketCard, TicketType } from '../lib/types';

export class TicketError extends Error {}

export function toCard(t: Ticket, at: Date = new Date()): TicketCard {
  return {
    number: t.number, type: t.type as TicketType, title: t.title, description: t.description, category: t.category,
    priority: t.priority as Priority, status: t.status as TicketCard['status'], affected: t.affected,
    createdAt: t.createdAt.toISOString(), lastUpdate: t.lastUpdate.toISOString(),
    dueAt: dueAt(t.priority as Priority, t.lastUpdate).toISOString(), overdue: isOverdue(t, at),
  };
}

const norm = (s: string): string[] =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2);

/** Similaridade de Jaccard entre dois textos (0..1). */
export function similarity(a: string, b: string): number {
  const A = new Set(norm(a));
  const B = new Set(norm(b));
  const inter = [...A].filter((w) => B.has(w)).length;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export const ticketService = {
  /** Privacidade: toda consulta do funcionário é filtrada por userId (que vem da sessão, nunca da requisição). */
  listForUser: (userId: string) => db.ticket.findMany({ where: { userId }, orderBy: { lastUpdate: 'desc' } }),

  getForUser: (userId: string, number: string) =>
    db.ticket.findFirst({ where: { userId, number: number.trim().toUpperCase() } }),

  /** Chamado aberto (ou resolvido há ≤ 7 dias) do mesmo funcionário, mesma categoria e texto parecido. */
  async findDuplicate(userId: string, category: Category, text: string) {
    const now = new Date();
    let best: { ticket: Ticket; score: number; reopenable: boolean } | undefined;
    for (const ticket of await this.listForUser(userId)) {
      const reopenable = canReopen(ticket, now);
      if (ticket.category !== category || !(isOpenStatus(ticket.status) || reopenable)) continue;
      const score = similarity(text, `${ticket.title} ${ticket.description}`);
      if (score >= 0.25 && (!best || score > best.score)) best = { ticket, score, reopenable };
    }
    return best;
  },

  async create(userId: string, d: { title: string; description: string; type: TicketType; category: string; priority: Priority; affected: string }) {
    // Número sequencial por tipo; a unicidade do banco protege contra corrida (retry).
    for (let attempt = 0; attempt < 5; attempt++) {
      const last = await db.ticket.findFirst({ where: { number: { startsWith: `${d.type}-` } }, orderBy: { number: 'desc' } });
      const next = (last ? Number(last.number.split('-')[1]) : 10000) + 1;
      try {
        const now = new Date();
        return await db.ticket.create({
          data: { ...d, userId, number: `${d.type}-${next}`, status: 'OPEN', lastUpdate: now, dueAt: dueAt(d.priority, now) },
        });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    throw new TicketError('Não foi possível gerar o número do chamado');
  },

  async update(userId: string, number: string, text: string) {
    const t = await this.getForUser(userId, number);
    if (!t) throw new TicketError('Chamado não encontrado');
    if (!isOpenStatus(t.status)) throw new TicketError('Chamado encerrado: use a reabertura');
    const now = new Date();
    return db.ticket.update({
      where: { id: t.id },
      data: { description: `${t.description}\n\n[${now.toISOString().slice(0, 10)}] ${text}`, lastUpdate: now, dueAt: dueAt(t.priority as Priority, now) },
    });
  },

  async reopen(userId: string, number: string, text: string) {
    const t = await this.getForUser(userId, number);
    if (!t) throw new TicketError('Chamado não encontrado');
    if (!canReopen(t, new Date())) throw new TicketError('Só é possível reabrir chamados resolvidos há até 7 dias');
    const now = new Date();
    return db.ticket.update({
      where: { id: t.id },
      data: { status: 'OPEN', resolvedAt: null, description: `${t.description}\n\n[Reaberto ${now.toISOString().slice(0, 10)}] ${text}`, lastUpdate: now, dueAt: dueAt(t.priority as Priority, now) },
    });
  },

  /** Transferência para um analista. Não renova lastUpdate: transferir não é responder, o prazo continua correndo. */
  async transfer(userId: string, number: string) {
    const t = await this.getForUser(userId, number);
    if (!t) throw new TicketError('Chamado não encontrado');
    return db.ticket.update({ where: { id: t.id }, data: { status: 'ANALYST' } });
  },

  /** Somente para o console do analista (papel validado na rota). */
  listForAnalystView: (userId: string) => db.ticket.findMany({ where: { userId }, orderBy: { lastUpdate: 'desc' } }),
};
