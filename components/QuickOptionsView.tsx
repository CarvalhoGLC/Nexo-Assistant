import type { QuickOptions } from '@/lib/types';

export function QuickOptionsView({ o, disabled, onPick }: { o: QuickOptions; disabled: boolean; onPick: (value: string) => void }) {
  return (
    <div className={`opts ${o.kind}`} role="group" aria-label={o.question}>
      {o.items.map((it, i) => (
        <button key={it.value} type="button" disabled={disabled} onClick={() => onPick(it.value)}>
          {o.kind === 'options' && <em>{i + 1}</em>}
          <span>{it.label}{it.hint && <small>{it.hint}</small>}</span>
        </button>
      ))}
    </div>
  );
}
