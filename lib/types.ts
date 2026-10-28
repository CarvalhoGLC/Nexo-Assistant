export const ROLES = ['EMPLOYEE', 'ANALYST'] as const;
export type Role = (typeof ROLES)[number];

/** AWAITING = transferida, aguardando atendente. ANALYST = analista atendendo (agent pausado). */
export const CONVERSATION_STATUSES = ['AGENT', 'AWAITING', 'ANALYST', 'CLOSED'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const TICKET_TYPES = ['INC', 'REQ'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'PENDING', 'ANALYST', 'APPROVED', 'RESOLVED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const CLOSED_TICKET_STATUSES: TicketStatus[] = ['RESOLVED'];

export const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CATEGORIES = ['Acesso', 'Rede e VPN', 'Hardware', 'Software', 'E-mail', 'Outros'] as const;
export type Category = (typeof CATEGORIES)[number];

export const AFFECTED = ['Só eu', 'Minha equipe', 'Toda a empresa'] as const;
export type Affected = (typeof AFFECTED)[number];

export const PRIORITY_LABEL: Record<Priority, string> = { CRITICAL: 'Crítica', HIGH: 'Alta', MEDIUM: 'Média', LOW: 'Baixa' };
export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Aberto', IN_PROGRESS: 'Em andamento', PENDING: 'Pendente', ANALYST: 'Aguardando analista', APPROVED: 'Aprovado', RESOLVED: 'Resolvido',
};
export const CONVERSATION_STATUS_LABEL: Record<ConversationStatus, string> = {
  AGENT: 'Agent atendendo', AWAITING: 'Aguardando atendente', ANALYST: 'Analista atendendo', CLOSED: 'Encerrada',
};
export const HANDOFF_REASON_LABEL = {
  user_request: 'Funcionário pediu um analista', critical: 'Caso crítico', overdue: 'Chamado vencido', low_confidence: 'Agent sem segurança para decidir',
} as const;
export type HandoffReason = keyof typeof HANDOFF_REASON_LABEL;

/** Registro de uma decisão do agent: o que entendeu, o que fez, com que segurança e por quê. */
export type DecisionStep = {
  id: string;
  action: string; // nome técnico da ferramenta
  label: string; // texto do chip ("consultou seus chamados")
  understood: string; // o que o agent entendeu do pedido
  what: string; // o que fez, em linguagem natural
  confidence: number; // 0..1, informada pelo modelo
  reason: string; // por que escolheu esta ação
  data?: Record<string, unknown>;
  status: 'ok' | 'error';
  ms: number;
};

export type TicketCard = {
  number: string;
  type: TicketType;
  title: string;
  description: string;
  category: string;
  priority: Priority;
  status: TicketStatus;
  affected: string;
  createdAt: string;
  lastUpdate: string;
  dueAt: string;
  overdue: boolean;
};

export type DraftDTO = {
  code: string;
  kind: 'create' | 'update' | 'reopen';
  ticketNumber?: string;
  title: string;
  description: string;
  type: TicketType;
  category: string;
  priority: Priority;
  priorityReason: string;
  affected: string;
  dueAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'SUPERSEDED';
  resultNumber?: string;
};

export type QuickOptions = {
  kind: 'options' | 'tickets';
  question: string;
  items: { label: string; value: string; hint?: string }[];
};

export type MessageDTO = {
  id: string;
  sender: 'USER' | 'AGENT' | 'ANALYST' | 'SYSTEM';
  text: string;
  createdAt: string;
  authorName?: string;
  steps?: DecisionStep[];
  cards?: TicketCard[];
  options?: QuickOptions;
  draft?: DraftDTO;
};

export type SessionInfo = { count: number; max: number };

/** Eventos enviados por SSE em POST /api/chat. */
export type ChatEvent =
  | { type: 'step'; step: DecisionStep }
  | { type: 'text'; delta: string }
  | { type: 'done'; messages: MessageDTO[]; status: ConversationStatus; session: SessionInfo }
  | { type: 'error'; message: string };
