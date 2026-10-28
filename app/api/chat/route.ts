import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runAgent, type HistoryItem } from '@/agent';
import { requireSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { handleError, HttpError } from '@/lib/http';
import { maxMessageChars, maxMessagesPerSession } from '@/lib/limits';
import type { ChatEvent, ConversationStatus, SessionInfo } from '@/lib/types';
import { addMessage, conversationForUser, toMessageDTOs } from '@/services/conversation-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Body = z.object({ text: z.string() });

/** Estado da conversa do funcionário logado (usado ao abrir a tela, para "continuar de onde parei", e no polling durante atendimento humano). */
export async function GET() {
  try {
    const { user, messageCount } = await requireSession('EMPLOYEE');
    const conv = await conversationForUser(user.id);
    const messages = await db.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: 'asc' }, take: 200 });
    return NextResponse.json({
      status: conv.status, messages: await toMessageDTOs(messages),
      session: { count: messageCount, max: maxMessagesPerSession() } satisfies SessionInfo,
    });
  } catch (e) {
    return handleError(e);
  }
}

async function history(conversationId: string): Promise<HistoryItem[]> {
  const recent = (await db.message.findMany({ where: { conversationId, sender: { in: ['USER', 'AGENT', 'ANALYST'] } }, orderBy: { createdAt: 'desc' }, take: 10 })).reverse();
  const items: HistoryItem[] = recent.map((m) =>
    m.sender === 'USER' ? { role: 'user', content: m.text } : { role: 'assistant', content: m.sender === 'ANALYST' ? `[Analista] ${m.text}` : m.text });
  while (items[0] && items[0].role !== 'user') items.shift();
  return items;
}

export async function POST(req: Request) {
  try {
    const session = await requireSession('EMPLOYEE');
    const user = session.user; // identidade SEMPRE da sessão; o corpo só traz o texto
    const body = Body.safeParse(await req.json().catch(() => null));
    const text = body.success ? body.data.text.trim() : '';
    if (!text) throw new HttpError(400, 'O texto da mensagem é obrigatório.');
    if (text.length > maxMessageChars()) throw new HttpError(400, `Mensagem longa demais (máximo ${maxMessageChars()} caracteres).`);

    const max = maxMessagesPerSession();
    if (session.messageCount >= max) throw new HttpError(429, `Limite de ${max} mensagens por sessão atingido. Saia e entre de novo para continuar.`);

    let conv = await conversationForUser(user.id);
    if (conv.status === 'CLOSED' || conv.status === 'RESOLVED') conv = await db.conversation.update({ where: { id: conv.id }, data: { status: 'AGENT' } });

    const turnStart = new Date();
    await addMessage(conv.id, { sender: 'USER', text, createdAt: turnStart });
    const updated = await db.session.update({ where: { id: session.id }, data: { messageCount: { increment: 1 } } });
    const sessionInfo: SessionInfo = { count: updated.messageCount, max };

    // Transferida: o agent NÃO responde (Anexo A). A mensagem fica registrada para o analista.
    if (conv.status !== 'AGENT')
      return NextResponse.json({ paused: true, status: conv.status, messages: [], session: sessionInfo });

    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (e: ChatEvent) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        try {
          const result = await runAgent({
            user, conversationId: conv.id, history: await history(conv.id),
            onStep: (step) => send({ type: 'step', step }), onText: (delta) => send({ type: 'text', delta }),
          });
          const { state } = result;
          let reply = result.text;
          if (!reply) reply = state.draftId ? 'Confira os dados do rascunho antes de eu criar o chamado.' : state.escalated ? 'Encaminhei sua conversa para um analista, com o resumo do caso.' : 'Não consegui concluir isso agora. Quer que eu chame um analista?';
          if (!result.text && !state.draftId && !state.escalated && !state.options)
            state.options = { kind: 'options', question: 'Como prefere continuar?', items: [{ label: 'Falar com um analista', value: 'Quero falar com um analista' }] };
          // O texto do agent entra no histórico no instante do início do turno, antes do aviso de transferência gerado pelas ferramentas.
          await addMessage(conv.id, {
            sender: 'AGENT', text: reply, steps: state.steps, cards: state.cards, options: state.options, draftId: state.draftId,
            createdAt: new Date(turnStart.getTime() + 1),
          });
          const fresh = await db.message.findMany({ where: { conversationId: conv.id, createdAt: { gt: turnStart } }, orderBy: { createdAt: 'asc' } });
          const after = await db.conversation.findUnique({ where: { id: conv.id } });
          send({ type: 'done', messages: await toMessageDTOs(fresh), status: (after?.status ?? 'AGENT') as ConversationStatus, session: sessionInfo });
        } catch (err) {
          console.error('Falha no turno do agent:', err);
          // Não cobra a mensagem do funcionário quando o assistente falha.
          const refunded = await db.session.update({ where: { id: session.id }, data: { messageCount: { decrement: 1 } } }).catch(() => updated);
          const msg = await addMessage(conv.id, {
            sender: 'AGENT', text: 'Tive um problema técnico para responder agora. Você pode tentar de novo ou falar com um analista.',
            options: { kind: 'options', question: 'Como prefere continuar?', items: [{ label: 'Falar com um analista', value: 'Quero falar com um analista' }] },
            createdAt: new Date(turnStart.getTime() + 1),
          });
          send({ type: 'done', messages: await toMessageDTOs([msg]), status: 'AGENT', session: { count: refunded.messageCount, max } });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store, no-transform', connection: 'keep-alive' } });
  } catch (e) {
    return handleError(e);
  }
}
