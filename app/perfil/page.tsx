'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { IconKey, IconLock, IconMail, IconRefresh } from '@/components/Icons';
import s from './perfil.module.css';

type Me = { name: string; email: string; role: string; passwordChangedAt: string };

export default function Perfil() {
  const [me, setMe] = useState<Me | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch('/api/me').then(async (r) => {
      if (!r.ok) { location.href = '/'; return; }
      const u = (await r.json()) as Me;
      if (u.role === 'ANALYST') { location.href = '/analista'; return; }
      setMe(u);
    });
  }, []);

  const days = me ? Math.max(0, Math.floor((Date.now() - new Date(me.passwordChangedAt).getTime()) / 86400_000)) : 0;

  return (
    <AppShell active="perfil" user={me} title="Meu perfil" onLogout={async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/'; }}>
      <div className={s.page}>
        <div className={s.wrap}>
          <h1>Meu perfil</h1>
          <p className={s.sub}>Seus dados de acesso ao service desk de TI.</p>

          <section className={s.card}>
            <div className={s.row}><span>Nome</span><b>{me?.name ?? '…'}</b><i /></div>
            <div className={s.row}><span>E-mail corporativo</span><b>{me?.email ?? '…'}</b><em className={s.managed} style={{ fontStyle: 'normal' }}><IconLock size={13} />Gerenciado pela TI</em></div>
          </section>

          <section className={s.card}>
            <div className={s.pass}>
              <span className={s.icon}><IconKey /></span>
              <div><b>Senha</b><small>Alterada há {days} dias</small></div>
              <button type="button" className={s.reset} disabled={sent} onClick={() => setSent(true)}><IconRefresh size={15} />Redefinir senha</button>
            </div>
            <div className={`${s.foot} ${sent ? s.ok : ''}`}>
              <IconMail size={14} />
              {sent ? `Pedido registrado. Neste protótipo nenhum e-mail é enviado de verdade (${me?.email}).` : `Enviaremos um link de redefinição para ${me?.email ?? ''}.`}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
