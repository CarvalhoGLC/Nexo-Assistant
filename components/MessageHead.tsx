'use client';

import { useState } from 'react';
import type { DecisionStep } from '@/lib/types';
import s from './messagehead.module.css';

const level = (c: number) => (c >= 0.8 ? 'high' : c >= 0.5 ? 'mid' : 'low');

/** Linha acima da resposta: quem falou + ações do agent (chips). "Ver decisões" abre o detalhe:
 *  o que entendeu, o que fez, com que segurança e por quê. */
export function MessageHead(p: { name: string; badge?: string; badgeTone?: 'ai' | 'support'; time?: string; steps?: DecisionStep[]; align?: 'left' | 'right'; defaultOpen?: boolean }) {
  const steps = p.steps ?? [];
  const [open, setOpen] = useState(p.defaultOpen ?? false);
  return (
    <div className={`${s.wrap} ${p.align === 'right' ? s.right : ''}`}>
      <div className={s.row}>
        <b className={s.name}>{p.name}</b>
        {p.badge && <span className={`${s.badge} ${p.badgeTone === 'support' ? s.support : ''}`}>{p.badge}</span>}
        {steps.map((st) => (
          <span key={st.id} className={`${s.chip} ${st.status === 'error' ? s.err : ''}`}>{st.status === 'error' ? '✕' : '✓'} {st.label}</span>
        ))}
        {p.time && <span className={s.time}>{p.time}</span>}
        {steps.length > 0 && (
          <button type="button" className={s.toggle} onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? 'Ocultar decisões' : 'Ver decisões'}</button>
        )}
      </div>
      {open && (
        <ol className={s.detail}>
          {steps.map((st, i) => (
            <li key={st.id} className={st.status === 'error' ? s.errBox : undefined}>
              <div className={s.dhead}>
                <b>{i + 1}. {st.label}</b>
                <span className={`${s.conf} ${s[level(st.confidence)]}`} title="Segurança informada pelo agent"><i style={{ width: `${Math.round(st.confidence * 100)}%` }} />{Math.round(st.confidence * 100)}%</span>
                {st.ms > 0 && <small>{st.ms} ms</small>}
              </div>
              <dl>
                <dt>Entendeu</dt><dd>{st.understood}</dd>
                <dt>Fez</dt><dd>{st.what}</dd>
                <dt>Por quê</dt><dd>{st.reason}</dd>
              </dl>
              {st.data && <details><summary>Dados da ação ({st.action})</summary><pre>{JSON.stringify(st.data, null, 2)}</pre></details>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
