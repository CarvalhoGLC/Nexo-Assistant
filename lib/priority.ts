import type { Affected, Priority, TicketType } from './types';

export type PriorityFactors = {
  type: TicketType;
  affected: Affected;
  blocksWork: boolean; // impede a pessoa de trabalhar
  sameDayCommitment: boolean; // há compromisso em risco hoje
  hasWorkaround: boolean; // existe alternativa
};

/** Anexo A: prioridade = impacto (quantos são afetados) × urgência (compromisso em risco).
 *  É regra em código: o modelo informa os fatos, não escolhe a prioridade. */
export function classifyPriority(f: PriorityFactors): { priority: Priority; reason: string } {
  if (f.affected !== 'Só eu' && f.blocksWork)
    return { priority: 'CRITICAL', reason: `Algo parado para ${f.affected === 'Toda a empresa' ? 'a empresa' : 'uma equipe'} → Crítica (1 hora).` };
  if (f.sameDayCommitment)
    return { priority: 'HIGH', reason: 'Há compromisso no mesmo dia em risco → Alta (4 horas úteis).' };
  if (f.blocksWork && !f.hasWorkaround)
    return { priority: 'HIGH', reason: 'Impede uma pessoa de trabalhar e não há alternativa → Alta (4 horas úteis).' };
  if (f.type === 'REQ' && !f.blocksWork)
    return { priority: 'LOW', reason: 'Pedido sem urgência → Baixa (5 dias úteis).' };
  return { priority: 'MEDIUM', reason: 'Atrapalha, mas há alternativa → Média (3 dias úteis).' };
}
