import { beforeEach, describe, expect, it } from 'vitest';
import { buildActions } from '@/agent/actions';
import { db } from '@/lib/db';
import { analystClose, analystReply, analystReturn, analystTake, ConversationError, conversationForUser, handoffToAnalyst } from '@/services/conversation-service';
import { cancelDraft, confirmDraft, DraftError } from '@/services/draft-service';
import { ticketService } from '@/services/ticket-service';
import { ctxFor, daysAgo, mkTicket, mkUser, R, resetDb } from './helpers';

let ana: Awaited<ReturnType<typeof mkUser>>;
let carla: Awaited<ReturnType<typeof mkUser>>;
let rafael: Awaited<ReturnType<typeof mkUser>>;
let convId: string;

beforeEach(async () => {
  await resetDb();
  ana = await mkUser('Ana Souza'); carla = await mkUser('Carla Mendes'); rafael = await mkUser('Rafael Lima', 'ANALYST');
  convId = (await conversationForUser(ana.id)).id;
});

const vpn = { kind: 'create', title: 'VPN não conecta — erro 809', description: 'Notebook Windows 11 não conecta na VPN, erro 809.', type: 'INC', category: 'Rede e VPN', affected: 'Só eu', blocksWork: true, sameDayCommitment: true, hasWorkaround: false, ...R } as const;

describe('privacidade: chamados de um funcionário nunca chegam a outro', () => {
  it('serviço filtra por dono', async () => {
    const t = await mkTicket(carla.id, { number: 'INC-20999' });
    expect(await ticketService.getForUser(ana.id, t.number)).toBeNull();
    expect(await ticketService.listForUser(ana.id)).toHaveLength(0);
  });
  it('ferramenta getTicket responde "não encontrado" para chamado alheio e não gera card', async () => {
    await mkTicket(carla.id, { number: 'INC-20999' });
    const { ctx, state } = ctxFor(ana.id, convId);
    const r = await buildActions(ctx).getTicket({ ticketNumber: 'INC-20999', ...R });
    expect(JSON.stringify(r)).toContain('não encontrado');
    expect(state.cards).toHaveLength(0);
  });
  it('listMyTickets só devolve os chamados do próprio usuário', async () => {
    await mkTicket(ana.id, { number: 'INC-20001' }); await mkTicket(carla.id, { number: 'INC-20002' });
    const { ctx, state } = ctxFor(ana.id, convId);
    await buildActions(ctx).listMyTickets({ scope: 'all', showAsChoices: false, ...R });
    expect(state.steps[0]?.data?.numeros).toEqual(['INC-20001']);
  });
  it('outro funcionário não consegue confirmar o rascunho de Ana', async () => {
    const { ctx } = ctxFor(ana.id, convId);
    await buildActions(ctx).proposeDraft(vpn);
    const d = await db.draft.findFirstOrThrow();
    await expect(confirmDraft(carla.id, d.code)).rejects.toBeInstanceOf(DraftError);
    expect(await db.ticket.count()).toBe(0);
  });
});

