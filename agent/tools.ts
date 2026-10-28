import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { AFFECTED, CATEGORIES } from '../lib/types';
import { buildActions, type ActionCtx } from './actions';

const reasoning = {
  understood: z.string().describe('O que você entendeu do pedido do funcionário, em uma frase'),
  confidence: z.number().min(0).max(1).describe('Sua segurança nesta ação, de 0 a 1'),
  reason: z.string().describe('Por que esta ação é a certa agora, em uma frase'),
};

/** Ferramentas do Mastra. O userId vem do contexto (sessão), por isso nenhuma ferramenta o recebe como parâmetro. */
export function buildTools(ctx: ActionCtx) {
  const a = buildActions(ctx);
  return {
    searchHelpCenter: createTool({
      id: 'searchHelpCenter', description: 'Busca artigos na central de ajuda para responder dúvidas sem abrir chamado.',
      inputSchema: z.object({ query: z.string().describe('Termos da busca'), ...reasoning }),
      execute: async (i) => a.searchHelpCenter(i),
    }),
    listMyTickets: createTool({
      id: 'listMyTickets', description: 'Lista os chamados do funcionário logado (abertos ou todos), com status e se estão vencidos.',
      inputSchema: z.object({ scope: z.enum(['open', 'all']), showAsChoices: z.boolean().describe('Mostrar lista selecionável na interface'), ...reasoning }),
      execute: async (i) => a.listMyTickets(i),
    }),
    getTicket: createTool({
      id: 'getTicket', description: 'Consulta um chamado do funcionário pelo número (ex.: INC-20311) e informa se o prazo venceu.',
      inputSchema: z.object({ ticketNumber: z.string(), ...reasoning }),
      execute: async (i) => a.getTicket(i),
    }),
    askUser: createTool({
      id: 'askUser', description: 'Faz uma pergunta ao funcionário com opções rápidas (2 a 4).',
      inputSchema: z.object({ question: z.string(), options: z.array(z.string()).min(2).max(4), ...reasoning }),
      execute: async (i) => a.askUser(i),
    }),
    proposeDraft: createTool({
      id: 'proposeDraft',
      description: 'Monta o rascunho de chamado (create), atualização (update) ou reabertura (reopen) para o funcionário confirmar. A prioridade é calculada pelo sistema.',
      inputSchema: z.object({
        kind: z.enum(['create', 'update', 'reopen']),
        ticketNumber: z.string().optional().describe('Obrigatório em update e reopen'),
        title: z.string().max(100), description: z.string().describe('Descrição completa, para o analista não precisar perguntar de novo'),
        type: z.enum(['INC', 'REQ']), category: z.enum(CATEGORIES), affected: z.enum(AFFECTED),
        blocksWork: z.boolean().describe('Impede o funcionário de trabalhar'),
        sameDayCommitment: z.boolean().describe('Há compromisso em risco no mesmo dia'),
        hasWorkaround: z.boolean().describe('Existe alternativa'),
        confirmedDifferentProblem: z.boolean().optional().describe('Só true se o funcionário disse que NÃO é o mesmo problema de um chamado existente'),
        ...reasoning,
      }),
      execute: async (i) => a.proposeDraft(i),
    }),
    escalateToAnalyst: createTool({
      id: 'escalateToAnalyst', description: 'Transfere a conversa para um analista com resumo do caso. O agent para de responder depois disso.',
      inputSchema: z.object({
        handoffReason: z.enum(['user_request', 'critical', 'overdue', 'low_confidence']), summary: z.string(), ticketNumber: z.string().optional(), ...reasoning,
      }),
      execute: async (i) => a.escalateToAnalyst(i),
    }),
    redirectOutOfScope: createTool({
      id: 'redirectOutOfScope', description: 'Registra que o assunto não é de TI (RH, financeiro, facilities).',
      inputSchema: z.object({ area: z.string(), ...reasoning }),
      execute: async (i) => a.redirectOutOfScope(i),
    }),
  };
}
