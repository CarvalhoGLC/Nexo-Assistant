import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { dailyLimitError, startOfUtcDay } from '@/lib/limits';
import { addMessage, conversationForUser } from '@/services/conversation-service';
import { mkUser, resetDb } from './helpers';

beforeEach(async () => { await resetDb(); });
afterEach(() => { delete process.env.DAILY_MESSAGES_PER_USER; delete process.env.DAILY_MESSAGES_GLOBAL; });

async function userMessages(userId: string, n: number, when = new Date()) {
  const c = await conversationForUser(userId);
  for (let i = 0; i < n; i++) await addMessage(c.id, { sender: 'USER', text: `m${i}`, createdAt: when });
}

describe('tetos diários de uso (proteção de custo)', () => {
  it('abaixo do teto: libera', async () => {
    const ana = await mkUser('Ana Souza'); await userMessages(ana.id, 2);
    process.env.DAILY_MESSAGES_PER_USER = '3';
    expect(await dailyLimitError(ana.id)).toBeNull();
  });
  it('teto por usuário: bloqueia quem passou, mas não os outros', async () => {
    const ana = await mkUser('Ana Souza'); const carla = await mkUser('Carla Mendes');
    await userMessages(ana.id, 3); await userMessages(carla.id, 1);
    process.env.DAILY_MESSAGES_PER_USER = '3';
    expect(await dailyLimitError(ana.id)).toContain('limite de 3 mensagens por dia');
    expect(await dailyLimitError(carla.id)).toBeNull();
  });
  it('teto global: bloqueia todos quando o serviço inteiro passou do limite', async () => {
    const ana = await mkUser('Ana Souza'); const carla = await mkUser('Carla Mendes');
    await userMessages(ana.id, 2); await userMessages(carla.id, 2);
    process.env.DAILY_MESSAGES_GLOBAL = '4';
    expect(await dailyLimitError(carla.id)).toContain('limite diário de uso');
  });
  it('mensagens de ontem e respostas do agent não contam', async () => {
    const ana = await mkUser('Ana Souza');
    await userMessages(ana.id, 5, new Date(startOfUtcDay().getTime() - 3600_000));
    const c = await conversationForUser(ana.id);
    await addMessage(c.id, { sender: 'AGENT', text: 'resposta' });
    process.env.DAILY_MESSAGES_PER_USER = '1';
    expect(await dailyLimitError(ana.id)).toBeNull();
  });
});
