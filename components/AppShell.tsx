import Link from 'next/link';
import type { ReactNode } from 'react';
import { avatarTone, initials } from '@/lib/format';
import { IconChat, IconLogout, IconUser } from './Icons';
import s from './shell.module.css';

export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M3 3h5l8 11V3h5v18h-5L8 10v11H3Z" fill="currentColor" />
    </svg>
  );
}

/** Barra lateral + cabeçalho (breadcrumb) das telas do funcionário. */
export function AppShell(p: { active: 'atendimento' | 'perfil'; user: { name: string; email: string } | null; title: string; headerRight?: ReactNode; children: ReactNode; onLogout: () => void }) {
  const tone = avatarTone(p.user?.name ?? 'N');
  return (
    <div className={s.app}>
      <aside className={s.side}>
        <div className={s.brand}><span className={s.mark}><LogoMark /></span>Nexo Assist</div>
        <nav className={s.nav}>
          <Link href="/atendimento" className={p.active === 'atendimento' ? s.on : undefined}><IconChat />Atendimento</Link>
          <Link href="/perfil" className={p.active === 'perfil' ? s.on : undefined}><IconUser />Meu perfil</Link>
        </nav>
        <div className={s.bottom}>
          <div className={s.me}>
            <span className={s.avatar} style={{ background: tone.bg, color: tone.fg }}>{initials(p.user?.name ?? 'NX')}</span>
            <div><b>{p.user?.name ?? '…'}</b><small>{p.user?.email}</small></div>
          </div>
          <button type="button" className={s.logout} onClick={p.onLogout}><IconLogout />Sair</button>
        </div>
      </aside>
      <div className={s.main}>
        <header className={s.header}>
          <span className={s.crumb}>Service desk de TI <i>›</i> <b>{p.title}</b></span>
          {p.headerRight}
        </header>
        {p.children}
      </div>
    </div>
  );
}
