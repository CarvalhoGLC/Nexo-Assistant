/** O sistema de chamados é legado e, às vezes, fica indisponível por alguns segundos.
 *  `legacy()` simula essa falha (TICKETS_FAILURE_RATE) e faz retry com backoff curto. */
export class TicketsUnavailableError extends Error {
  constructor() {
    super('Sistema de chamados indisponível no momento');
    this.name = 'TicketsUnavailableError';
  }
}

export type LegacyOptions = { failureRate?: number; attempts?: number; baseDelayMs?: number; random?: () => number };

export async function legacy<T>(fn: () => Promise<T>, o: LegacyOptions = {}): Promise<T> {
  const rate = o.failureRate ?? Number(process.env.TICKETS_FAILURE_RATE ?? 0);
  const attempts = o.attempts ?? 3;
  const delay = o.baseDelayMs ?? 200;
  const rnd = o.random ?? Math.random;
  for (let i = 1; ; i++) {
    try {
      if (rnd() < rate) throw new TicketsUnavailableError();
      return await fn();
    } catch (e) {
      if (!(e instanceof TicketsUnavailableError) || i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, delay * 2 ** (i - 1)));
    }
  }
}
