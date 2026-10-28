import { describe, expect, it } from 'vitest';
import { addBusinessDays, addBusinessHours, canReopen, dueAt, isOverdue } from '@/lib/sla';

// Datas locais (sem "Z") para o teste não depender do fuso do servidor.
const d = (s: string) => new Date(s);

describe('prazos (Anexo A)', () => {
  it('Crítica: 1 hora corrida (plantão 24h), mesmo fora do expediente', () => {
    expect(dueAt('CRITICAL', d('2026-10-24T23:30:00')).getTime()).toBe(d('2026-10-25T00:30:00').getTime());
  });
  it('Alta: 4 horas úteis dentro do expediente', () => {
    expect(dueAt('HIGH', d('2026-10-27T09:43:00')).getTime()).toBe(d('2026-10-27T13:43:00').getTime());
  });
  it('Alta: atravessa o fim do expediente e o fim de semana', () => {
    // sexta 16h → 2h na sexta + 2h na segunda 8h = segunda 10h
    expect(addBusinessHours(d('2026-10-23T16:00:00'), 4).getTime()).toBe(d('2026-10-26T10:00:00').getTime());
  });
  it('Alta: pedido fora do expediente começa na próxima abertura', () => {
    expect(addBusinessHours(d('2026-10-27T20:00:00'), 4).getTime()).toBe(d('2026-10-28T12:00:00').getTime());
  });
  it('Média: 3 dias úteis pulando fim de semana', () => {
    expect(addBusinessDays(d('2026-10-23T10:00:00'), 3).getTime()).toBe(d('2026-10-28T10:00:00').getTime());
  });
  it('Baixa: 5 dias úteis', () => {
    expect(dueAt('LOW', d('2026-10-26T10:00:00')).getTime()).toBe(d('2026-11-02T10:00:00').getTime());
  });
});

describe('vencimento e reabertura', () => {
  const at = d('2026-10-27T10:00:00');
  it('chamado médio sem atualização há 6 dias está vencido', () => {
    expect(isOverdue({ status: 'ANALYST', priority: 'MEDIUM', lastUpdate: d('2026-10-21T10:00:00') }, at)).toBe(true);
  });
  it('chamado médio atualizado ontem não está vencido', () => {
    expect(isOverdue({ status: 'IN_PROGRESS', priority: 'MEDIUM', lastUpdate: d('2026-10-26T10:00:00') }, at)).toBe(false);
  });
  it('chamado resolvido nunca está vencido', () => {
    expect(isOverdue({ status: 'RESOLVED', priority: 'CRITICAL', lastUpdate: d('2026-01-01T10:00:00') }, at)).toBe(false);
  });
  it('reabre resolvido há 4 dias, mas não há 12 dias nem chamado aberto', () => {
    expect(canReopen({ status: 'RESOLVED', resolvedAt: d('2026-10-23T10:00:00') }, at)).toBe(true);
    expect(canReopen({ status: 'RESOLVED', resolvedAt: d('2026-10-15T10:00:00') }, at)).toBe(false);
    expect(canReopen({ status: 'OPEN', resolvedAt: null }, at)).toBe(false);
  });
});
