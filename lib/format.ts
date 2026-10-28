import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type TicketStatus } from './types';

export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
export const fmtDateTime = (iso: string) => `${fmtDay(iso)}, ${fmtTime(iso)}`;
export const priorityLabel = (p: string) => PRIORITY_LABEL[p as Priority] ?? p;
export const statusLabel = (s: string) => STATUS_LABEL[s as TicketStatus] ?? s;

export function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  if (mins < 1440) return `há ${Math.round(mins / 60)} h`;
  return `há ${Math.round(mins / 1440)} d`;
}
