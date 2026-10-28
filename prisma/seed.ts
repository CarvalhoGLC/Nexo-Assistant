import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/password';
import { dueAt } from '../lib/sla';
import { toCard } from '../services/ticket-service';
import type { DecisionStep, QuickOptions } from '../lib/types';
import type { Priority } from '../lib/types';

const db = new PrismaClient();
const ago = (days: number, hours = 0) => new Date(Date.now() - days * 86400_000 - hours * 3600_000);

const PASSWORD = 'nexo123'; // demonstração: o PRD aceita qualquer senha; aqui fica guardada apenas como hash

const users = [
  { name: 'Ana Souza', email: 'ana.souza@nexo.com.br', role: 'EMPLOYEE', department: 'Financeiro' },
  { name: 'Carla Mendes', email: 'carla.mendes@nexo.com.br', role: 'EMPLOYEE', department: 'Controladoria' },
  { name: 'Bruno Tavares', email: 'bruno.tavares@nexo.com.br', role: 'EMPLOYEE', department: 'Comercial' },
  { name: 'Diego Ramos', email: 'diego.ramos@nexo.com.br', role: 'EMPLOYEE', department: 'Engenharia' },
  { name: 'Elisa Prado', email: 'elisa.prado@nexo.com.br', role: 'EMPLOYEE', department: 'Marketing' },
  { name: 'Fábio Nunes', email: 'fabio.nunes@nexo.com.br', role: 'EMPLOYEE', department: 'Engenharia' },
  { name: 'Gabriela Rocha', email: 'gabriela.rocha@nexo.com.br', role: 'EMPLOYEE', department: 'RH' },
  { name: 'Rafael Lima', email: 'rafael.lima@nexo.com.br', role: 'ANALYST', department: 'Suporte N2' },
  { name: 'Marina Alves', email: 'marina.alves@nexo.com.br', role: 'ANALYST', department: 'Suporte N1' },
];

const articles = [
  { id: 'vpn-com-erro-809', title: 'VPN com erro 809', category: 'Rede e VPN',
    content: 'Reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.' },
  { id: 'horario-do-service-desk', title: 'Horário do service desk', category: 'Outros',
    content: 'Atendimento de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.' },
  { id: 'redefinir-senha-da-rede', title: 'Redefinir a senha da rede', category: 'Acesso',
    content: 'Acesse senha.nexo.com.br, confirme o código enviado ao celular cadastrado e escolha uma nova senha (mínimo de 12 caracteres). Contas bloqueadas por tentativas liberam sozinhas em 30 minutos.' },
  { id: 'senha-do-sap', title: 'Senha do SAP', category: 'Acesso',
    content: 'Senhas de sistemas como o SAP são tratadas por chamado de Acesso. Não compartilhe sua senha no chat.' },
  { id: 'outlook-nao-sincroniza', title: 'Outlook não sincroniza', category: 'E-mail',
    content: 'Feche e abra o Outlook, confirme que o modo offline está desligado e que a caixa não está cheia. Se persistir, abra um chamado de E-mail informando o horário em que parou.' },
  { id: 'segundo-monitor', title: 'Segundo monitor', category: 'Hardware',
    content: 'Solicitações de equipamento são requisições (REQ) e devem informar o modelo ou a necessidade.' },
  { id: 'wifi-corporativo', title: 'Wi-Fi corporativo', category: 'Rede e VPN',
    content: 'Esqueça a rede NEXO-CORP e conecte de novo com e-mail e senha da rede. Visitantes usam NEXO-GUEST (senha do dia na recepção). Se o problema afetar toda a equipe, informe ao suporte.' },
  { id: 'acesso-a-pasta', title: 'Acesso a pasta', category: 'Acesso',
    content: 'Solicitações de acesso devem informar a pasta, a justificativa e o gestor responsável.' },
  { id: 'computador-lento', title: 'Computador lento', category: 'Hardware',
    content: 'Reinicie, feche programas abertos e rode o Diagnóstico Nexo no portal de softwares. Se a lentidão persistir após atualizações do Windows, abra um chamado de Hardware informando quando começou e quais aplicações estão lentas.' },
  { id: 'impressora', title: 'Impressora: como adicionar', category: 'Hardware',
    content: 'Abra o portal de softwares > Impressoras e escolha a impressora do seu andar. Se o driver não instalar, reinicie o computador antes de abrir chamado.' },
];

