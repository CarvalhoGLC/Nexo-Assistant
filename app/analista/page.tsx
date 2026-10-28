'use client';

import { useCallback, useEffect, useState } from 'react';
import { LogoMark } from '@/components/AppShell';
import { DraftCard } from '@/components/DraftCard';
import { IconBot, IconChat, IconChevron, IconClose, IconHand, IconHeadset, IconLogout, IconPanel, IconSearch, IconSend, IconSwap } from '@/components/Icons';
import { MessageHead } from '@/components/MessageHead';
import { statusTone, TicketCardView } from '@/components/TicketCardView';
import { avatarTone, fmtDay, fmtTime, initials, priorityLabel, sameDayLabel, statusLabel } from '@/lib/format';
import { CONVERSATION_STATUS_LABEL, HANDOFF_REASON_LABEL, type ConversationStatus, type HandoffReason, type MessageDTO, type TicketCard } from '@/lib/types';
import s from './console.module.css';

type Filter = 'all' | 'needs' | 'agent' | 'mine';
type Item = {
  id: string; status: ConversationStatus; updatedAt: string; user: { id: string; name: string; department: string }; unread: number;
  lastMessage: { text: string; sender: string; createdAt: string } | null;
  handoff: { reason: HandoffReason; level: string | null; confidence: number | null; ticket: string | null; respondBy: string | null } | null;
};
type List = { counts: Record<Filter, number>; items: Item[] };
type Detail = {
  conversation: {
    id: string; status: ConversationStatus; assignedAnalyst: { id: string; name: string } | null;
    handoff: { reason: HandoffReason; summary: string | null; level: string | null; confidence: number | null; ticket: string | null; at?: string; respondBy: string | null } | null;
  };
  user: { id: string; name: string; email: string; department: string };
  messages: MessageDTO[]; tickets: TicketCard[]; counts: { open: number; closed: number };
};
type Me = { id: string; name: string; role: string };
type Tone = 'red' | 'amber' | 'green' | 'gray' | 'blue';

const TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todas' }, { key: 'needs', label: 'Para você' }, { key: 'agent', label: 'Com o agent' }, { key: 'mine', label: 'Minhas' },
];
const DOT: Record<string, string> = { amber: '#f5a524', blue: '#0a62c9', green: '#2bb673', gray: '#9aa5b4' };

function tagFor(i: Item, meId?: string): { text: string; tone: Tone } {
  if (i.status === 'AGENT') return { text: 'Agent atendendo', tone: 'green' };
  if (i.status === 'RESOLVED') return { text: 'Resolvida pelo agent', tone: 'gray' };
  if (i.status === 'CLOSED') return { text: 'Encerrada', tone: 'gray' };
  if (i.status === 'ANALYST') return { text: meId ? 'Você está atendendo' : 'Analista atendendo', tone: 'blue' };
  if (i.handoff?.reason === 'low_confidence') return { text: `Agent pediu ajuda · confiança ${Math.round((i.handoff.confidence ?? 0) * 100)}%`, tone: 'amber' };
  const mins = i.handoff?.respondBy ? Math.round((new Date(i.handoff.respondBy).getTime() - Date.now()) / 60000) : null;
  if (mins !== null && mins <= 0) return { text: 'Transferida · prazo de resposta vencido', tone: 'red' };
  if (mins !== null && mins <= 90) return { text: `Transferida · contato em ${mins} min`, tone: 'red' };
  return { text: `Transferida${i.handoff?.ticket ? ` · ${i.handoff.ticket}` : ''}`, tone: 'red' };
}

