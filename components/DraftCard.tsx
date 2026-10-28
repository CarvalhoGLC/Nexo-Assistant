import { fmtDateTime, priorityLabel } from '@/lib/format';
import type { DraftDTO } from '@/lib/types';

const KIND = { create: 'Novo chamado', update: 'Atualização de chamado', reopen: 'Reabertura de chamado' } as const;
const STATUS = { PENDING: 'Aguardando confirmação', CONFIRMED: 'Confirmado', CANCELLED: 'Cancelado', SUPERSEDED: 'Substituído por um rascunho mais novo' } as const;

export function DraftCard(p: { d: DraftDTO; busy: boolean; onConfirm: () => void; onEdit: () => void; onCancel: () => void }) {
  const { d } = p;
  return (
    <div className={`draft ${d.status}`}>
      <b>{KIND[d.kind]}{d.ticketNumber ? ` · ${d.ticketNumber}` : ''} · Rascunho {d.code} · {STATUS[d.status]}{d.resultNumber ? ` (${d.resultNumber})` : ''}</b>
      <h3>{d.title}</h3>
      <p>{d.description}</p>
      <div className="grid">
        <span>Categoria<strong>{d.category}</strong></span>
        <span>Prioridade<strong>{priorityLabel(d.priority)} · resposta até {fmtDateTime(d.dueAt)}</strong></span>
        <span>Afetados<strong>{d.affected}</strong></span>
      </div>
      <p className="why">{d.priorityReason}</p>
      {d.status === 'PENDING' && (
        <div className="row">
          <button type="button" onClick={p.onConfirm} disabled={p.busy}>{p.busy ? 'Confirmando…' : 'Confirmar'}</button>
          <button type="button" onClick={p.onEdit} disabled={p.busy}>Editar</button>
          <button type="button" onClick={p.onCancel} disabled={p.busy}>Cancelar</button>
        </div>
      )}
    </div>
  );
}