describe('abertura de chamado: só depois da confirmação', () => {
  it('proposeDraft NÃO cria chamado; prioridade vem da regra, não do modelo', async () => {
    const { ctx, state } = ctxFor(ana.id, convId);
    await buildActions(ctx).proposeDraft(vpn);
    expect(await db.ticket.count()).toBe(0);
    const d = await db.draft.findFirstOrThrow();
    expect(d.priority).toBe('HIGH'); // compromisso no mesmo dia
    expect(state.steps.map((s) => s.action)).toEqual(['classifyPriority', 'checkSla', 'proposeDraft']); // três chips, como no protótipo
    const main = state.steps.find((s) => s.action === 'proposeDraft');
    expect(main).toMatchObject({ confidence: 0.9, status: 'ok' });
    expect(main?.understood).toBeTruthy();
    expect(main?.reason).toBeTruthy();
    expect(state.steps[0]?.what).toContain('Alta');
  });
  it('confirmar cria o chamado com os dados do SERVIDOR e responde com card', async () => {
    const { ctx } = ctxFor(ana.id, convId);
    await buildActions(ctx).proposeDraft(vpn);
    const d = await db.draft.findFirstOrThrow();
    const msgs = await confirmDraft(ana.id, d.code);
    const t = await db.ticket.findFirstOrThrow();
    expect(t).toMatchObject({ userId: ana.id, priority: 'HIGH', category: 'Rede e VPN', status: 'OPEN' });
    expect(msgs[0]?.cards?.[0]?.number).toBe(t.number);
    await expect(confirmDraft(ana.id, d.code)).rejects.toBeInstanceOf(DraftError); // não confirma duas vezes
  });
  it('cancelar não cria nada', async () => {
    const { ctx } = ctxFor(ana.id, convId);
    await buildActions(ctx).proposeDraft(vpn);
    await cancelDraft(ana.id, (await db.draft.findFirstOrThrow()).code);
    expect(await db.ticket.count()).toBe(0);
  });
  it('novo rascunho torna o anterior obsoleto (só o último é confirmável)', async () => {
    const { ctx } = ctxFor(ana.id, convId);
    const a = buildActions(ctx);
    await a.proposeDraft(vpn); await a.proposeDraft({ ...vpn, title: 'VPN não conecta (ajustado)' });
    const ds = await db.draft.findMany({ orderBy: { createdAt: 'asc' } });
    expect(ds.map((d) => d.status)).toEqual(['SUPERSEDED', 'PENDING']);
  });
  it('números de chamado são sequenciais e únicos', async () => {
    const a = await ticketService.create(ana.id, { title: 'a', description: 'a', type: 'INC', category: 'Outros', priority: 'LOW', affected: 'Só eu' });
    const b = await ticketService.create(ana.id, { title: 'b', description: 'b', type: 'INC', category: 'Outros', priority: 'LOW', affected: 'Só eu' });
    expect(a.number).not.toBe(b.number);
  });
  it('confiança baixa recusa o rascunho e manda escalar', async () => {
    const { ctx, state } = ctxFor(ana.id, convId);
    const r = await buildActions(ctx).proposeDraft({ ...vpn, confidence: 0.3 });
    expect(JSON.stringify(r)).toContain('confianca_baixa');
    expect(state.steps[0]?.status).toBe('error');
    expect(await db.draft.count()).toBe(0);
  });
  it('chamado crítico é transferido automaticamente a um analista após confirmar', async () => {
    const { ctx } = ctxFor(ana.id, convId);
    await buildActions(ctx).proposeDraft({ ...vpn, affected: 'Minha equipe', sameDayCommitment: false });
    await confirmDraft(ana.id, (await db.draft.findFirstOrThrow()).code);
    const c = await db.conversation.findUniqueOrThrow({ where: { id: convId } });
    expect(c).toMatchObject({ status: 'AWAITING', handoffReason: 'critical', handoffLevel: 'N2' });
  });
});

describe('duplicidade e reabertura', () => {
  it('bloqueia criar quando já existe chamado aberto do mesmo problema', async () => {
    await mkTicket(ana.id, { number: 'INC-20500', title: 'VPN não conecta no notebook — erro 809', description: 'Erro 809 na VPN', category: 'Rede e VPN' });
    const { ctx } = ctxFor(ana.id, convId);
    const r = await buildActions(ctx).proposeDraft(vpn);
    expect(JSON.stringify(r)).toContain('duplicidade');
    expect(await db.draft.count()).toBe(0);
  });
  it('permite criar se o funcionário confirmou que é outro problema', async () => {
    await mkTicket(ana.id, { title: 'VPN não conecta no notebook — erro 809', description: 'Erro 809 na VPN', category: 'Rede e VPN' });
    const { ctx } = ctxFor(ana.id, convId);
    await buildActions(ctx).proposeDraft({ ...vpn, confirmedDifferentProblem: true });
    expect(await db.draft.count()).toBe(1);
  });
  it('atualiza em vez de duplicar: confirmar update mantém 1 chamado e renova o prazo', async () => {
    const t = await mkTicket(ana.id, { number: 'INC-20500', lastUpdate: daysAgo(5) });
    const { ctx } = ctxFor(ana.id, convId);
    await buildActions(ctx).proposeDraft({ kind: 'update', ticketNumber: t.number, title: 'x', description: 'Agora também trava ao abrir o Excel.', type: 'INC', category: 'Hardware', affected: 'Só eu', blocksWork: false, sameDayCommitment: false, hasWorkaround: true, ...R });
    await confirmDraft(ana.id, (await db.draft.findFirstOrThrow()).code);
    const after = await db.ticket.findMany();
    expect(after).toHaveLength(1);
    expect(after[0]?.description).toContain('Excel');
    expect(Date.now() - (after[0]?.lastUpdate.getTime() ?? 0)).toBeLessThan(5000);
  });
  it('reabre resolvido há 4 dias, mas recusa resolvido há 12 dias', async () => {
    const recent = await mkTicket(ana.id, { number: 'INC-20150', status: 'RESOLVED', resolvedAt: daysAgo(4), lastUpdate: daysAgo(4) });
    const old = await mkTicket(ana.id, { number: 'INC-19877', status: 'RESOLVED', resolvedAt: daysAgo(12), lastUpdate: daysAgo(12) });
    const { ctx, state } = ctxFor(ana.id, convId);
    const a = buildActions(ctx);
    const ok = { kind: 'reopen', title: 'x', description: 'Voltou a bloquear.', type: 'INC', category: 'Acesso', affected: 'Só eu', blocksWork: true, sameDayCommitment: false, hasWorkaround: false, ...R } as const;
    await a.proposeDraft({ ...ok, ticketNumber: recent.number });
    await a.proposeDraft({ ...ok, ticketNumber: old.number });
    const drafts = state.steps.filter((s) => s.action === 'proposeDraft');
    expect(drafts.map((s) => s.status)).toEqual(['ok', 'error']);
  });
});

