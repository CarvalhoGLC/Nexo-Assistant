import { Agent } from '@mastra/core/agent';
import type { DecisionStep } from '../lib/types';
import { buildInstructions } from './instructions';
import { buildTools } from './tools';
import type { TurnState } from './actions';

export type HistoryItem = { role: 'user'; content: string } | { role: 'assistant'; content: string };

export type RunArgs = {
  user: { id: string; name: string; department: string };
  conversationId: string;
  history: HistoryItem[]; // já inclui a mensagem atual do usuário
  onStep: (s: DecisionStep) => void;
  onText: (delta: string) => void;
};

export const MODEL = (): string => process.env.MODEL ?? 'openai/gpt-4.1-mini';

/** Executa um turno do Nexo Assist. O modelo decide quais ferramentas chamar; as regras do service desk ficam em código (actions.ts). */
export async function runAgent(a: RunArgs): Promise<{ text: string; state: TurnState }> {
  const state: TurnState = { steps: [], cards: [], escalated: false };
  const tools = buildTools({ userId: a.user.id, conversationId: a.conversationId, state, emit: a.onStep });
  const agent = new Agent({
    id: 'nexo-assist', name: 'Nexo Assist', model: MODEL(),
    instructions: await buildInstructions(a.user, a.conversationId, new Date()), tools,
  });
  // Custo: só as últimas mensagens vão ao modelo; resultados de ferramentas antigos não são reenviados.
  const out = await agent.stream(a.history, { maxSteps: 6, modelSettings: { temperature: 0.2, maxOutputTokens: 700 } });
  let text = '';
  for await (const chunk of out.fullStream) {
    if (chunk.type === 'text-delta') {
      const p = chunk.payload as { text?: string };
      if (p.text) { text += p.text; a.onText(p.text); }
    } else if (chunk.type === 'error') {
      throw new Error('Falha do modelo');
    }
  }
  return { text: text.trim(), state };
}
