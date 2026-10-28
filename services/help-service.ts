import { db } from '../lib/db';

const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const STOP = new Set(['para', 'com', 'que', 'uma', 'meu', 'minha', 'nao', 'esta', 'estou', 'como', 'por', 'dos', 'das', 'mas', 'pra']);

/** Busca por palavras em título (peso 3) e conteúdo (peso 1), sem acento. Suficiente para poucos artigos; ver trade-offs no README. */
export async function searchHelp(query: string, limit = 3) {
  const articles = await db.helpArticle.findMany();
  const terms = norm(query).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t));
  return articles
    .map((a) => {
      const title = norm(a.title);
      const body = norm(`${a.content} ${a.category}`);
      const score = terms.reduce((s, t) => s + (title.includes(t) ? 3 : body.includes(t) ? 1 : 0), 0);
      return { ...a, score };
    })
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
