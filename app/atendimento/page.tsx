'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DecisionSteps } from '@/components/DecisionSteps';
import { DraftCard } from '@/components/DraftCard';
import { QuickOptionsView } from '@/components/QuickOptionsView';
import { TicketCardView } from '@/components/TicketCardView';
import { ago, priorityLabel, statusLabel } from '@/lib/format';
import type { ChatEvent, ConversationStatus, DecisionStep, MessageDTO, SessionInfo, TicketCard } from '@/lib/types';

type Me = { id: string; name: string; email: string; role: string; department: string; session: SessionInfo };
type ChatState = { status: ConversationStatus; messages: MessageDTO[]; session: SessionInfo };
type Streaming = { steps: DecisionStep[]; text: string };

async function readError(r: Response, fallback: string): Promise<string> {
  const body = (await r.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

export default function Atendimento() {
  const [me, setMe] = useState<Me | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [status, setStatus] = useState<ConversationStatus>('AGENT');
  const [session, setSession] = useState<SessionInfo>({ count: 0, max: 30 });
  const [tickets, setTickets] = useState<TicketCard[]>([]);
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const sending = streaming !== null;
  const humanHandling = status === 'AWAITING' || status === 'ANALYST';
  const full = session.count >= session.max;

  const loadTickets = useCallback(async () => {
    const r = await fetch('/api/tickets');
    if (r.ok) setTickets((await r.json()) as TicketCard[]);
  }, []);

  const loadChat = useCallback(async () => {
    const r = await fetch('/api/chat');
    if (r.status === 401) { location.href = '/'; return; }
    if (!r.ok) throw new Error(await readError(r, 'Não foi possível carregar a conversa.'));
    const c = (await r.json()) as ChatState;
    setMessages(c.messages); setStatus(c.status); setSession(c.session);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/me');
        if (!r.ok) { location.href = '/'; return; }
        const u = (await r.json()) as Me;
        if (u.role === 'ANALYST') { location.href = '/analista'; return; }
        setMe(u);
        await Promise.all([loadChat(), loadTickets()]);
      } catch (e) {
        setError({ message: e instanceof Error ? e.message : 'Falha ao carregar.', retry: () => location.reload() });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadChat, loadTickets]);

  // Com a conversa com um analista, buscamos novas mensagens periodicamente.
  useEffect(() => {
    if (!humanHandling) return;
    const t = setInterval(() => { void loadChat().catch(() => undefined); }, 4000);
    return () => clearInterval(t);
  }, [humanHandling, loadChat]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, streaming]);

  async function send(raw: string) {
    const msg = raw.trim();
    if (!msg || sending || full) return;
    setError(null); setText('');
    const optimistic: MessageDTO = { id: `tmp-${Date.now()}`, sender: 'USER', text: msg, createdAt: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    setStreaming({ steps: [], text: '' });
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: msg }) });
      if (r.status === 401) { location.href = '/'; return; }
      if (!r.ok) {
        setMessages((m) => m.filter((x) => x.id !== optimistic.id)); setText(msg);
        setError({ message: await readError(r, 'Não foi possível enviar a mensagem.'), retry: () => void send(msg) });
        return;
      }
      if (r.headers.get('content-type')?.includes('application/json')) { await loadChat(); return; } // conversa com analista
      await consume(r, optimistic.id);
    } catch {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id)); setText(msg);
      setError({ message: 'Sem conexão com o servidor. Verifique a rede e tente de novo.', retry: () => void send(msg) });
    } finally {
      setStreaming(null);
      void loadTickets();
    }
  }

  async function consume(r: Response, optimisticId: string) {
    if (!r.body) throw new Error('Resposta vazia');
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 2);
        if (!line.startsWith('data:')) continue;
        const ev = JSON.parse(line.slice(5)) as ChatEvent;
        if (ev.type === 'step') setStreaming((s) => (s ? { ...s, steps: [...s.steps, ev.step] } : s));
        else if (ev.type === 'text') setStreaming((s) => (s ? { ...s, text: s.text + ev.delta } : s));
        else if (ev.type === 'done') {
          setMessages((m) => [...m.filter((x) => x.id !== optimisticId), ...ev.messages]);
          setStatus(ev.status); setSession(ev.session);
          await loadChat(); // troca a mensagem otimista pela gravada no servidor
        }
      }
    }
  }

  async function draftAction(code: string, action: 'confirm' | 'cancel') {
    setDraftBusy(true); setError(null);
    try {
      const r = await fetch('/api/chat/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, action }) });
      if (!r.ok) { setError({ message: await readError(r, 'Não foi possível concluir.'), retry: action === 'confirm' ? () => void draftAction(code, action) : undefined }); return; }
      await Promise.all([loadChat(), loadTickets()]);
    } finally {
      setDraftBusy(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.href = '/';
  }

  const last = messages[messages.length - 1];
  const optionsEnabled = !sending && !full && !humanHandling;

  return (
    <div className="app">
      <aside>
        <div className="brand"><span className="mark">N</span><b>Nexo Assist</b></div>
        <nav><a className="active">Atendimento</a></nav>
        <div className="user">
          <span>{me?.name.slice(0, 2).toUpperCase() ?? 'NX'}</span>
          <div>{me?.name}<small>{me?.email}</small></div>
        </div>
        <a onClick={() => void logout()}>Sair</a>
      </aside>

      <main className="chatpage">
        <header>
          <span>Service desk de TI / Atendimento</span>
          <b>{status === 'AGENT' ? '● Assistente online' : status === 'ANALYST' ? '● Em atendimento com um analista' : status === 'AWAITING' ? '● Aguardando um analista' : '● Assistente online'}</b>
        </header>

        <div className="chatlayout">
          <section className="messages" aria-live="polite">
            {error && <div className="banner error" role="alert">{error.message}{error.retry && <button type="button" onClick={error.retry}>Tentar de novo</button>}</div>}
            {humanHandling && <div className="banner">{status === 'AWAITING' ? 'Sua conversa foi transferida. Um analista vai assumir em breve e o Nexo Assist não responde até lá.' : 'Você está falando com um analista. O Nexo Assist está pausado.'}</div>}
            {full && <div className="banner">Você atingiu o limite de {session.max} mensagens desta sessão. Saia e entre de novo para continuar.</div>}

            {loading && <div className="empty"><p>Carregando sua conversa…</p></div>}
            {!loading && messages.length === 0 && (
              <div className="empty">
                <h2>Olá{me ? `, ${me.name.split(' ')[0]}` : ''}. Como posso ajudar?</h2>
                <p>Descreva seu problema de TI com suas palavras ou pergunte sobre um chamado.</p>
                <div className="quick">
                  <button onClick={() => void send('Qual o status do meu chamado?')}>Ver meus chamados</button>
                  <button onClick={() => void send('Meu notebook não conecta na VPN. Erro 809.')}>Problema com VPN</button>
                  <button onClick={() => void send('Quero falar com um analista')}>Falar com analista</button>
                </div>
              </div>
            )}

            {messages.map((m) => {
              if (m.sender === 'SYSTEM') return <div key={m.id} className="msg system"><div className="bubble">{m.text}</div></div>;
              const who = m.sender === 'USER' ? 'Você' : m.sender === 'ANALYST' ? `${m.authorName ?? 'Analista'} · Suporte` : 'Nexo Assist';
              return (
                <div key={m.id} className={`msg ${m.sender.toLowerCase()}`}>
                  <div className="who">{who}</div>
                  {m.steps && <DecisionSteps steps={m.steps} />}
                  <div className="bubble">{m.text}</div>
                  {m.cards?.map((c) => <TicketCardView key={c.number} t={c} />)}
                  {m.draft && (
                    <DraftCard
                      d={m.draft} busy={draftBusy}
                      onConfirm={() => void draftAction(m.draft!.code, 'confirm')}
                      onCancel={() => void draftAction(m.draft!.code, 'cancel')}
                      onEdit={() => { setText('Quero ajustar o rascunho: '); input.current?.focus(); }}
                    />
                  )}
                  {m.options && m.id === last?.id && <QuickOptionsView o={m.options} disabled={!optionsEnabled} onPick={(v) => void send(v)} />}
                </div>
              );
            })}

            {streaming && (
              <div className="msg agent">
                <div className="who">Nexo Assist</div>
                <DecisionSteps steps={streaming.steps} />
                <div className={`bubble ${streaming.text ? '' : 'cursor'}`}>{streaming.text || (streaming.steps.length ? 'Analisando…' : 'Pensando…')}</div>
              </div>
            )}
            <div ref={bottom} />

            <div className="composer">
              <input
                ref={input} value={text} maxLength={1000} disabled={sending || full}
                onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void send(text); }}
                placeholder={humanHandling ? 'Escreva para o analista…' : 'Escreva para o Nexo…'} aria-label="Mensagem"
              />
              <button onClick={() => void send(text)} disabled={sending || full || !text.trim()}>{sending ? 'Enviando…' : 'Enviar'}</button>
            </div>
            <div className={`counter ${full ? 'full' : ''}`}>{session.count}/{session.max} mensagens nesta sessão</div>
          </section>

          <aside className="ticketpanel">
            <h3>Seus chamados</h3>
            {tickets.length === 0 && <small>Nenhum chamado ainda.</small>}
            {tickets.map((t) => (
              <div className="ticketitem" key={t.number}>
                <b>{t.number}</b>
                <strong>{t.title}</strong>
                <small>{t.category} · {priorityLabel(t.priority)} · {statusLabel(t.status)} · {ago(t.lastUpdate)}</small>
                {t.overdue && <small className="late">Prazo vencido</small>}
              </div>
            ))}
          </aside>
        </div>
      </main>
    </div>
  );
}
