import { randomBytes } from 'node:crypto';
import { db } from '../lib/db';
import { SLA_LABEL } from '../lib/sla';
import type { Priority, TicketType } from '../lib/types';
import { addMessage, handoffToAnalyst, toMessageDTOs } from './conversation-service';
import { legacy } from './legacy';
import { ticketService, toCard } from './ticket-service';

export class DraftError extends Error {}

export type NewDraft = {
  conversationId: string; kind: 'create' | 'update' | 'reopen'; ticketNumber?: string; title: string; description: string; type: TicketType;
  category: string; priority: Priority; priorityReason: string; affected: string; dueAt: Date;
};

/** Cria o rascunho e torna obsoletos os anteriores pendentes (só o último pode ser confirmado). */
export async function createDraft(d: NewDraft) {
  await db.draft.updateMany({ where: { conversationId: d.conversationId, status: 'PENDING' }, data: { status: 'SUPERSEDED' } });
  return db.draft.create({ data: { ...d, code: `D-${randomBytes(3).toString('hex').toUpperCase()}` } });
}

async function ownDraft(userId: string, code: string) {
  const draft = await db.draft.findUnique({ where: { code }, include: { conversation: true } });
  // Privacidade: o rascunho precisa pertencer à conversa do próprio usuário da sessão.
  if (!draft || draft.conversation.userId !== userId) throw new DraftError('Rascunho não encontrado');
  if (draft.status !== 'PENDING') throw new DraftError('Este rascunho não está mais pendente');
  return draft;
}

/** Única porta para criar/atualizar chamado a partir do chat: exige a confirmação explícita do funcionário.
 *  Os dados vêm do rascunho gravado no servidor, nunca do cliente. */
export async function confirmDraft(userId: string, code: string) {
  const draft = await ownDraft(userId, code);
  const ticket = await legacy(() => {
    if (draft.kind === 'create')
      return ticketService.create(userId, { title: draft.title, description: draft.description, type: draft.type as TicketType, category: draft.category, priority: draft.priority as Priority, affected: draft.affected });
    if (draft.kind === 'reopen') return ticketService.reopen(userId, draft.ticketNumber ?? '', draft.description);
    return ticketService.update(userId, draft.ticketNumber ?? '', draft.description);
  });
  await db.draft.update({ where: { id: draft.id }, data: { status: 'CONFIRMED', resultNumber: ticket.number } });
  const verb = draft.kind === 'create' ? 'abri o chamado' : draft.kind === 'reopen' ? 'reabri o chamado' : 'atualizei o chamado';
  const msg = await addMessage(draft.conversationId, {
    sender: 'AGENT', cards: [toCard(ticket)],
    text: `Pronto: ${verb} ${ticket.number} com prioridade ${ticket.priority === 'CRITICAL' ? 'crítica' : ticket.priority === 'HIGH' ? 'alta' : ticket.priority === 'MEDIUM' ? 'média' : 'baixa'}. Retorno em até ${SLA_LABEL[ticket.priority as Priority]}.`,
  });
  // Caso crítico: transferência automática com resumo (Anexo A).
  if (ticket.priority === 'CRITICAL')
    await handoffToAnalyst(draft.conversationId, { reason: 'critical', ticketNumber: ticket.number, summary: `Chamado crítico ${ticket.number}: ${ticket.title}. ${draft.description}` });
  const fresh = await db.message.findMany({ where: { conversationId: draft.conversationId, createdAt: { gte: msg.createdAt } }, orderBy: { createdAt: 'asc' } });
  return toMessageDTOs(fresh);
}

export async function cancelDraft(userId: string, code: string) {
  const draft = await ownDraft(userId, code);
  await db.draft.update({ where: { id: draft.id }, data: { status: 'CANCELLED' } });
  const msg = await addMessage(draft.conversationId, { sender: 'AGENT', text: 'Tudo bem, cancelei o rascunho. Nada foi criado.' });
  return toMessageDTOs([msg]);
}
