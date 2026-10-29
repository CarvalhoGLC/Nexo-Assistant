import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireSession } from '@/lib/auth';
import { respondBy } from '@/lib/sla';
import { db } from '@/lib/db';
import { handleError } from '@/lib/http';

/** Quem precisa de atenção aparece primeiro: aguardando atendente, com analista, com o agent, resolvidas/encerradas. */
const ORDER: Record<string, number> = { AWAITING: 0, ANALYST: 1, AGENT: 2, RESOLVED: 3, CLOSED: 3 };

/** Console do analista: lista de conversas com filtros. Somente papel ANALYST. */
export async function GET(req: Request) {
  try {
    const { user } = await requireSession('ANALYST');
    const url = new URL(req.url);
    const filter = url.searchParams.get('filter') ?? 'all';
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);

    const where: Prisma.ConversationWhereInput = {};
    if (filter === 'needs') where.status = 'AWAITING';
    else if (filter === 'agent') where.status = { in: ['AGENT', 'RESOLVED'] };
    else if (filter === 'mine') Object.assign(where, { status: 'ANALYST', assignedAnalystId: user.id });
    if (q) where.OR = [{ user: { name: { contains: q, mode: 'insensitive' } } }, { user: { department: { contains: q, mode: 'insensitive' } } }, { handoffTicket: { contains: q, mode: 'insensitive' } }];

    const [rows, needs, agent, mine, all] = await Promise.all([
      db.conversation.findMany({
        where, orderBy: { updatedAt: 'desc' }, take: 100,
        include: { user: { select: { id: true, name: true, department: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 12 } },
      }),
      db.conversation.count({ where: { status: 'AWAITING' } }),
      db.conversation.count({ where: { status: { in: ['AGENT', 'RESOLVED'] } } }),
      db.conversation.count({ where: { status: 'ANALYST', assignedAnalystId: user.id } }),
      db.conversation.count(),
    ]);

    return NextResponse.json({
      counts: { all, needs, agent, mine },
      items: [...rows].sort((a, b) => ORDER[a.status]! - ORDER[b.status]! || b.updatedAt.getTime() - a.updatedAt.getTime()).map((c) => {
        // "Não lidas" = mensagens do funcionário no fim da conversa, sem resposta depois delas (só quando há humano envolvido).
        const human = c.status === 'AWAITING' || c.status === 'ANALYST';
        const unread = human ? c.messages.findIndex((m) => m.sender !== 'USER') : 0;
        const preview = c.messages.find((m) => m.sender !== 'SYSTEM') ?? c.messages[0];
        return {
          id: c.id, status: c.status, updatedAt: c.updatedAt.toISOString(), user: c.user,
          lastMessage: preview ? { text: preview.text, sender: preview.sender, createdAt: preview.createdAt.toISOString() } : null,
          unread: unread < 0 ? c.messages.length : unread,
          handoff: c.handoffReason
            ? { reason: c.handoffReason, level: c.handoffLevel, confidence: c.handoffConfidence, ticket: c.handoffTicket,
                respondBy: c.handoffAt && c.handoffLevel ? respondBy(c.handoffAt, c.handoffLevel as 'N1' | 'N2').toISOString() : null }
            : null,
        };
      }),
    });
  } catch (e) {
    return handleError(e);
  }
}