describe('transferência e pausa do agent', () => {
  it('handoff marca "aguardando atendente", guarda resumo e transfere o chamado', async () => {
    const t = await mkTicket(ana.id, { number: 'INC-20311' });
    await handoffToAnalyst(convId, { reason: 'user_request', summary: 'Notebook lento há 5 dias', ticketNumber: t.number });
    const c = await db.conversation.findUniqueOrThrow({ where: { id: convId } });
    expect(c).toMatchObject({ status: 'AWAITING', handoffSummary: 'Notebook lento há 5 dias', handoffTicket: 'INC-20311' });
    expect((await db.ticket.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('ANALYST');
  });
  it('transferir o chamado NÃO zera o prazo (continua vencido)', async () => {
    const t = await mkTicket(ana.id, { number: 'INC-20311', lastUpdate: daysAgo(6) });
    await handoffToAnalyst(convId, { reason: 'overdue', summary: 's', ticketNumber: t.number });
    const after = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.lastUpdate.getTime()).toBe(t.lastUpdate.getTime());
  });
  it('analista assume, responde, devolve ao agent e encerra; só o dono da conversa age', async () => {
    const marina = await mkUser('Marina Alves', 'ANALYST');
    await handoffToAnalyst(convId, { reason: 'user_request', summary: 's' });
    await expect(analystReply(convId, rafael, 'oi')).rejects.toBeInstanceOf(ConversationError); // não assumiu
    await analystTake(convId, rafael);
    await expect(analystReply(convId, marina, 'oi')).rejects.toBeInstanceOf(ConversationError); // outro analista
    await analystReply(convId, rafael, 'Olá, Ana!');
    await analystReturn(convId, rafael);
    expect((await db.conversation.findUniqueOrThrow({ where: { id: convId } })).status).toBe('AGENT');
    await handoffToAnalyst(convId, { reason: 'overdue', summary: 's2' });
    await analystTake(convId, marina);
    await analystClose(convId, marina);
    expect((await db.conversation.findUniqueOrThrow({ where: { id: convId } })).status).toBe('CLOSED');
  });
  it('analista pode devolver ao agent uma conversa que ainda aguarda atendente (sem assumir)', async () => {
    await handoffToAnalyst(convId, { reason: 'user_request', summary: 's' });
    await analystReturn(convId, rafael);
    expect((await db.conversation.findUniqueOrThrow({ where: { id: convId } })).status).toBe('AGENT');
  });
  it('estado da conversa sobrevive a "reinício" (nova leitura do banco)', async () => {
    await handoffToAnalyst(convId, { reason: 'user_request', summary: 's' });
    await analystTake(convId, rafael);
    const again = await conversationForUser(ana.id);
    expect(again).toMatchObject({ id: convId, status: 'ANALYST', assignedAnalystId: rafael.id });
  });
});
