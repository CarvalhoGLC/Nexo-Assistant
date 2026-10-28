import type { Priority, TicketStatus } from './types';
import { CLOSED_TICKET_STATUSES } from './types';

// Anexo A/B: expediente de segunda a sexta, 8h–18h (horário local do servidor).
const START = 8;
const END = 18;
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

function nextWorkStart(d: Date): Date {
  const r = new Date(d);
  while (isWeekend(r) || r.getHours() >= END) {
    r.setDate(r.getDate() + 1);
    r.setHours(START, 0, 0, 0);
  }
  if (r.getHours() < START) r.setHours(START, 0, 0, 0);
  return r;
}

export function addBusinessHours(from: Date, hours: number): Date {
  let cur = nextWorkStart(from);
  let left = hours * 60;
  for (;;) {
    const endOfDay = new Date(cur);
    endOfDay.setHours(END, 0, 0, 0);
    const avail = (endOfDay.getTime() - cur.getTime()) / 60000;
    if (left <= avail) return new Date(cur.getTime() + left * 60000);
    left -= avail;
    cur = nextWorkStart(endOfDay);
  }
}

export function addBusinessDays(from: Date, days: number): Date {
  const r = new Date(from);
  let left = days;
  while (left > 0) {
    r.setDate(r.getDate() + 1);
    if (!isWeekend(r)) left--;
  }
  return r;
}

export const SLA_LABEL: Record<Priority, string> = {
  CRITICAL: '1 hora', HIGH: '4 horas úteis', MEDIUM: '3 dias úteis', LOW: '5 dias úteis',
};

/** Prazo da próxima resposta/atualização a partir de `from`. Crítica tem plantão 24h (horas corridas). */
export function dueAt(priority: Priority, from: Date): Date {
  switch (priority) {
    case 'CRITICAL': return new Date(from.getTime() + 3600_000);
    case 'HIGH': return addBusinessHours(from, 4);
    case 'MEDIUM': return addBusinessDays(from, 3);
    case 'LOW': return addBusinessDays(from, 5);
  }
}

export const isOpenStatus = (s: string): boolean => !CLOSED_TICKET_STATUSES.includes(s as TicketStatus);

/** Vencido = aberto e sem atualização dentro do prazo da prioridade (vale para 1ª resposta e cada atualização). */
export function isOverdue(t: { status: string; priority: string; lastUpdate: Date }, at: Date): boolean {
  return isOpenStatus(t.status) && dueAt(t.priority as Priority, t.lastUpdate).getTime() < at.getTime();
}

export const REOPEN_WINDOW_DAYS = 7;
export const canReopen = (t: { status: string; resolvedAt: Date | null }, at: Date): boolean =>
  t.status === 'RESOLVED' && !!t.resolvedAt && at.getTime() - t.resolvedAt.getTime() <= REOPEN_WINDOW_DAYS * 86400_000;

/** Prazo para o analista responder uma conversa transferida: N2 em 2 h úteis, N1 em 4 h úteis. */
export const ANALYST_ETA_HOURS = { N1: 4, N2: 2 } as const;
export const respondBy = (handoffAt: Date, level: 'N1' | 'N2'): Date => addBusinessHours(handoffAt, ANALYST_ETA_HOURS[level]);
