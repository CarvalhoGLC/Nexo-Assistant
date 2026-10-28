import { describe, expect, it } from 'vitest';
import { makeSessionCookie, parseSessionCookie } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/password';
import { legacy, TicketsUnavailableError } from '@/services/legacy';

describe('cookie de sessão assinado', () => {
  it('aceita o cookie gerado pelo servidor', () => expect(parseSessionCookie(makeSessionCookie('abc123'))).toBe('abc123'));
  it('rejeita id forjado sem assinatura (o bug original: cookie = userId)', () => expect(parseSessionCookie('cmabc123')).toBeNull());
  it('rejeita assinatura adulterada', () => {
    const [id, sig] = makeSessionCookie('abc123').split('.');
    expect(parseSessionCookie(`${id}.${sig?.replace(/.$/, (c) => (c === '0' ? '1' : '0'))}`)).toBeNull();
  });
  it('rejeita troca do id mantendo a assinatura', () => {
    const [, sig] = makeSessionCookie('abc123').split('.');
    expect(parseSessionCookie(`outro.${sig}`)).toBeNull();
  });
});

describe('senha', () => {
  it('guarda hash, nunca texto puro, e verifica corretamente', () => {
    const h = hashPassword('nexo123');
    expect(h).not.toContain('nexo123');
    expect(verifyPassword('nexo123', h)).toBe(true);
    expect(verifyPassword('errada', h)).toBe(false);
  });
});

describe('sistema legado instável', () => {
  it('tenta de novo e se recupera após falhas curtas', async () => {
    let calls = 0;
    const seq = [0, 0, 1]; // falha, falha, ok
    const r = await legacy(async () => ++calls, { failureRate: 0.5, baseDelayMs: 1, random: () => seq.shift() ?? 1 });
    expect(r).toBe(1);
  });
  it('desiste após 3 tentativas com erro tipado', async () => {
    await expect(legacy(async () => 1, { failureRate: 1, baseDelayMs: 1 })).rejects.toBeInstanceOf(TicketsUnavailableError);
  });
  it('não mascara erros que não são de indisponibilidade', async () => {
    await expect(legacy(async () => { throw new Error('bug'); }, { failureRate: 0, baseDelayMs: 1 })).rejects.toThrow('bug');
  });
});
