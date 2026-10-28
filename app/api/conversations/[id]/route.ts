import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { respondBy } from '@/lib/sla';
import { db } from '@/lib/db';
import { handleError, HttpError } from '@/lib/http';
import { toMessageDTOs } from '@/services/conversation-service';
import { ticketService, toCard } from '@/services/ticket-service';

/** Histórico completo (com os passos de decisão do agent) + chamados do funcionário. Somente papel ANALYST. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession('ANALYST');
    const { id } = await params;
    const c = await db.conversation.findUnique({ where: { id }, include: { user: { select: { id: true, name: true, email: true, department: true } } } });
    if (!c) throw new HttpError(404, 'Conversa não encontrada.');
    const [messages, tickets, analyst] = await Promise.all([
      db.message.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'asc' } }),
      ticketService.listForAnalystView(c.userId),
      c.assignedAnalystId ? db.user.findUnique({ where: { id: c.assignedAnalystId }, select: { id: true, name: true } }) : null,
    ]);
    const cards = tickets.map((t) => toCard(t));
    return NextResponse.json({
      conversation: {
        id: c.id, status: c.status, assignedAnalyst: analyst,
        handoff: c.handoffReason ? { reason: c.handoffReason, summary: c.handoffSummary, level: c.handoffLevel, confidence: c.handoffConfidence, ticket: c.handoffTicket, at: c.handoffAt?.toISOString(),
          respondBy: c.handoffAt && c.handoffLevel ? respondBy(c.handoffAt, c.handoffLevel as 'N1' | 'N2').toISOString() : null } : null,
      },
      user: c.user, messages: await toMessageDTOs(messages), tickets: cards,
      counts: { open: cards.filter((t) => t.status !== 'RESOLVED').length, closed: cards.filter((t) => t.status === 'RESOLVED').length },
    });
  } catch (e) {
    return handleError(e);
  }
}
