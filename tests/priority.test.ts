import { describe, expect, it } from 'vitest';
import { classifyPriority } from '@/lib/priority';

const base = { type: 'INC', affected: 'Só eu', blocksWork: false, sameDayCommitment: false, hasWorkaround: true } as const;

describe('prioridade = impacto × urgência', () => {
  it('equipe parada → Crítica', () => expect(classifyPriority({ ...base, affected: 'Minha equipe', blocksWork: true, hasWorkaround: false }).priority).toBe('CRITICAL'));
  it('empresa parada → Crítica', () => expect(classifyPriority({ ...base, affected: 'Toda a empresa', blocksWork: true }).priority).toBe('CRITICAL'));
  it('uma pessoa parada NÃO é crítica ("meu computador parou")', () => expect(classifyPriority({ ...base, blocksWork: true, hasWorkaround: false }).priority).toBe('HIGH'));
  it('reunião no mesmo dia → Alta, mesmo com alternativa', () => expect(classifyPriority({ ...base, sameDayCommitment: true }).priority).toBe('HIGH'));
  it('atrapalha mas há alternativa → Média', () => expect(classifyPriority(base).priority).toBe('MEDIUM'));
  it('pedido sem urgência → Baixa', () => expect(classifyPriority({ ...base, type: 'REQ' }).priority).toBe('LOW'));
  it('pedido com compromisso no dia → Alta', () => expect(classifyPriority({ ...base, type: 'REQ', sameDayCommitment: true }).priority).toBe('HIGH'));
});