function Avatar({ name, online, small }: { name: string; online?: boolean; small?: boolean }) {
  const t = avatarTone(name);
  return <span className={`${s.avatar} ${small ? '' : s.sm}`} style={{ background: t.bg, color: t.fg }}>{initials(name)}{online && <i className={s.online} />}</span>;
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
  const [panel, setPanel] = useState(true);

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
  const firstName = detail?.user.name.split(' ')[0] ?? '';
  const online = !!detail && Date.now() - new Date(detail.messages[detail.messages.length - 1]?.createdAt ?? 0).getTime() < 15 * 60_000;
  const handoffTicket = c?.handoff?.ticket ?? null;
  const takenAt = detail?.messages.filter((m) => m.sender === 'SYSTEM' && m.text.includes('assumiu')).pop()?.createdAt;

  return (
    <div className={s.app}>
      <nav className={s.rail} aria-label="Navegação">
        <span className={s.logo}><LogoMark size={26} /></span>
        <button type="button" className={s.railBtn} aria-label="Conversas" title="Conversas"><IconChat size={18} />{(list?.counts.needs ?? 0) > 0 && <span className={s.badge}>{list?.counts.needs}</span>}</button>
        <div className={s.railBottom}>
          <button type="button" className={s.iconBtn} title="Sair" aria-label="Sair" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/'; }}><IconLogout /></button>
          {me && <Avatar name={me.name} online small />}
        </div>
      </nav>

      <section className={s.list}>
        <div className={s.lhead}><h1>Conversas</h1><span className={s.avail}><i />Disponível</span></div>
        <div className={s.search}><span><IconSearch size={16} /></span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar conversa ou chamado" aria-label="Pesquisar" /></div>
        <div className={s.tabs} role="tablist">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={filter === t.key} className={`${s.tab} ${filter === t.key ? s.on : ''}`} onClick={() => setFilter(t.key)}>{t.label}<i>{list?.counts[t.key] ?? 0}</i></button>
          ))}
        </div>
        <div className={s.items}>
          {list && list.items.length === 0 && <div className={s.none}>Nenhuma conversa neste filtro.</div>}
          {list?.items.map((i) => {
            const tag = tagFor(i, i.status === 'ANALYST' ? me?.id : undefined);
            const fresh = Date.now() - new Date(i.updatedAt).getTime() < 15 * 60_000;
            return (
              <button key={i.id} className={`${s.item} ${selectedId === i.id ? s.sel : ''}`} onClick={() => { setSelectedId(i.id); setDetail(null); setError(''); }}>
                <Avatar name={i.user.name} online={fresh} />
                <div>
                  <div className={s.irow}><b>{i.user.name}</b><time className={i.unread > 0 ? s.hot : undefined}>{fmtTime(i.lastMessage?.createdAt ?? i.updatedAt)}</time></div>
                  <div className={s.snip}>
                    <span>{i.lastMessage ? `${i.lastMessage.sender === 'AGENT' ? 'Nexo: ' : ''}${i.lastMessage.text}` : 'Sem mensagens'}</span>
                    {i.unread > 0 && <b className={s.unread}>{i.unread}</b>}
                  </div>
                  <div className={`${s.tag} ${s[tag.tone]}`}><i />{tag.text}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className={s.center}>
        {!selectedId && <div className={s.empty}><h2>Console do analista</h2><p>Selecione uma conversa para ver o histórico, as decisões do agent e os chamados do funcionário.</p></div>}
        {selectedId && !detail && <div className={s.empty}><p>Carregando conversa…</p></div>}
        {detail && c && (
          <>
            <header className={s.chead}>
              <Avatar name={detail.user.name} online={online} />
              <div className={s.who}><b>{detail.user.name}</b><small>{online ? 'online' : 'offline'} · {detail.user.department}{handoffTicket ? ` · ${handoffTicket}` : ''}</small></div>
              <span className={s.spacer} />
              {c.status === 'AWAITING' && <span className={s.pill}><IconHand size={14} />Aguardando atendente</span>}
              {c.status !== 'AWAITING' && <span className={`${s.pill}`} style={c.status === 'AGENT' || c.status === 'RESOLVED' ? { background: 'var(--green-soft)', color: 'var(--green)' } : c.status === 'ANALYST' ? { background: 'var(--blue-soft)', color: 'var(--blue)' } : { background: 'var(--panel)', color: 'var(--muted)' }}>{CONVERSATION_STATUS_LABEL[c.status]}{c.assignedAnalyst ? ` · ${c.assignedAnalyst.name}` : ''}</span>}
              {mine && <button type="button" className={s.btn} disabled={busy} onClick={() => void act('return')}><IconBot size={15} />Devolver ao agent</button>}
              {mine && <button type="button" className={`${s.btn} ${s.danger}`} disabled={busy} onClick={() => void act('close')}>Encerrar atendimento</button>}
              <button type="button" className={s.iconBtn} title={panel ? 'Ocultar chamados' : 'Mostrar chamados'} aria-label="Painel de chamados" onClick={() => setPanel((v) => !v)}><IconPanel size={18} /></button>
            </header>

            <div className={s.feed}>
              <div className={s.fcol}>
                {error && <div className={s.banner} role="alert">{error}</div>}
                {c.handoff && (
                  <div className={s.handoff}>
                    <b>{HANDOFF_REASON_LABEL[c.handoff.reason]}{c.handoff.level ? ` · Suporte ${c.handoff.level}` : ''}{c.handoff.reason === 'low_confidence' && c.handoff.confidence != null ? ` · confiança ${Math.round(c.handoff.confidence * 100)}%` : ''}</b>
                    {c.handoff.at && <span>Transferida às {fmtTime(c.handoff.at)}{c.handoff.ticket ? ` · ${c.handoff.ticket}` : ''}</span>}
                    <p>{c.handoff.summary}</p>
                  </div>
                )}
                {detail.messages[0] && <span className={s.day}>{sameDayLabel(detail.messages[0].createdAt)}</span>}
                {detail.messages.map((m) => {
                  if (m.sender === 'SYSTEM') return <div key={m.id} className={s.sys}><IconSwap size={12} />{m.text.replace(/ · um analista fala.*$/, '')} · {fmtTime(m.createdAt)}</div>;
                  if (m.sender === 'USER') return <div key={m.id} className={s.in}>{m.text}<div className={s.meta}>{fmtTime(m.createdAt)}</div></div>;
                  const analyst = m.sender === 'ANALYST';
                  return (
                    <div key={m.id} className={s.out}>
                      <MessageHead align="right" name={analyst ? (m.authorName ?? 'Analista') : 'Nexo Assist'} badge={analyst ? `Suporte ${c.handoff?.level ?? ''}`.trim() : 'IA'} badgeTone={analyst ? 'support' : 'ai'} steps={m.steps} />
                      <div className={`${s.bub} ${analyst ? s.human : s.ai}`}>{m.text}<div className={s.meta}>{fmtTime(m.createdAt)} ✓✓</div></div>
                      {m.cards?.map((t) => <div key={t.number} className={s.attach}><TicketCardView t={t} /></div>)}
                      {m.draft && <div className={s.attach}><DraftCard d={m.draft} busy readOnly onConfirm={() => undefined} onEdit={() => undefined} onCancel={() => undefined} /></div>}
                    </div>
                  );
                })}
              </div>
            </div>

            <footer className={s.bar}>
              {!mine && (
                <div className={s.bartop}>
                  <span className={s.hand}><IconHand size={18} /></span>
                  <div>
                    <b>{takenByOther ? `Com ${c.assignedAnalyst?.name}` : c.status === 'CLOSED' || c.status === 'RESOLVED' ? CONVERSATION_STATUS_LABEL[c.status] : `${firstName} espera um atendente`}</b>
                    <small>{c.status === 'AWAITING' ? `Agent pausado${c.handoff?.respondBy ? ` · até ${fmtTime(c.handoff.respondBy)}` : ''}` : c.status === 'AGENT' ? 'Agent atendendo · você pode assumir quando quiser' : takenByOther ? 'Outro analista está atendendo' : 'Sem pendências'}</small>
                  </div>
                  <span className={s.spacer} style={{ flex: 1 }} />
                  {c.status === 'AWAITING' && <button type="button" className={s.btn} disabled={busy} onClick={() => void act('return')}><IconBot size={15} />Devolver ao agent</button>}
                  {canTake && <button type="button" className={`${s.btn} ${s.primary}`} disabled={busy} onClick={() => void act('take')}><IconHeadset size={15} />Assumir atendimento</button>}
                </div>
              )}
              <div className={s.compose}>
                <input value={text} disabled={!mine || busy} onChange={(e) => setText(e.target.value)} aria-label="Responder"
                  onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) void act('message', text); }}
                  placeholder={mine ? 'Responder ao funcionário…' : 'Assuma o atendimento para responder'} />
                {mine && <button type="button" className={s.round} aria-label="Enviar" disabled={busy || !text.trim()} onClick={() => void act('message', text)}><IconSend size={18} /></button>}
              </div>
            </footer>
          </>
        )}
      </section>

      {detail && c && panel && (
        <aside className={s.side}>
          <div className={s.shead}>
            <div><b>Chamados da {firstName}</b><small>{detail.counts.open} abertos · {detail.counts.closed} encerrados</small></div>
            <button type="button" className={s.iconBtn} aria-label="Fechar painel" onClick={() => setPanel(false)}><IconClose size={16} /></button>
          </div>
          {detail.tickets.filter((t) => t.number === handoffTicket).map((t) => (
            <div key={t.number}>
              <div className={s.sec}>Desta conversa</div>
              <div className={s.tcard}>
                <div className={s.t1}>
                  <span>{t.number}</span>
                  <span style={{ color: DOT[statusTone(t.status)] }}><i style={{ background: DOT[statusTone(t.status)] }} />{statusLabel(t.status)}</span>
                </div>
                <strong>{t.title}</strong>
                <small>{t.category} · prioridade {priorityLabel(t.priority).toLowerCase()}{t.overdue ? ' · prazo vencido' : ''}</small>
                <div className={s.t3}>
                  {mine || takenByOther ? <span><IconHeadset size={14} />Assumido por {c.assignedAnalyst?.name}</span> : <span><IconSwap size={14} />Transferido para um analista</span>}
                  <time>{fmtTime((mine || takenByOther ? takenAt : c.handoff?.at) ?? t.lastUpdate)}</time>
                </div>
              </div>
            </div>
          ))}
          <div className={s.sec}>{handoffTicket ? 'Outros chamados' : 'Chamados'}</div>
          {detail.tickets.filter((t) => t.number !== handoffTicket).map((t) => (
            <div key={t.number} className={s.row}>
              <i style={{ background: DOT[statusTone(t.status)] }} />
              <div>
                <b>{t.title}</b>
                <small>{t.number} · {t.status === 'RESOLVED' ? `Resolvido em ${fmtDay(t.lastUpdate)}` : statusLabel(t.status)}{t.overdue && <span className={s.late}> · vencido</span>}</small>
              </div>
              <IconChevron size={14} />
            </div>
          ))}
        </aside>
      )}
    </div>
  );
}
