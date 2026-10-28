import { ago, fmtDateTime, priorityLabel, statusLabel } from '@/lib/format';
import type { TicketCard } from '@/lib/types';
import s from './cards.module.css';

export const statusTone = (st: string): 'amber' | 'blue' | 'green' | 'gray' =>
  st === 'ANALYST' || st === 'PENDING' ? 'amber' : st === 'IN_PROGRESS' || st === 'OPEN' ? 'blue' : st === 'APPROVED' || st === 'RESOLVED' ? 'green' : 'gray';

export const priorityTone = (p: string): 'amber' | 'blue' | 'gray' => (p === 'CRITICAL' || p === 'HIGH' ? 'amber' : p === 'MEDIUM' ? 'gray' : 'blue');

export function TicketCardView({ t }: { t: TicketCard }) {
  return (
    <div className={s.card}>
      <div className={s.top}>
        <span>Chamado · <b>{t.number}</b></span>
        <span className={`${s.status} ${s[statusTone(t.status)]}`}><i className={s.dot} />{statusLabel(t.status)}</span>
      </div>
      <div className={s.title}>{t.title}</div>
      <div className={s.desc}>{t.description.split('\n')[0]}</div>
      <div className={s.grid}>
        <div>Categoria<strong>{t.category}</strong></div>
        <div>Prioridade<strong><i className={`${s.dot} ${s[priorityTone(t.priority)]}`} />{priorityLabel(t.priority)}</strong></div>
        <div>Aberto em<strong>{fmtDateTime(t.createdAt)}</strong></div>
        <div>Última atualização
          <strong className={t.overdue ? s.late : undefined}>{ago(t.lastUpdate)}{t.overdue && <span className={s.lateTxt}> · prazo vencido</span>}</strong>
        </div>
      </div>
    </div>
  );
}
