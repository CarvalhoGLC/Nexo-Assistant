'use client';

import { useCallback, useEffect, useState } from 'react';
import { DecisionSteps } from '@/components/DecisionSteps';
import { DraftCard } from '@/components/DraftCard';
import { TicketCardView } from '@/components/TicketCardView';
import { ago, fmtDateTime, fmtTime, priorityLabel, statusLabel } from '@/lib/format';
import { CONVERSATION_STATUS_LABEL, HANDOFF_REASON_LABEL, type ConversationStatus, type HandoffReason, type MessageDTO, type TicketCard } from '@/lib/types';

type Filter = 'all' | 'needs' | 'agent' | 'mine';
type Item = {
  id: string; status: ConversationStatus; updatedAt: string; user: { id: string; name: string; department: string };
  lastMessage: { text: string; sender: string; createdAt: string } | null;
  handoff: { reason: HandoffReason; level: string | null; confidence: number | null; ticket: string | null } | null;
};
type List = { counts: Record<Filter, number>; items: Item[] };
type Detail = {
  conversation: {
    id: string; status: ConversationStatus; assignedAnalyst: { id: string; name: string } | null;
    handoff: { reason: HandoffReason; summary: string | null; level: string | null; confidence: number | null; ticket: string | null; at?: string } | null;
  };
  user: { id: string; name: string; email: string; department: string };
  messages: MessageDTO[]; tickets: TicketCard[]; counts: { open: number; closed: number };
};
type Me = { id: string; name: string; role: string };

const TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todas' }, { key: 'needs', label: 'Para você' }, { key: 'agent', label: 'Com o agent' }, { key: 'mine', label: 'Minhas' },
];

const initials = (n: string) => n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

function tagFor(i: Item): { text: string; cls: string } | null {
  if (i.status === 'AGENT') return { text: 'Agent atendendo', cls: 'ok' };
  if (i.status === 'CLOSED') return { text: 'Encerrada', cls: '' };
  if (i.status === 'ANALYST') return { text: 'Analista atendendo', cls: 'ok' };
  if (i.handoff?.reason === 'low_confidence') return { text: `Agent pediu ajuda · confiança ${Math.round((i.handoff.confidence ?? 0) * 100)}%`, cls: 'low' };
  return { text: `Transferida${i.handoff?.ticket ? ` · ${i.handoff.ticket}` : ''}`, cls: '' };
}

