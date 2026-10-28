import { AFFECTED_LABEL, fmtShort, priorityLabel } from '@/lib/format';
import type { DraftDTO } from '@/lib/types';
import { priorityTone } from './TicketCardView';
import s from './cards.module.css';

const KIND = { create: 'Novo chamado', update: 'Atualização de chamado', reopen: 'Reabertura de chamado' } as const;
const STATUS = {
  PENDING: { text: 'Aguardando confirmação', tone: 'amber' }, CONFIRMED: { text: 'Confirmado', tone: 'green' },
  CANCELLED: { text: 'Cancelado', tone: 'gray' }, SUPERSEDED: { text: 'Substituído por um rascunho mais novo', tone: 'gray' },
} as const;

export function DraftCard(p: { d: DraftDTO; busy: boolean; readOnly?: boolean; onConfirm: () => void; onEdit: () => void; onCancel: () => void }) {
  const { d } = p;
  const st = STATUS[d.status];
  return (
    <div className={`${s.card} ${d.status !== 'PENDING' ? s.done : ''}`}>
      <div className={s.top}>
        <span>{KIND[d.kind]}{d.ticketNumber ? ` · ${d.ticketNumber}` : ''} · Rascunho {d.code}</span>
        <span className={`${s.status} ${s[st.tone]}`}><i className={s.dot} />{st.text}{d.resultNumber ? ` (${d.resultNumber})` : ''}</span>
      </div>
      <div className={s.title}>{d.title}</div>
      <div className={s.desc}>{d.description}</div>
      <div className={s.grid}>
        <div>Categoria<strong>{d.category}</strong></div>
        <div>Prioridade<strong><i className={`${s.dot} ${s[priorityTone(d.priority)]}`} />{priorityLabel(d.priority)} <span className={s.lateTxt}>· resposta até {fmtShort(d.dueAt)}</span></strong></div>
        <div>Afetados<strong>{AFFECTED_LABEL[d.affected] ?? d.affected}</strong></div>
      </div>
      <div className={s.why} style={{ marginTop: -4 }}>{d.priorityReason}</div>
      {d.status === 'PENDING' && !p.readOnly && (
        <div className={s.foot}>
          <button type="button" className={`${s.btn} ${s.primary}`} onClick={p.onConfirm} disabled={p.busy}>{p.busy ? 'Confirmando…' : 'Confirmar'}<span className={s.kbd}>⌘↵</span></button>
          <button type="button" className={s.btn} onClick={p.onEdit} disabled={p.busy}>Editar</button>
          <button type="button" className={`${s.btn} ${s.ghost}`} onClick={p.onCancel} disabled={p.busy}>Cancelar</button>
        </div>
      )}
    </div>
  );
}
