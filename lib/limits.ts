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
