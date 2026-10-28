"use client";

import { useState, type FormEvent } from "react";

export default function Login() {
  const [email, setEmail] = useState("ana.souza@nexo.com.br");
  const [pw, setPw] = useState("nexo123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: pw }),
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
    <main className="login">
      <section className="showcase">
        <div className="brand">
          <span className="mark">N</span>
          <b>Nexo Assist</b>
        </div>
        <div className="story">
          <div>
            <small>Service desk de TI da Nexo</small>
            <h1>Seu problema de TI, resolvido em uma conversa.</h1>
            <p>
              Descreva o que está acontecendo. O assistente consulta seus
              chamados, busca na central de ajuda e chama um analista quando
              precisa.
            </p>
          </div>
          <div className="preview">
            <div className="bubble user">
              Meu notebook não conecta na VPN. Erro 809.
            </div>
            <div className="agentline">
              <b>Nexo Assist</b>
              <span>consultou seus chamados · criou um chamado</span>
            </div>
            <div className="bubble agent">
              Pronto: abri o chamado com prioridade alta. Um analista fala com
              você em até 4 h úteis.
            </div>
            <div className="ticket">
              INC-20517 <span>Rede e VPN · Alta · em até 4 h</span>
            </div>
          </div>
        </div>
        <div className="stats">
          <div>
            <b>8 s</b>
            <span>primeira resposta, em média</span>
          </div>
          <div>
            <b>72%</b>
            <span>resolvidos sem fila</span>
          </div>
          <div>
            <b>6</b>
            <span>analistas online agora</span>
          </div>
        </div>
      </section>
      <section className="signin">
        <div className="help">
          Problema para entrar? <b>Ligue no ramal 4000</b>
        </div>
        <form onSubmit={submit}>
          <div>
            <h2>Entrar</h2>
            <p>Use seu e-mail corporativo e a senha da rede Nexo.</p>
          </div>
          <label>
            E-mail corporativo
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </label>
          <label className="check">
            <input type="checkbox" defaultChecked /> Manter conectado neste
            computador
          </label>
          {error && <div className="banner error" role="alert">{error}</div>}
          <button disabled={loading}>{loading ? "Entrando…" : "Entrar"}</button>
          <small>
            Dados de exemplo: ana.souza@nexo.com.br / nexo123
            <br />
            Analista: rafael.lima@nexo.com.br / nexo123
          </small>
        </form>
        <footer>© 2026 Nexo · Service desk de TI</footer>
      </section>
    </main>
  );
}
