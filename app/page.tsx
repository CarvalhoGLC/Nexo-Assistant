"use client";

import { useState, type FormEvent } from "react";
import { LogoMark } from "@/components/AppShell";
import { IconArrowRight, IconEye, IconEyeOff, IconLock, IconMail } from "@/components/Icons";
import s from "./login.module.css";

export default function Login() {
  const [email, setEmail] = useState("ana.souza@nexo.com.br");
  const [pw, setPw] = useState("nexo123");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: pw, remember }),
      });
      if (r.ok) {
        const u = (await r.json()) as { role: string };
        location.href = u.role === "ANALYST" ? "/analista" : "/atendimento";
        return;
      }
      const body = (await r.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Não foi possível entrar.");
    } catch {
      setError("Sem conexão com o servidor. Tente novamente.");
    }
    setLoading(false);
  }

  return (
    <main className={s.page}>
      <section className={s.hero}>
        <div className={s.brand}><LogoMark size={22} />Nexo Assist</div>
        <div className={s.copy}>
          <div className={s.eyebrow}>Service desk de TI da Nexo</div>
          <h1>Seu problema de TI, resolvido em uma conversa.</h1>
          <p className={s.lead}>Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um analista quando precisa.</p>
          <div className={s.demo} aria-hidden>
            <div className={s.bu}>Meu notebook não conecta na VPN. Erro 809.</div>
            <div className={s.who}>Nexo Assist<span>consultou seus chamados · criou um chamado</span></div>
            <div className={s.ba}>Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.</div>
            <div className={s.tag}><i /><b>INC-20517</b><small>Rede e VPN · Alta · em até 4 h</small></div>
          </div>
        </div>
        <div className={s.stats}>
          <div><b>8 s</b><span>primeira resposta, em média</span></div>
          <div><b>72%</b><span>resolvidos sem fila</span></div>
          <div><b>6<i className={s.live} /></b><span>analistas online agora</span></div>
        </div>
      </section>

      <section className={s.form}>
        <div className={s.help}>Problema para entrar? <a href="tel:4000">Ligue no ramal 4000</a></div>
        <form className={s.box} onSubmit={submit} noValidate>
          <h2>Entrar</h2>
          <p>Use seu e-mail corporativo e a senha da rede Nexo.</p>

          <label className={s.label} htmlFor="email">E-mail corporativo</label>
          <div className={s.field}>
            <span className={s["lead-icon"]}><IconMail /></span>
            <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className={s.label}>
            <label htmlFor="pw">Senha</label>
            <button type="button" className={s.link} onClick={() => setInfo("Para recuperar o acesso, ligue no ramal 4000.")}>Esqueci minha senha</button>
          </div>
          <div className={s.field}>
            <span className={s["lead-icon"]}><IconLock /></span>
            <input id="pw" type={show ? "text" : "password"} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <button type="button" className={s.eye} onClick={() => setShow((v) => !v)} aria-label={show ? "Ocultar senha" : "Mostrar senha"}>
              {show ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>

          <label className={s.remember}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Manter conectado neste computador
          </label>

          {error && <div className={s.msg} role="alert">{error}</div>}
          {info && <div className={`${s.msg} ${s.info}`} role="status">{info}</div>}
          <button className={s.submit} disabled={loading || !email.trim() || !pw}>
            {loading ? "Entrando…" : <>Entrar<IconArrowRight size={16} /></>}
          </button>
          <div className={s.rule} />
        </form>
        <div className={s.foot}><span>© 2026 Nexo · Service desk de TI</span><a href="#privacidade">Privacidade e uso de dados</a></div>
      </section>
    </main>
  );
}
