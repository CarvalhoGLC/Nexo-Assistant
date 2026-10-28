import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { searchHelp } from '../services/help-service';
import { ticketService } from '../services/ticket-service';
import type { AgentAction, AgentResult, DraftTicket, Priority, TicketType } from '../lib/types';

const State = Annotation.Root({
  userId: Annotation<string>(),
  input: Annotation<string>(),
  result: Annotation<AgentResult | undefined>(),
});

type Intent = 'transfer' | 'create' | 'update' | 'status' | 'help' | 'scope';

export function classify(input: string): Intent {
  const value = input.toLowerCase();

  if (/analista|humano|pessoa|atendente/.test(value)) return 'transfer';
  if (/abrir|criar|novo chamado|registrar|quero um chamado/.test(value)) return 'create';
  if (/atualizar|complementar|adicionar informação|acrescentar informação/.test(value)) return 'update';
  if (/status|andamento|atrasad|meu chamado|meus chamados|ticket|inc-|req-/.test(value)) return 'status';
  if (/vpn|senha|outlook|wi.?fi|monitor|notebook|computador|acesso|e-mail|email/.test(value)) return 'help';
  return 'scope';
}

export function priority(input: string): Priority {
  const value = input.toLowerCase();

  if (/empresa inteira|toda a empresa|equipe inteira|todos|parou/.test(value)) return 'CRITICAL';
  if (/reunião|cliente|hoje|não consigo trabalhar|impede|urgente/.test(value)) return 'HIGH';
  if (/atrapalha|lento|erro|falha/.test(value)) return 'MEDIUM';
  return 'LOW';
}

function category(input: string) {
  const value = input.toLowerCase();
  if (/vpn|wi.?fi|rede|internet/.test(value)) return 'Rede e VPN';
  if (/senha|acesso|permissão|pasta|sap/.test(value)) return 'Acesso';
  if (/notebook|monitor|computador|teclado|mouse/.test(value)) return 'Hardware';
  if (/outlook|software|aplicativo|programa/.test(value)) return 'Software';
  if (/e-mail|email/.test(value)) return 'E-mail';
  return 'Outros';
}

function ticketType(input: string): TicketType {
  const value = input.toLowerCase();
  return /acesso|monitor|equipamento|software|instala|permissão/.test(value) ? 'REQ' : 'INC';
}

function dueAtFor(priorityValue: Priority) {
  const hours: Record<Priority, number> = {
    CRITICAL: 1,
    HIGH: 4,
    MEDIUM: 72,
    LOW: 120,
  };
  const selectedHours = hours[priorityValue];

  return new Date(Date.now() + selectedHours * 60 * 60 * 1000).toISOString();
}

function action(label: string, detail: string): AgentAction {
  return { label, detail };
}

async function decide(state: { userId: string; input: string }) {
  const input = state.input.trim();
  const intent = classify(input);
  const actions: AgentAction[] = [];

  if (intent === 'scope') {
    return {
      result: {
        intent,
        text: 'Posso ajudar apenas com assuntos de TI, como acesso, rede, hardware, software e e-mail. O que está acontecendo?',
        actions,
        confidence: 0.99,
      },
    };
  }

  if (intent === 'transfer') {
    return {
      result: {
        intent,
        text: 'Claro. Vou encaminhar esta conversa para um analista. Enquanto ele estiver atendendo, o Nexo Assist ficará pausado.',
        actions: [action('transferência solicitada', 'O funcionário pediu atendimento humano.')],
        confidence: 0.99,
        needsHuman: true,
      },
    };
  }

  const tickets = await ticketService.listForUser(state.userId);

  if (intent === 'status') {
    actions.push(action('consultou seus chamados', `Encontrados ${tickets.length} chamados do funcionário.`));
    const open = tickets.filter((ticket) => ticket.status !== 'RESOLVED');

    return {
      result: {
        intent,
        text: open.length
          ? `Encontrei ${open.length} chamado(s) seu(s) ainda em andamento. Você pode conferir os detalhes no painel de chamados.`
          : 'Não encontrei chamados seus em aberto no momento.',
        actions,
        confidence: 0.97,
      },
    };
  }

  const help = await searchHelp(input);
  if (help[0]) {
    actions.push(action('buscou na central de ajuda', help[0].title));
  }

  const similar = await ticketService.findSimilar(state.userId, input);
  actions.push(
    action(
      'consultou seus chamados',
      similar.length
        ? `Encontrei ${similar.length} chamado(s) potencialmente relacionado(s).`
        : 'Não encontrei duplicidade evidente.',
    ),
  );

  if (intent === 'help' && help[0] && help[0].score >= 2 && !/abrir chamado|criar chamado/.test(input.toLowerCase())) {
    return {
      result: {
        intent,
        text: help[0].content,
        actions,
        confidence: 0.9,
      },
    };
  }

  const priorityValue = priority(input);
  const draft: DraftTicket = {
    title: input.slice(0, 70),
    description: input,
    type: ticketType(input),
    category: category(input),
    priority: priorityValue,
    affected: /equipe|todos|empresa/.test(input.toLowerCase()) ? 'Equipe/empresa' : 'Somente você',
    dueAt: dueAtFor(priorityValue),
  };

  if (similar.length && (intent === 'create' || intent === 'update')) {
    return {
      result: {
        intent,
        text: 'Encontrei um chamado seu potencialmente relacionado. Para evitar duplicidade, posso usar o chamado existente e complementar as informações depois da sua confirmação.',
        actions,
        confidence: 0.9,
        draft,
      },
    };
  }

  if (intent === 'update') {
    return {
      result: {
        intent,
        text: 'Posso complementar um chamado existente. Primeiro selecione o chamado no painel para confirmar qual deve ser atualizado.',
        actions,
        confidence: 0.86,
      },
    };
  }

  return {
    result: {
      intent,
      text: 'Preparei um rascunho do chamado com as informações que você forneceu. Confira os dados antes de confirmar a abertura.',
      actions,
      confidence: 0.82,
      draft,
    },
  };
}

export async function runAgent(userId: string, input: string): Promise<AgentResult> {
  const graph = new StateGraph(State)
    .addNode('decide', decide)
    .addEdge(START, 'decide')
    .addEdge('decide', END)
    .compile();

  const output = await graph.invoke({ userId, input });
  return output.result!;
}