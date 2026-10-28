import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { handleError, HttpError } from '@/lib/http';
import { analystClose, analystReply, analystReturn, analystTake, ConversationError } from '@/services/conversation-service';

const Body = z.object({
  conversationId: z.string().min(1),
  action: z.enum(['take', 'message', 'return', 'close']),
  text: z.string().max(2000).optional(),
});

/** Ações do analista. O analista é SEMPRE o usuário da sessão (nunca vem do corpo) e o papel é validado. */
export async function POST(req: Request) {
  try {
    const analyst = await requireUser('ANALYST');
    const b = Body.safeParse(await req.json().catch(() => null));
    if (!b.success) throw new HttpError(400, 'Requisição inválida.');
    const { conversationId, action, text } = b.data;
    if (action === 'take') await analystTake(conversationId, analyst);
    else if (action === 'return') await analystReturn(conversationId, analyst);
    else if (action === 'close') await analystClose(conversationId, analyst);
    else {
      if (!text?.trim()) throw new HttpError(400, 'Mensagem vazia.');
      await analystReply(conversationId, analyst, text.trim());
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ConversationError) return NextResponse.json({ error: e.message }, { status: 409 });
    return handleError(e);
  }
}
