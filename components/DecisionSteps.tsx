'use client';

import { useState } from 'react';
import type { DecisionStep } from '@/lib/types';

const level = (c: number) => (c >= 0.8 ? 'high' : c >= 0.5 ? 'mid' : 'low');

/** Chips com as ações do agent + detalhe expansível: o que entendeu, o que fez, com que segurança e por quê. */
export function DecisionSteps({ steps, defaultOpen = false }: { steps: DecisionStep[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (steps.length === 0) return null;
  return (
    <div className="steps">
      <div className="actions">
        {steps.map((s) => (
          <span key={s.id} className={s.status === 'error' ? 'err' : undefined}>
            {s.status === 'error' ? '✕' : '✓'} {s.label}
          </span>
        ))}
        <button type="button" className="linkbtn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Ocultar decisões' : 'Ver decisões'}
        </button>
      </div>
      {open && (
        <ol className="decisions">
          {steps.map((s, i) => (
            <li key={s.id} className={s.status === 'error' ? 'err' : undefined}>
              <div className="dhead">
                <b>{i + 1}. {s.label}</b>
                <span className={`conf ${level(s.confidence)}`} title="Segurança informada pelo agent">
                  <i style={{ width: `${Math.round(s.confidence * 100)}%` }} />
                  {Math.round(s.confidence * 100)}%
                </span>
                <small>{s.ms} ms</small>
              </div>
              <dl>
                <dt>Entendeu</dt><dd>{s.understood}</dd>
                <dt>Fez</dt><dd>{s.what}</dd>
                <dt>Por quê</dt><dd>{s.reason}</dd>
              </dl>
              {s.data && (
                <details>
                  <summary>Dados da ação ({s.action})</summary>
                  <pre>{JSON.stringify(s.data, null, 2)}</pre>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
