export const maxMessagesPerSession = (): number => Number(process.env.MAX_MESSAGES_PER_SESSION ?? 30);
export const maxMessageChars = (): number => Number(process.env.MAX_USER_MESSAGE_CHARS ?? 1000);

/** Limite simples de tentativas de login por e-mail (em memória; suficiente para o protótipo). */
const attempts = new Map<string, number[]>();
export function loginRateLimited(key: string, max = 8, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > max;
}

/** Tetos diários (dia UTC) de mensagens que acionam o agent. Protegem o custo do modelo mesmo se alguém abrir várias sessões. */
export const dailyLimitPerUser = (): number => Number(process.env.DAILY_MESSAGES_PER_USER ?? 100);
export const dailyLimitGlobal = (): number => Number(process.env.DAILY_MESSAGES_GLOBAL ?? 1000);

export const startOfUtcDay = (d: Date = new Date()): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Retorna a mensagem de erro (429) se algum teto diário foi atingido; null se pode seguir. */
export async function dailyLimitError(userId: string): Promise<string | null> {
  const { db } = await import('./db');
  const since = startOfUtcDay();
  const [mine, all] = await Promise.all([
    db.message.count({ where: { sender: 'USER', createdAt: { gte: since }, conversation: { userId } } }),
    db.message.count({ where: { sender: 'USER', createdAt: { gte: since } } }),
  ]);
  if (all >= dailyLimitGlobal()) return 'O serviço atingiu o limite diário de uso. Tente novamente amanhã ou procure o service desk no ramal 4000.';
  if (mine >= dailyLimitPerUser()) return `Você atingiu o limite de ${dailyLimitPerUser()} mensagens por dia. Tente novamente amanhã ou procure o service desk no ramal 4000.`;
  return null;
}
