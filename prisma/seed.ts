import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/password';
import { dueAt } from '../lib/sla';
import type { Priority } from '../lib/types';

const db = new PrismaClient();
const ago = (days: number, hours = 0) => new Date(Date.now() - days * 86400_000 - hours * 3600_000);

const PASSWORD = 'nexo123'; // demonstração: o PRD aceita qualquer senha; aqui fica guardada apenas como hash

const users = [
  { name: 'Ana Souza', email: 'ana.souza@nexo.com.br', role: 'EMPLOYEE', department: 'Financeiro' },
  { name: 'Carla Mendes', email: 'carla.mendes@nexo.com.br', role: 'EMPLOYEE', department: 'Controladoria' },
  { name: 'Bruno Tavares', email: 'bruno.tavares@nexo.com.br', role: 'EMPLOYEE', department: 'Comercial' },
  { name: 'Diego Ramos', email: 'diego.ramos@nexo.com.br', role: 'EMPLOYEE', department: 'Engenharia' },
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
    const row = await db.user.upsert({ where: { email: u.email }, update: { name: u.name, role: u.role, department: u.department, password: hashPassword(PASSWORD) }, create: { ...u, password: hashPassword(PASSWORD) } });
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
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
