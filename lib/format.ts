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

const TONES = [
  { bg: '#e6efff', fg: '#1d56c4' }, { bg: '#fde8e0', fg: '#b4451f' }, { bg: '#ece6ff', fg: '#5b3fc4' },
  { bg: '#e3f6ec', fg: '#1b7f52' }, { bg: '#fff1d6', fg: '#a05f00' }, { bg: '#fde6f1', fg: '#b0286a' },
];
export const initials = (name: string): string => name.split(' ').map((p) => p[0] ?? '').slice(0, 2).join('').toUpperCase();
export const avatarTone = (name: string) => TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length]!;

/** "13:43" se for hoje; senão "20 out, 13:43". */
export function fmtShort(iso: string): string {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? fmtTime(iso) : fmtDateTime(iso);
}
export const sameDayLabel = (iso: string): string => (new Date(iso).toDateString() === new Date().toDateString() ? 'Hoje' : fmtDay(iso));
export const AFFECTED_LABEL: Record<string, string> = { 'Só eu': 'Somente você', 'Minha equipe': 'Sua equipe', 'Toda a empresa': 'Toda a empresa' };
