import type { QuickOptions } from '@/lib/types';
import s from './cards.module.css';

/** Opções rápidas. kind="options": chips dentro do balão. kind="tickets": lista selecionável de chamados (Tela 3). */
export function QuickOptionsView({ o, disabled, onPick, hideQuestion }: { o: QuickOptions; disabled: boolean; onPick: (value: string) => void; hideQuestion?: boolean }) {
  if (o.kind === 'tickets')
    return (
      <div className={s.choices} role="radiogroup" aria-label={o.question}>
        {o.items.map((it) => {
          const [id = '', ...rest] = it.label.split(' · ');
          return (
            <button key={it.value} type="button" role="radio" aria-checked={false} className={s.choice} disabled={disabled} onClick={() => onPick(it.label)}>
              <span className={s.radio} /><span className={s.cid}>{id}</span><span>{rest.join(' · ')}</span><span className={s.hint}>{it.hint}</span>
            </button>
          );
        })}
      </div>
    );
  return (
    <>
      {!hideQuestion && <p className={s.q}>{o.question}</p>}
      <div className={s.chips} role="group" aria-label={o.question}>
        {o.items.map((it) => <button key={it.value} type="button" className={s.chip} disabled={disabled} onClick={() => onPick(it.value)}>{it.label}</button>)}
      </div>
    </>
  );
}
