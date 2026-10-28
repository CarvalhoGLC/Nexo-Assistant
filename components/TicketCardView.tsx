import { fmtDateTime, ago, priorityLabel, statusLabel } from '@/lib/format';
import type { TicketCard } from '@/lib/types';

export function TicketCardView({ t }: { t: TicketCard }) {
  return (
    <div className="tcard">
      <div className="thead">
        <b>{t.number}</b>
        <span className={`pill ${t.status}`}>{statusLabel(t.status)}</span>
      </div>
      <strong>{t.title}</strong>
      <p>{t.description.split('\n')[0]}</p>
      <div className="grid">
        <span>Categoria<strong>{t.category}</strong></span>
        <span>Prioridade<strong>{priorityLabel(t.priority)}</strong></span>
        <span>Última atualização<strong>{ago(t.lastUpdate)}</strong></span>
      </div>
      <div className={`due ${t.overdue ? 'late' : ''}`}>
        {t.overdue ? `Prazo vencido (era ${fmtDateTime(t.dueAt)})` : `Próxima atualização até ${fmtDateTime(t.dueAt)}`}
      </div>
    </div>
  );
}
