import type { Conversation, Draft, Message } from '@prisma/client';
import { db } from '../lib/db';
import type {
  ConversationStatus, DecisionStep, DraftDTO, HandoffReason, MessageDTO, QuickOptions, TicketCard,
} from '../lib/types';
import { ticketService } from './ticket-service';

const parse = <T>(s: string | null): T | undefined => (s ? (JSON.parse(s) as T) : undefined);

export const toDraftDTO = (d: Draft): DraftDTO => ({
  code: d.code, kind: d.kind as DraftDTO['kind'], ticketNumber: d.ticketNumber ?? undefined, title: d.title, description: d.description,
  type: d.type as DraftDTO['type'], category: d.category, priority: d.priority as DraftDTO['priority'], priorityReason: d.priorityReason,
  affected: d.affected, dueAt: d.dueAt.toISOString(), status: d.status as DraftDTO['status'], resultNumber: d.resultNumber ?? undefined,
});

export async function toMessageDTOs(messages: Message[]): Promise<MessageDTO[]> {
  const ids = messages.map((m) => m.draftId).filter((x): x is string => !!x);
  const drafts = ids.length ? await db.draft.findMany({ where: { id: { in: ids } } }) : [];
  const byId = new Map(drafts.map((d) => [d.id, d]));
  return messages.map((m) => ({
    id: m.id, sender: m.sender as MessageDTO['sender'], text: m.text, createdAt: m.createdAt.toISOString(),
    authorName: m.authorName ?? undefined,
    steps: parse<DecisionStep[]>(m.steps), cards: parse<TicketCard[]>(m.cards), options: parse<QuickOptions>(m.options),
    draft: m.draftId && byId.get(m.draftId) ? toDraftDTO(byId.get(m.draftId)!) : undefined,
  }));
}

/** Uma conversa contínua por funcionário (permite "voltar outro dia e continuar de onde parei"). */
export async function conversationForUser(userId: string): Promise<Conversation> {
  return (await db.conversation.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } })) ?? db.conversation.create({ data: { userId } });
}

export type NewMessage = {
  sender: MessageDTO['sender']; text: string; authorName?: string; createdAt?: Date; steps?: DecisionStep[]; cards?: TicketCard[]; options?: QuickOptions; draftId?: string;
};
export const addMessage = (conversationId: string, m: NewMessage) =>
  db.message.create({
    data: {
      conversationId, sender: m.sender, text: m.text, draftId: m.draftId, authorName: m.authorName, ...(m.createdAt ? { createdAt: m.createdAt } : {}),
      steps: m.steps?.length ? JSON.stringify(m.steps) : null, cards: m.cards?.length ? JSON.stringify(m.cards) : null,
      options: m.options ? JSON.stringify(m.options) : null,
    },
  });

const ETA = { N1: 'até 4 h úteis', N2: 'até 2 h úteis' } as const;

/** Transfere a conversa: fica "aguardando atendente" e o agent pára de responder (a rota de chat checa o status). */
export async function handoffToAnalyst(
  conversationId: string,
  h: { reason: HandoffReason; summary: string; ticketNumber?: string; confidence?: number },
): Promise<void> {
  const level = h.reason === 'user_request' ? 'N1' : 'N2';
  const conv = await db.conversation.update({
    where: { id: conversationId },
    data: {
      status: 'AWAITING', assignedAnalystId: null, handoffReason: h.reason, handoffSummary: h.summary, handoffLevel: level,
      handoffConfidence: h.confidence ?? null, handoffTicket: h.ticketNumber ?? null, handoffAt: new Date(),
    },
  });
  if (h.ticketNumber) await ticketService.transfer(conv.userId, h.ticketNumber).catch(() => undefined);
  await addMessage(conversationId, { sender: 'SYSTEM', text: `Transferida para Suporte ${level} · um analista fala com você em ${ETA[level]}.` });
}

export class ConversationError extends Error {}

async function mine(conversationId: string, analystId: string, expected: ConversationStatus) {
  const c = await db.conversation.findUnique({ where: { id: conversationId } });
  if (!c) throw new ConversationError('Conversa não encontrada');
  if (c.status !== expected || (expected === 'ANALYST' && c.assignedAnalystId !== analystId))
    throw new ConversationError(expected === 'ANALYST' ? 'Esta conversa não está com você' : 'Conversa não está aguardando atendente');
  return c;
}

export async function analystTake(conversationId: string, analyst: { id: string; name: string }) {
  const c = await db.conversation.findUnique({ where: { id: conversationId } });
  if (!c) throw new ConversationError('Conversa não encontrada');
  if (c.status === 'ANALYST' || c.status === 'CLOSED') throw new ConversationError('Conversa indisponível para assumir');
  await db.conversation.update({ where: { id: c.id }, data: { status: 'ANALYST', assignedAnalystId: analyst.id } });
  if (c.handoffTicket) await db.ticket.updateMany({ where: { number: c.handoffTicket, userId: c.userId }, data: { status: 'IN_PROGRESS', lastUpdate: new Date() } });
  await addMessage(c.id, { sender: 'SYSTEM', text: `${analyst.name} assumiu · agent pausado` });
}

export async function analystReply(conversationId: string, analyst: { id: string; name: string }, text: string) {
  await mine(conversationId, analyst.id, 'ANALYST');
  await addMessage(conversationId, { sender: 'ANALYST', text, authorName: analyst.name });
}

export async function analystReturn(conversationId: string, analyst: { id: string; name: string }) {
  await mine(conversationId, analyst.id, 'ANALYST');
  await db.conversation.update({ where: { id: conversationId }, data: { status: 'AGENT', assignedAnalystId: null, handoffReason: null, handoffSummary: null, handoffLevel: null, handoffConfidence: null, handoffTicket: null, handoffAt: null } });
  await addMessage(conversationId, { sender: 'SYSTEM', text: `${analyst.name} devolveu a conversa ao Nexo Assist` });
}

export async function analystClose(conversationId: string, analyst: { id: string; name: string }) {
  await mine(conversationId, analyst.id, 'ANALYST');
  await db.conversation.update({ where: { id: conversationId }, data: { status: 'CLOSED', assignedAnalystId: null } });
  await addMessage(conversationId, { sender: 'SYSTEM', text: `${analyst.name} encerrou o atendimento` });
}