export default function Analista() {
  const [me, setMe] = useState<Me | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [list, setList] = useState<List | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    const r = await fetch(`/api/conversations?filter=${filter}&q=${encodeURIComponent(q)}`);
    if (r.status === 401 || r.status === 403) { location.href = '/'; return; }
    if (r.ok) setList((await r.json()) as List);
  }, [filter, q]);

  const loadDetail = useCallback(async (id: string) => {
    const r = await fetch(`/api/conversations/${id}`);
    if (r.ok) setDetail((await r.json()) as Detail);
  }, []);

  useEffect(() => {
    fetch('/api/me').then(async (r) => {
      if (!r.ok) { location.href = '/'; return; }
      const u = (await r.json()) as Me;
      if (u.role !== 'ANALYST') { location.href = '/atendimento'; return; }
      setMe(u);
    });
  }, []);

  useEffect(() => {
    void loadList();
    const t = setInterval(() => void loadList(), 5000);
    return () => clearInterval(t);
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    void loadDetail(selectedId);
    const t = setInterval(() => void loadDetail(selectedId), 4000);
    return () => clearInterval(t);
  }, [selectedId, loadDetail]);

  async function act(action: 'take' | 'message' | 'return' | 'close', body?: string) {
    if (!selectedId) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/analyst', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversationId: selectedId, action, text: body }) });
      if (!r.ok) { setError(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Ação não concluída.'); return; }
      if (action === 'message') setText('');
      await Promise.all([loadDetail(selectedId), loadList()]);
    } finally {
      setBusy(false);
    }
  }

  const c = detail?.conversation;
  const mine = !!c && c.status === 'ANALYST' && c.assignedAnalyst?.id === me?.id;
  const canTake = !!c && (c.status === 'AWAITING' || c.status === 'AGENT');
  const takenByOther = !!c && c.status === 'ANALYST' && !mine;

  return (
    <div className="console">
      <aside>
        <div className="brand"><span className="mark">N</span><b>Nexo Assist</b></div>
        <div className="user" style={{ margin: '14px 4px' }}><span>{me ? initials(me.name) : '··'}</span><div>{me?.name ?? '…'}<small>Disponível</small></div></div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar conversa ou chamado" aria-label="Pesquisar" />
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={filter === t.key} className={filter === t.key ? 'on' : ''} onClick={() => setFilter(t.key)}>
              {t.label}<i>{list?.counts[t.key] ?? 0}</i>
            </button>
          ))}
        </div>
        {list && list.items.length === 0 && <h4>Nenhuma conversa neste filtro</h4>}
        {list?.items.map((i) => {
          const tag = tagFor(i);
          return (
            <button key={i.id} className={`conv ${selectedId === i.id ? 'sel' : ''}`} onClick={() => { setSelectedId(i.id); setDetail(null); setError(''); }}>
              <div className="top"><span>{i.user.name}</span><span className="time">{ago(i.updatedAt)}</span></div>
              <small>{i.lastMessage ? `${i.lastMessage.sender === 'AGENT' ? 'Nexo: ' : ''}${i.lastMessage.text}` : 'Sem mensagens'}</small>
              {tag && <small className={`tag ${tag.cls}`}>{tag.text}</small>}
            </button>
          );
        })}
        <a style={{ marginTop: 'auto', padding: '10px 12px', color: '#b8c0ca', cursor: 'pointer' }} onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/'; }}>Sair</a>
      </aside>

      <main>
        {!selectedId && <div className="empty small"><h1>Console do analista</h1><p>Selecione uma conversa para ver o histórico, as decisões do agent e os chamados do funcionário.</p></div>}
        {selectedId && !detail && <div className="empty small"><p>Carregando conversa…</p></div>}
        {detail && c && (
          <>
            <header className="convhead">
              <div><b>{detail.user.name}</b><small>{detail.user.email} · {detail.user.department}</small></div>
              <span className={`status ${c.status}`}>● {CONVERSATION_STATUS_LABEL[c.status]}{c.assignedAnalyst ? ` · ${c.assignedAnalyst.name}` : ''}</span>
              {canTake && <button className="primary" disabled={busy} onClick={() => void act('take')}>Assumir atendimento</button>}
              {mine && <button disabled={busy} onClick={() => void act('return')}>Devolver ao agent</button>}
              {mine && <button disabled={busy} onClick={() => void act('close')}>Encerrar atendimento</button>}
            </header>

            <div className="bar">
              <div className="center">
                {error && <div className="banner error" style={{ margin: '12px 80px 0' }} role="alert">{error}</div>}
                {c.handoff && (
                  <div className="handoff">
                    <b>{HANDOFF_REASON_LABEL[c.handoff.reason]}{c.handoff.level ? ` · Suporte ${c.handoff.level}` : ''}{c.handoff.reason === 'low_confidence' && c.handoff.confidence != null ? ` · confiança ${Math.round(c.handoff.confidence * 100)}%` : ''}</b>
                    {c.handoff.at && <small>Transferida em {fmtDateTime(c.handoff.at)}{c.handoff.ticket ? ` · ${c.handoff.ticket}` : ''}</small>}
                    <p>{c.handoff.summary}</p>
                  </div>
                )}
                <div className="history">
                  {detail.messages.map((m) => {
                    if (m.sender === 'SYSTEM') return <div key={m.id} className="msg system"><div className="bubble">{m.text} · {fmtTime(m.createdAt)}</div></div>;
                    const who = m.sender === 'USER' ? detail.user.name : m.sender === 'ANALYST' ? `${m.authorName ?? 'Analista'} · Suporte` : 'Nexo Assist';
                    return (
                      <div key={m.id} className={`msg ${m.sender.toLowerCase()}`}>
                        <div className="who">{who} · {fmtTime(m.createdAt)}</div>
                        {m.steps && <DecisionSteps steps={m.steps} />}
                        <div className="bubble">{m.text}</div>
                        {m.cards?.map((t) => <TicketCardView key={t.number} t={t} />)}
                        {m.draft && <DraftCard d={m.draft} busy onConfirm={() => undefined} onEdit={() => undefined} onCancel={() => undefined} />}
                      </div>
                    );
                  })}
                </div>
                <footer className="takebar">
                  <div>
                    {mine ? 'O agent está pausado enquanto você atende esta conversa.'
                      : takenByOther ? `Esta conversa está com ${c.assignedAnalyst?.name}.`
                      : c.status === 'CLOSED' ? 'Conversa encerrada.' : 'Assuma o atendimento para responder.'}
                  </div>
                  <div className="composer">
                    <input
                      value={text} disabled={!mine || busy} onChange={(e) => setText(e.target.value)} aria-label="Responder"
                      onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) void act('message', text); }}
                      placeholder={mine ? 'Responder ao funcionário…' : 'Assuma o atendimento para responder'}
                    />
                    <button disabled={!mine || busy || !text.trim()} onClick={() => void act('message', text)}>Enviar</button>
                  </div>
                </footer>
              </div>

              <aside className="sidepanel">
                <h3>Chamados de {detail.user.name.split(' ')[0]}</h3>
                <small>{detail.counts.open} abertos · {detail.counts.closed} encerrados</small>
                {c.handoff?.ticket && <h5>Desta conversa</h5>}
                {detail.tickets.filter((t) => t.number === c.handoff?.ticket).map((t) => <TicketRow key={t.number} t={t} hl />)}
                <h5>Outros chamados</h5>
                {detail.tickets.filter((t) => t.number !== c.handoff?.ticket).map((t) => <TicketRow key={t.number} t={t} />)}
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function TicketRow({ t, hl }: { t: TicketCard; hl?: boolean }) {
  return (
    <div className={`ticketitem ${hl ? 'hl' : ''}`}>
      <b>{t.number} · {statusLabel(t.status)}</b>
      <strong>{t.title}</strong>
      <small>{t.category} · prioridade {priorityLabel(t.priority).toLowerCase()} · atualizado {ago(t.lastUpdate)}</small>
      {t.overdue && <small className="late">Prazo vencido</small>}
    </div>
  );
}
