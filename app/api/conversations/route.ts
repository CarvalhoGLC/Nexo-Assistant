import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { handleError } from '@/lib/http';

/** Console do analista: lista de conversas com filtros. Somente papel ANALYST. */
export async function GET(req: Request) {
  try {
    const { user } = await requireSession('ANALYST');
    const url = new URL(req.url);
    const filter = url.searchParams.get('filter') ?? 'all';
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);

    const where: Prisma.ConversationWhereInput = {};
    if (filter === 'needs') where.status = 'AWAITING';
    else if (filter === 'agent') where.status = 'AGENT';
    else if (filter === 'mine') Object.assign(where, { status: 'ANALYST', assignedAnalystId: user.id });
    if (q) where.OR = [{ user: { name: { contains: q } } }, { user: { department: { contains: q } } }, { handoffTicket: { contains: q } }];

    const [rows, needs, agent, mine, all] = await Promise.all([
      db.conversation.findMany({
        where, orderBy: { updatedAt: 'desc' }, take: 100,
        include: { user: { select: { id: true, name: true, department: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      }),
      db.conversation.count({ where: { status: 'AWAITING' } }),
      db.conversation.count({ where: { status: 'AGENT' } }),
      db.conversation.count({ where: { status: 'ANALYST', assignedAnalystId: user.id } }),
      db.conversation.count(),
    ]);

    return NextResponse.json({
      counts: { all, needs, agent, mine },
      items: rows.map((c) => ({
        id: c.id, status: c.status, updatedAt: c.updatedAt.toISOString(), user: c.user,
        lastMessage: c.messages[0] ? { text: c.messages[0].text, sender: c.messages[0].sender, createdAt: c.messages[0].createdAt.toISOString() } : null,
        handoff: c.handoffReason ? { reason: c.handoffReason, level: c.handoffLevel, confidence: c.handoffConfidence, ticket: c.handoffTicket } : null,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
