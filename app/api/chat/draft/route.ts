import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { handleError, HttpError } from '@/lib/http';
import { conversationForUser } from '@/services/conversation-service';
import { cancelDraft, confirmDraft, DraftError } from '@/services/draft-service';
import { db } from '@/lib/db';
import { TicketsUnavailableError } from '@/services/legacy';

const Body = z.object({ code: z.string().min(2).max(20), action: z.enum(['confirm', 'cancel']) });

export async function POST(req: Request) {
  try {
    const user = await requireUser('EMPLOYEE');
    const body = Body.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, 'Requisição inválida.');
    const messages = body.data.action === 'confirm' ? await confirmDraft(user.id, body.data.code) : await cancelDraft(user.id, body.data.code);
    const conv = await conversationForUser(user.id);
    const fresh = await db.conversation.findUnique({ where: { id: conv.id } });
    return NextResponse.json({ messages, status: fresh?.status ?? 'AGENT' });
  } catch (e) {
    if (e instanceof DraftError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof TicketsUnavailableError)
      return NextResponse.json({ error: 'O sistema de chamados está indisponível agora. Tente confirmar de novo em instantes; o rascunho foi mantido.' }, { status: 503 });
    return handleError(e);
  }
}
