import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { legacy } from '@/services/legacy';
import { ticketService, toCard } from '@/services/ticket-service';

/** Lista os chamados do usuário da sessão. Criação/atualização só acontecem via /api/chat/draft (confirmação). */
export async function GET() {
  try {
    const user = await requireUser('EMPLOYEE');
    const tickets = await legacy(() => ticketService.listForUser(user.id));
    return NextResponse.json(tickets.map((t) => toCard(t)));
  } catch (e) {
    return handleError(e);
  }
}