async function main() {
  const byEmail: Record<string, string> = {};
  for (const u of users) {
    const row = await db.user.upsert({ where: { email: u.email }, update: { name: u.name, role: u.role, department: u.department, password: hashPassword(PASSWORD) }, create: { ...u, password: hashPassword(PASSWORD), passwordChangedAt: ago(u.email.startsWith('ana') ? 42 : 90) } });
    byEmail[u.email] = row.id;
  }
  const id = (first: string) => byEmail[`${first}@nexo.com.br`] as string;

  for (const a of articles) await db.helpArticle.upsert({ where: { id: a.id }, update: a, create: a });

  type T = { number: string; type: 'INC' | 'REQ'; title: string; description: string; category: string; priority: Priority; status: string; affected?: string; owner: string; updated: Date; created: Date; resolved?: Date };
  const tickets: T[] = [
    { number: 'INC-20311', type: 'INC', title: 'Notebook lento após atualização do Windows', category: 'Hardware', priority: 'MEDIUM', status: 'ANALYST', owner: 'ana.souza',
      description: 'Lentidão geral desde a atualização de 15/10. Reiniciar e rodar o diagnóstico da central não resolveu.', created: ago(7), updated: ago(6) },
    { number: 'INC-20298', type: 'INC', title: 'Acesso à pasta Financeiro no SharePoint', category: 'Acesso', priority: 'MEDIUM', status: 'IN_PROGRESS', owner: 'ana.souza',
      description: 'Não consigo abrir a pasta Financeiro > Fechamento no SharePoint (acesso negado).', created: ago(9), updated: ago(1) },
    { number: 'REQ-10442', type: 'REQ', title: 'Segundo monitor para home office', category: 'Hardware', priority: 'LOW', status: 'APPROVED', owner: 'ana.souza',
      description: 'Solicito um segundo monitor para uso em home office.', created: ago(14), updated: ago(2) },
    { number: 'INC-20150', type: 'INC', title: 'Senha do SAP bloqueada', category: 'Acesso', priority: 'MEDIUM', status: 'RESOLVED', owner: 'ana.souza',
      description: 'Senha do SAP bloqueada após três tentativas.', created: ago(6), updated: ago(4), resolved: ago(4) },
    { number: 'INC-19877', type: 'INC', title: 'Outlook não sincroniza no celular', category: 'E-mail', priority: 'LOW', status: 'RESOLVED', owner: 'ana.souza',
      description: 'Outlook não sincroniza no celular.', created: ago(20), updated: ago(12), resolved: ago(12) },
    { number: 'REQ-10501', type: 'REQ', title: 'Acesso ao SAP módulo FI', category: 'Acesso', priority: 'HIGH', status: 'OPEN', owner: 'carla.mendes',
      description: 'Preciso de acesso ao módulo FI do SAP para o fechamento.', created: ago(0, 3), updated: ago(0, 3) },
    { number: 'INC-20402', type: 'INC', title: 'VPN cai a cada 10 minutos', category: 'Rede e VPN', priority: 'HIGH', status: 'IN_PROGRESS', owner: 'bruno.tavares',
      description: 'A VPN desconecta sozinha durante chamadas com clientes.', created: ago(2), updated: ago(0, 2) },
    { number: 'INC-20519', type: 'INC', title: 'Impressora do 3º andar não imprime', category: 'Hardware', priority: 'MEDIUM', status: 'OPEN', owner: 'elisa.prado',
      description: 'A impressora do 3º andar não imprime desde a manhã. Já reiniciei o computador.', created: ago(0, 1), updated: ago(0, 1) },
    { number: 'INC-20488', type: 'INC', title: 'Servidor de arquivos da engenharia fora do ar', category: 'Rede e VPN', priority: 'CRITICAL', status: 'IN_PROGRESS', affected: 'Minha equipe', owner: 'diego.ramos',
      description: 'Time inteiro sem acesso ao servidor de arquivos.', created: ago(0, 6), updated: ago(0, 5) },
  ];
  for (const t of tickets) {
    const data = {
      number: t.number, type: t.type, title: t.title, description: t.description, category: t.category, priority: t.priority, status: t.status,
      affected: t.affected ?? 'Só eu', userId: id(t.owner), lastUpdate: t.updated, createdAt: t.created, resolvedAt: t.resolved ?? null, dueAt: dueAt(t.priority, t.updated),
    };
    await db.ticket.upsert({ where: { number: t.number }, update: data, create: data });
  }
  // ---- Conversas de exemplo (espelham o protótipo): o console abre populado ----
  await db.conversation.deleteMany();
  const at = (min: number) => new Date(Date.now() - min * 60_000);
  const S = (action: string, label: string, understood: string, what: string, confidence: number, reason: string, data?: Record<string, unknown>): DecisionStep =>
    ({ id: `seed-${action}-${Math.random().toString(36).slice(2, 8)}`, action, label, understood, what, confidence, reason, data, status: 'ok', ms: 120 });
  type M = { sender: 'USER' | 'AGENT' | 'SYSTEM'; text: string; min: number; steps?: DecisionStep[]; cards?: string[]; options?: QuickOptions };
  const card = async (number: string) => { const t = await db.ticket.findUniqueOrThrow({ where: { number } }); return toCard(t); };

  async function conversation(owner: string, status: string, msgs: M[], handoff?: { reason: string; level: 'N1' | 'N2'; summary: string; ticket?: string; confidence?: number; min: number }) {
    const last = msgs[msgs.length - 1]!;
    const c = await db.conversation.create({
      data: {
        userId: id(owner), status, createdAt: at(Math.max(...msgs.map((m) => m.min)) + 5), updatedAt: at(last.min),
        ...(handoff ? { handoffReason: handoff.reason, handoffLevel: handoff.level, handoffSummary: handoff.summary, handoffTicket: handoff.ticket ?? null, handoffConfidence: handoff.confidence ?? null, handoffAt: at(handoff.min) } : {}),
      },
    });
    for (const m of msgs) {
      const cards = m.cards ? await Promise.all(m.cards.map(card)) : undefined;
      await db.message.create({
        data: {
          conversationId: c.id, sender: m.sender, text: m.text, createdAt: at(m.min), steps: m.steps ? JSON.stringify(m.steps) : null,
          cards: cards ? JSON.stringify(cards) : null, options: m.options ? JSON.stringify(m.options) : null,
        },
      });
    }
  }

  const mine = { reason: 'Notebook lento após atualização', confidence: 0.9 };
  await conversation('ana.souza', 'AWAITING', [
    { sender: 'USER', text: 'Qual o status do meu chamado?', min: 40 },
    { sender: 'AGENT', text: 'Você tem 3 chamados abertos. Sobre qual deles quer saber?', min: 40,
      steps: [S('listMyTickets', 'consultou seus chamados', 'Quer saber o status de um chamado, sem citar o número.', 'Listou 3 chamado(s) aberto(s) do funcionário.', 0.95, 'Há mais de um chamado aberto: preciso saber qual.', { numeros: ['INC-20311', 'INC-20298', 'REQ-10442'] })],
      options: { kind: 'tickets', question: 'Escolha um chamado', items: [
        { label: 'INC-20311 · Notebook lento após atualização do Windows', value: 'INC-20311', hint: 'Aguardando analista · vencido' },
        { label: 'INC-20298 · Acesso à pasta Financeiro no SharePoint', value: 'INC-20298', hint: 'Em andamento' },
        { label: 'REQ-10442 · Segundo monitor para home office', value: 'REQ-10442', hint: 'Aprovado' }] } },
    { sender: 'USER', text: 'INC-20311 · Notebook lento após atualização do Windows', min: 39 },
    { sender: 'AGENT', text: 'Está sem atualização há 6 dias, acima do prazo de 3 dias úteis para prioridade média. Quer que eu chame um analista?', min: 39,
      steps: [S('getTicket', 'consultou o INC-20311', 'Quer o status do INC-20311.', 'Calculou o prazo: VENCIDO (prioridade MEDIUM, prazo 3 dias úteis).', 0.97, 'O funcionário escolheu o chamado na lista.', { numero: 'INC-20311', vencido: true })],
      cards: ['INC-20311'],
      options: { kind: 'options', question: 'Quer que eu chame um analista?', items: [{ label: 'Falar com um analista', value: 'Falar com um analista' }, { label: 'Adicionar informação', value: 'Adicionar informação' }, { label: 'Não, obrigado', value: 'Não, obrigado' }] } },
    { sender: 'USER', text: 'Quero falar com um analista.', min: 38 },
    { sender: 'AGENT', text: 'Encaminhei para o Suporte N2, com o resumo do caso. Um analista vai falar com você em até 2 h úteis.', min: 38,
      steps: [S('escalateToAnalyst', 'transferiu para um analista', 'Pediu para falar com uma pessoa sobre o INC-20311, vencido.', 'Transferiu a conversa para o Suporte N2 (overdue) com resumo do caso.', 0.96, 'Chamado vencido e o funcionário aceitou o analista.', { motivo: 'overdue', nivel: 'N2', chamado: 'INC-20311' })] },
    { sender: 'SYSTEM', text: 'Transferida para Suporte N2 · um analista fala com você em até 2 h úteis.', min: 38 },
    { sender: 'USER', text: 'Alguma previsão de atendimento?', min: 6 },
    { sender: 'USER', text: 'É urgente, tenho fechamento hoje.', min: 5 },
  ], { reason: 'overdue', level: 'N2', ticket: 'INC-20311', min: 38, summary: `INC-20311 (Notebook lento após atualização do Windows, prioridade média) sem atualização há 6 dias; prazo de 3 dias úteis vencido. A funcionária pediu um analista. Já tentou reiniciar e rodar o diagnóstico da central. ${mine.reason}.` });

  await conversation('carla.mendes', 'AWAITING', [
    { sender: 'USER', text: 'Preciso de acesso ao módulo FI do SAP para o fechamento, ainda hoje.', min: 100 },
    { sender: 'AGENT', text: 'Seu pedido REQ-10501 já está aberto e precisa de aprovação do gestor. Chamei um analista para acelerar.', min: 99,
      steps: [S('listMyTickets', 'consultou seus chamados', 'Pedido de acesso ao SAP com urgência.', 'Listou 1 chamado aberto: REQ-10501.', 0.93, 'Antes de abrir, confiro duplicidade.', { numeros: ['REQ-10501'] }),
              S('escalateToAnalyst', 'transferiu para um analista', 'Pedido de acesso crítico para o fechamento de hoje.', 'Transferiu a conversa para o Suporte N2 (critical).', 0.9, 'Compromisso no mesmo dia e aprovação pendente.', { motivo: 'critical', nivel: 'N2', chamado: 'REQ-10501' })] },
    { sender: 'SYSTEM', text: 'Transferida para Suporte N2 · um analista fala com você em até 2 h úteis.', min: 95 },
    { sender: 'USER', text: 'Preciso de acesso ao SAP ainda hoje', min: 4 },
  ], { reason: 'critical', level: 'N2', ticket: 'REQ-10501', min: 95, summary: 'REQ-10501: acesso ao módulo FI do SAP para o fechamento de hoje. Falta aprovação do gestor.' });

  await conversation('bruno.tavares', 'AWAITING', [
    { sender: 'USER', text: 'Minha VPN cai só quando uso o hotspot do celular em viagem.', min: 55 },
    { sender: 'AGENT', text: 'Vou chamar um analista para isso.', min: 55,
      steps: [S('searchHelpCenter', 'buscou na central de ajuda', 'A VPN cai apenas em rede móvel (hotspot).', 'Nenhum artigo relevante encontrado.', 0.6, 'A central não cobre queda de VPN por hotspot.', { consulta: 'vpn cai hotspot' }),
              S('escalateToAnalyst', 'transferiu para um analista', 'Problema de VPN fora do que a central cobre; já existe o INC-20402 aberto.', 'Transferiu a conversa para o Suporte N2 (low_confidence).', 0.41, 'Não tenho segurança se é o mesmo problema do INC-20402 ou outro.', { motivo: 'low_confidence', nivel: 'N2', chamado: 'INC-20402' })] },
    { sender: 'SYSTEM', text: 'Transferida para Suporte N2 · um analista fala com você em até 2 h úteis.', min: 54 },
  ], { reason: 'low_confidence', level: 'N2', ticket: 'INC-20402', confidence: 0.41, min: 54, summary: 'Funcionário relata queda de VPN ao usar hotspot do celular. Pode ser o INC-20402 (VPN cai a cada 10 min) ou causa diferente. O agent não teve segurança para decidir se atualiza o chamado ou abre outro.' });

  await conversation('diego.ramos', 'AGENT', [
    { sender: 'USER', text: 'O servidor de arquivos da engenharia já voltou?', min: 2 },
    { sender: 'AGENT', text: 'Seu chamado INC-20488 (crítico) segue em andamento. Um analista já está nele.', min: 2,
      steps: [S('getTicket', 'consultou o INC-20488', 'Pergunta se o servidor de arquivos voltou.', 'Calculou o prazo: dentro do prazo (1 hora).', 0.94, 'Há um chamado crítico aberto sobre o tema.', { numero: 'INC-20488' })], cards: ['INC-20488'] },
  ]);

  await conversation('elisa.prado', 'AGENT', [
    { sender: 'USER', text: 'A impressora do 3º andar não imprime desde de manhã. Já reiniciei o computador.', min: 12 },
    { sender: 'AGENT', text: 'Chamado INC-20519 criado.', min: 9,
      steps: [S('listMyTickets', 'consultou seus chamados', 'Impressora sem imprimir.', 'Listou 0 chamado(s) aberto(s) do funcionário.', 0.95, 'Conferir duplicidade antes de abrir.'),
              S('searchHelpCenter', 'buscou na central de ajuda', 'Impressora sem imprimir.', 'Encontrou 1 artigo(s): Impressora: como adicionar.', 0.8, 'Ver se a central resolve sem chamado.'),
              S('classifyPriority', 'classificou a prioridade', 'Impressora do andar parada, há alternativa.', 'Atrapalha, mas há alternativa → Média (3 dias úteis).', 0.85, 'Só ela afetada, sem compromisso no dia.'),
              S('checkSla', 'consultou o SLA', 'Impressora do andar parada.', 'Prazo da prioridade MEDIUM: 3 dias úteis.', 0.85, 'Informar o prazo ao funcionário.'),
              S('proposeDraft', 'montou o rascunho', 'Impressora do andar parada.', 'Montou o rascunho para confirmação.', 0.85, 'Todos os dados reunidos.')], cards: ['INC-20519'] },
  ]);

  await conversation('fabio.nunes', 'RESOLVED', [
    { sender: 'USER', text: 'Meu VPN dá erro 809, o que faço?', min: 80 },
    { sender: 'AGENT', text: 'Reinstale o cliente de VPN pelo portal de softwares e reinicie. Vale para Windows 10, que é o seu caso.', min: 80,
      steps: [S('searchHelpCenter', 'buscou na central de ajuda', 'Erro 809 na VPN.', 'Encontrou 1 artigo(s): VPN com erro 809.', 0.95, 'Dúvida respondida pela central, sem chamado.')] },
    { sender: 'USER', text: 'Isso resolveu, obrigado!', min: 70 },
  ]);

  await conversation('gabriela.rocha', 'RESOLVED', [
    { sender: 'USER', text: 'Qual a senha do Wi-Fi para visitantes?', min: 1500 },
    { sender: 'AGENT', text: 'A senha do Wi-Fi foi enviada para o seu e-mail corporativo.', min: 1499,
      steps: [S('searchHelpCenter', 'buscou na central de ajuda', 'Quer a senha do Wi-Fi de visitantes.', 'Encontrou 1 artigo(s): Wi-Fi corporativo.', 0.9, 'Dúvida respondida pela central.')] },
  ]);

}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
