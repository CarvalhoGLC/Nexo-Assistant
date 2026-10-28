'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DraftCard } from '@/components/DraftCard';
import { IconSend, IconSwap } from '@/components/Icons';
import { MessageHead } from '@/components/MessageHead';
import { QuickOptionsView } from '@/components/QuickOptionsView';
import { TicketCardView } from '@/components/TicketCardView';
import s from './chat.module.css';
import { fmtTime } from '@/lib/format';
import type { ChatEvent, ConversationStatus, DecisionStep, MessageDTO, SessionInfo } from '@/lib/types';

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
  const pending = [...messages].reverse().find((m) => m.draft?.status === 'PENDING')?.draft;

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
        await loadChat();
      } catch (e) {
        setError({ message: e instanceof Error ? e.message : 'Falha ao carregar.', retry: () => location.reload() });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadChat]);

  // Com um analista envolvido, buscamos novas mensagens periodicamente.
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
      if (r.headers.get('content-type')?.includes('application/json')) { await loadChat(); return; } // conversa com analista: o agent não responde
      await consume(r);
    } catch {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id)); setText(msg);
      setError({ message: 'Sem conexão com o servidor. Verifique a rede e tente de novo.', retry: () => void send(msg) });
    } finally {
      setStreaming(null);
    }
  }

  async function consume(r: Response) {
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
        if (ev.type === 'step') setStreaming((st) => (st ? { ...st, steps: [...st.steps, ev.step] } : st));
        else if (ev.type === 'text') setStreaming((st) => (st ? { ...st, text: st.text + ev.delta } : st));
        else if (ev.type === 'done') { setStatus(ev.status); setSession(ev.session); await loadChat(); }
      }
    }
  }

  const draftAction = useCallback(async (code: string, action: 'confirm' | 'cancel') => {
    setDraftBusy(true); setError(null);
    try {
      const r = await fetch('/api/chat/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, action }) });
      if (!r.ok) { setError({ message: await readError(r, 'Não foi possível concluir.'), retry: action === 'confirm' ? () => void draftAction(code, action) : undefined }); return; }
      await loadChat();
    } finally {
      setDraftBusy(false);
    }
  }, [loadChat]);

  // Atalho do botão Confirmar: ⌘↵ / Ctrl+↵
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && pending && !draftBusy && !sending) { e.preventDefault(); void draftAction(pending.code, 'confirm'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, draftBusy, sending, draftAction]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.href = '/';
  }

  const last = messages[messages.length - 1];
  const optionsEnabled = !sending && !full && !humanHandling;
  const pill = status === 'ANALYST' ? { t: 'Em atendimento com um analista', c: s.blue } : status === 'AWAITING' ? { t: 'Aguardando um analista', c: s.amber } : { t: 'Assistente online', c: '' };

  return (
    <AppShell active="atendimento" user={me} title="Atendimento" onLogout={() => void logout()}
      headerRight={<span className={`${s.pill} ${pill.c}`}><i />{pill.t}</span>}>
      <div className={s.scroll} aria-live="polite">
        {error && <div className={`${s.banner} ${s.error}`} role="alert">{error.message}{error.retry && <button type="button" onClick={error.retry}>Tentar de novo</button>}</div>}
        {humanHandling && <div className={s.banner}>{status === 'AWAITING' ? 'Sua conversa foi transferida. Um analista vai assumir em breve e o Nexo Assist não responde até lá.' : 'Você está falando com um analista. O Nexo Assist está pausado.'}</div>}
        {full && <div className={s.banner}>Você atingiu o limite de {session.max} mensagens desta sessão. Saia e entre de novo para continuar.</div>}

        <div className={s.col}>
          {loading && <div className={s.empty}><p>Carregando sua conversa…</p></div>}
          {!loading && messages.length === 0 && !streaming && (
            <div className={s.empty}>
              <h2>Olá{me ? `, ${me.name.split(' ')[0]}` : ''}. Como posso ajudar?</h2>
              <p>Descreva seu problema de TI com suas palavras ou pergunte sobre um chamado.</p>
              <div className={s.quick}>
                <button onClick={() => void send('Qual o status do meu chamado?')}>Ver meus chamados</button>
                <button onClick={() => void send('Meu notebook não conecta na VPN. Erro 809.')}>Problema com VPN</button>
                <button onClick={() => void send('Quero falar com um analista')}>Falar com analista</button>
              </div>
            </div>
          )}

          {messages.map((m) => {
            if (m.sender === 'SYSTEM') return <div key={m.id} className={s.system}><IconSwap size={13} />{m.text} · {fmtTime(m.createdAt)}</div>;
            if (m.sender === 'USER') return <div key={m.id} className={s.user}>{m.text}</div>;
            const analyst = m.sender === 'ANALYST';
            const q = m.options?.kind === 'options' ? m.options : undefined;
            return (
              <div key={m.id} className={s.msg}>
                <MessageHead name={analyst ? (m.authorName ?? 'Analista') : 'Nexo Assist'} badge={analyst ? 'Suporte' : undefined} badgeTone="support" steps={m.steps} />
                {m.cards?.map((c) => <TicketCardView key={c.number} t={c} />)}
                <div className={`${s.bubble} ${analyst ? s.analyst : ''}`} style={m.cards?.length ? { marginTop: 10 } : undefined}>
                  {m.text}
                  {q && m.id === last?.id && <QuickOptionsView o={q} disabled={!optionsEnabled} onPick={(v) => void send(v)} hideQuestion={m.text.includes(q.question)} />}
                </div>
                {m.options?.kind === 'tickets' && m.id === last?.id && <QuickOptionsView o={m.options} disabled={!optionsEnabled} onPick={(v) => void send(v)} />}
                {m.draft && (
                  <DraftCard d={m.draft} busy={draftBusy}
                    onConfirm={() => void draftAction(m.draft!.code, 'confirm')} onCancel={() => void draftAction(m.draft!.code, 'cancel')}
                    onEdit={() => { setText('Quero ajustar o rascunho: '); input.current?.focus(); }} />
                )}
              </div>
            );
          })}

          {streaming && (
            <div className={s.msg}>
              <MessageHead name="Nexo Assist" steps={streaming.steps} />
              <div className={`${s.bubble} ${streaming.text ? '' : s.typing}`}>{streaming.text || (streaming.steps.length ? 'Analisando' : 'Pensando')}</div>
            </div>
          )}
          <div ref={bottom} />
        </div>
      </div>

      <div className={s.dock}>
        <div className={s.composer}>
          <input ref={input} value={text} maxLength={1000} disabled={sending || full} aria-label="Mensagem"
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) void send(text); }}
            placeholder={humanHandling ? 'Escreva para o analista…' : 'Escreva para o Nexo…'} />
          <button type="button" className={s.send} onClick={() => void send(text)} disabled={sending || full || !text.trim()}><IconSend />{sending ? 'Enviando…' : 'Enviar'}</button>
        </div>
        <div className={`${s.counter} ${full ? s.full : ''}`}>{session.count}/{session.max} mensagens nesta sessão</div>
      </div>
    </AppShell>
  );
}
