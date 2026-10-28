import { randomUUID } from 'node:crypto';
import { classifyPriority } from '../lib/priority';
import { canReopen, dueAt, isOpenStatus, SLA_LABEL } from '../lib/sla';
import { STATUS_LABEL, type Affected, type Category, type DecisionStep, type Priority, type QuickOptions, type TicketCard, type TicketType } from '../lib/types';
import { handoffToAnalyst } from '../services/conversation-service';
import { createDraft, type NewDraft } from '../services/draft-service';
import { searchHelp } from '../services/help-service';
import { legacy, TicketsUnavailableError } from '../services/legacy';
import { ticketService, toCard } from '../services/ticket-service';

/** Abaixo disso o agent não decide sozinho: transfere para um analista (Anexo A). */
export const MIN_CONFIDENCE = 0.5;

export type Reasoning = { understood: string; confidence: number; reason: string };

export type TurnState = {
  steps: DecisionStep[];
  cards: TicketCard[];
  options?: QuickOptions;
  draftId?: string;
  escalated: boolean;
};

export type ActionCtx = {
  userId: string; // vem da sessão; o modelo nunca o enxerga nem o informa
  conversationId: string;
  state: TurnState;
  emit: (step: DecisionStep) => void;
};

type Result = Record<string, unknown>;

/** Passo determinístico gerado dentro de uma ação (ex.: cálculo de prioridade/SLA), mostrado como chip próprio. */
function substep(ctx: ActionCtx, r: Reasoning, action: string, label: string, what: string, data: Record<string, unknown>) {
  const s: DecisionStep = { id: randomUUID(), action, label, understood: r.understood, confidence: Math.max(0, Math.min(1, r.confidence)), reason: r.reason, what, data, status: 'ok', ms: 0 };
  ctx.state.steps.push(s);
  ctx.emit(s);
}
type Outcome = { result: Result; what: string; data?: Record<string, unknown> };

/** Executa uma ação, mede o tempo e registra o passo (entendeu / fez / confiança / por quê) para a interface. */
async function step(ctx: ActionCtx, action: string, label: string, r: Reasoning, run: () => Promise<Outcome>): Promise<Result> {
  const t0 = Date.now();
  const base = { id: randomUUID(), action, label, understood: r.understood, confidence: Math.max(0, Math.min(1, r.confidence)), reason: r.reason };
  const push = (s: DecisionStep) => { ctx.state.steps.push(s); ctx.emit(s); };
  try {
    const o = await run();
    push({ ...base, what: o.what, data: o.data, status: 'ok', ms: Date.now() - t0 });
    return o.result;
  } catch (e) {
    const unavailable = e instanceof TicketsUnavailableError;
    const msg = unavailable ? 'sistema_de_chamados_indisponivel' : e instanceof Error ? e.message : 'erro_desconhecido';
    push({
      ...base, label: `${label} (falhou)`, status: 'error', ms: Date.now() - t0, data: { error: msg },
      what: unavailable ? 'O sistema de chamados não respondeu após 3 tentativas.' : `Ação recusada: ${msg}`,
    });
    return { error: msg };
  }
}

const brief = (c: TicketCard) => ({
  numero: c.number, titulo: c.title, status: c.status, prioridade: c.priority, categoria: c.category,
  vencido: c.overdue, ultimaAtualizacao: c.lastUpdate, prazoAte: c.dueAt, prazoParaAtualizacao: SLA_LABEL[c.priority],
});

export function buildActions(ctx: ActionCtx) {
  return {
    searchHelpCenter: (i: { query: string } & Reasoning) =>
      step(ctx, 'searchHelpCenter', 'buscou na central de ajuda', i, async () => {
        const hits = await searchHelp(i.query);
        return {
          result: { artigos: hits.map((h) => ({ id: h.id, titulo: h.title, texto: h.content })) },
          what: hits.length ? `Encontrou ${hits.length} artigo(s): ${hits.map((h) => h.title).join('; ')}.` : 'Nenhum artigo relevante encontrado.',
          data: { consulta: i.query, artigos: hits.map((h) => ({ titulo: h.title, pontuacao: h.score })) },
        };
      }),

    listMyTickets: (i: { scope: 'open' | 'all'; showAsChoices: boolean } & Reasoning) =>
      step(ctx, 'listMyTickets', 'consultou seus chamados', i, async () => {
        const all = (await legacy(() => ticketService.listForUser(ctx.userId))).map((t) => toCard(t));
        const list = i.scope === 'open' ? all.filter((c) => isOpenStatus(c.status)) : all;
        if (i.showAsChoices && list.length > 1)
          ctx.state.options = {
            kind: 'tickets', question: 'Escolha um chamado',
            items: list.map((c) => ({ label: `${c.number} · ${c.title}`, value: `${c.number} · ${c.title}`, hint: `${STATUS_LABEL[c.status]}${c.overdue ? ' · vencido' : ''} · ${new Date(c.lastUpdate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}` })),
          };
        return {
          result: { total: list.length, chamados: list.map(brief) },
          what: `Listou ${list.length} chamado(s) ${i.scope === 'open' ? 'aberto(s)' : 'no total'} do funcionário.`,
          data: { numeros: list.map((c) => c.number), vencidos: list.filter((c) => c.overdue).map((c) => c.number) },
        };
      }),

    getTicket: (i: { ticketNumber: string } & Reasoning) =>
      step(ctx, 'getTicket', `consultou o ${i.ticketNumber.toUpperCase()}`, i, async () => {
        // Privacidade: só encontra chamados do usuário da sessão; de outra pessoa é "não encontrado".
        const t = await legacy(() => ticketService.getForUser(ctx.userId, i.ticketNumber));
        if (!t) return { result: { erro: 'Chamado não encontrado entre os chamados deste funcionário.' }, what: 'Chamado não encontrado entre os chamados do funcionário.', data: { numero: i.ticketNumber } };
        const card = toCard(t);
        ctx.state.cards.push(card);
        return {
          result: { ...brief(card), descricao: t.description, reabrivel: canReopen(t, new Date()) },
          what: card.overdue ? `Calculou o prazo: VENCIDO (prioridade ${card.priority}, prazo ${SLA_LABEL[card.priority]}).` : `Calculou o prazo: dentro do prazo (${SLA_LABEL[card.priority]}).`,
          data: { numero: card.number, status: card.status, vencido: card.overdue, prazoAte: card.dueAt },
        };
      }),

    askUser: (i: { question: string; options: string[] } & Reasoning) =>
      step(ctx, 'askUser', 'fez uma pergunta', i, async () => {
        ctx.state.options = { kind: 'options', question: i.question, items: i.options.map((o) => ({ label: o, value: o })) };
        return { result: { ok: true, instrucao: 'Opções exibidas ao funcionário. Termine a mensagem e aguarde a resposta.' }, what: `Perguntou: "${i.question}" (${i.options.length} opções).`, data: { opcoes: i.options } };
      }),

    proposeDraft: (i: {
      kind: 'create' | 'update' | 'reopen'; ticketNumber?: string; title: string; description: string; type: TicketType; category: Category;
      affected: Affected; blocksWork: boolean; sameDayCommitment: boolean; hasWorkaround: boolean; confirmedDifferentProblem?: boolean;
    } & Reasoning) =>
      step(ctx, 'proposeDraft', i.kind === 'create' ? 'montou o rascunho' : 'montou o rascunho de atualização', i, async () => {
        if (i.confidence < MIN_CONFIDENCE) throw new Error('confianca_baixa: chame escalateToAnalyst com reason=low_confidence');
        const now = new Date();
        let d: NewDraft;
        if (i.kind === 'create') {
          const dup = i.confirmedDifferentProblem ? undefined : await legacy(() => ticketService.findDuplicate(ctx.userId, i.category, `${i.title} ${i.description}`));
          if (dup)
            return {
              result: { erro: 'duplicidade', chamadoExistente: dup.ticket.number, reabrivel: dup.reopenable, instrucao: `Já existe ${dup.ticket.number}. Em vez de criar, chame proposeDraft com kind=${dup.reopenable ? 'reopen' : 'update'} e ticketNumber=${dup.ticket.number}, ou pergunte se é outro problema.` },
              what: `Bloqueou a criação: ${dup.ticket.number} parece o mesmo problema (similaridade ${dup.score.toFixed(2)}).`,
              data: { duplicadoDe: dup.ticket.number, similaridade: Number(dup.score.toFixed(2)) },
            };
          const p = classifyPriority({ type: i.type, affected: i.affected, blocksWork: i.blocksWork, sameDayCommitment: i.sameDayCommitment, hasWorkaround: i.hasWorkaround });
          substep(ctx, i, 'classifyPriority', 'classificou a prioridade', p.reason, {
            impacto: i.affected, impedeTrabalho: i.blocksWork, compromissoNoDia: i.sameDayCommitment, temAlternativa: i.hasWorkaround, prioridade: p.priority,
          });
          d = { conversationId: ctx.conversationId, kind: 'create', title: i.title, description: i.description, type: i.type, category: i.category, priority: p.priority, priorityReason: p.reason, affected: i.affected, dueAt: dueAt(p.priority, now) };
        } else {
          const t = await legacy(() => ticketService.getForUser(ctx.userId, i.ticketNumber ?? ''));
          if (!t) throw new Error('chamado_nao_encontrado');
          if (i.kind === 'reopen' && !canReopen(t, now)) throw new Error('so_reabre_resolvido_ha_ate_7_dias');
          if (i.kind === 'update' && !isOpenStatus(t.status)) throw new Error('chamado_encerrado: use kind=reopen se foi resolvido há até 7 dias');
          d = { conversationId: ctx.conversationId, kind: i.kind, ticketNumber: t.number, title: t.title, description: i.description, type: t.type as TicketType, category: t.category, priority: t.priority as Priority, priorityReason: `Mantém a prioridade atual do chamado (${t.priority}).`, affected: t.affected, dueAt: dueAt(t.priority as Priority, now) };
        }
        substep(ctx, i, 'checkSla', 'consultou o SLA', `Prazo da prioridade ${d.priority}: ${SLA_LABEL[d.priority]}; resposta até ${d.dueAt.toLocaleString('pt-BR')}.`, {
          prioridade: d.priority, prazo: SLA_LABEL[d.priority], respostaAte: d.dueAt.toISOString(),
        });
        const draft = await createDraft(d);
        ctx.state.draftId = draft.id;
        return {
          result: { rascunho: draft.code, prioridade: draft.priority, motivo: draft.priorityReason, prazoAte: draft.dueAt, instrucao: 'Rascunho exibido com botões Confirmar/Editar/Cancelar. NÃO diga que foi criado; peça para conferir.' },
          what: `Classificou a prioridade como ${draft.priority} e montou o rascunho ${draft.code} (${draft.kind}) para confirmação.`,
          data: { rascunho: draft.code, categoria: draft.category, prioridade: draft.priority, motivo: draft.priorityReason, afetados: draft.affected, prazoAte: draft.dueAt.toISOString() },
        };
      }),

    escalateToAnalyst: (i: { handoffReason: 'user_request' | 'critical' | 'overdue' | 'low_confidence'; summary: string; ticketNumber?: string } & Reasoning) =>
      step(ctx, 'escalateToAnalyst', 'transferiu para um analista', i, async () => {
        await handoffToAnalyst(ctx.conversationId, { reason: i.handoffReason, summary: i.summary, ticketNumber: i.ticketNumber, confidence: i.handoffReason === 'low_confidence' ? i.confidence : undefined });
        ctx.state.escalated = true;
        const level = i.handoffReason === 'user_request' ? 'N1' : 'N2';
        return {
          result: { ok: true, nivel: level, instrucao: 'Conversa transferida. Confirme em uma frase; não faça mais perguntas.' },
          what: `Transferiu a conversa para o Suporte ${level} (${i.handoffReason}) com resumo do caso.`,
          data: { motivo: i.handoffReason, nivel: level, chamado: i.ticketNumber, resumo: i.summary },
        };
      }),

    redirectOutOfScope: (i: { area: string } & Reasoning) =>
      step(ctx, 'redirectOutOfScope', 'redirecionou (fora do escopo)', i, async () => ({
        result: { ok: true }, what: `Assunto de ${i.area}: fora do escopo de TI; funcionário redirecionado.`, data: { area: i.area },
      })),
  };
}

export type Actions = ReturnType<typeof buildActions>;
