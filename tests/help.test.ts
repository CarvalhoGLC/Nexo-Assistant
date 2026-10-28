import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { searchHelp } from '@/services/help-service';
import { similarity } from '@/services/ticket-service';
import { resetDb } from './helpers';

beforeEach(async () => {
  await resetDb();
  await db.helpArticle.createMany({ data: [
    { id: 'vpn', title: 'VPN com erro 809', content: 'Reinstale o cliente. Vale apenas para Windows 10; no Windows 11, abra um chamado.', category: 'Rede e VPN' },
    { id: 'hor', title: 'Horário do service desk', content: 'Segunda a sexta, das 8h às 18h.', category: 'Outros' },
  ] });
});

describe('central de ajuda', () => {
  it('encontra o artigo da VPN pelo número do erro (termo curto)', async () => expect((await searchHelp('erro 809 na vpn'))[0]?.id).toBe('vpn'));
  it('ignora acentos', async () => expect((await searchHelp('qual o horario de atendimento do service desk'))[0]?.id).toBe('hor'));
  it('não devolve nada para assunto sem artigo', async () => expect(await searchHelp('plano de saúde das férias')).toHaveLength(0));
});

describe('similaridade (duplicidade)', () => {
  it('textos do mesmo problema são parecidos; de problemas diferentes, não', () => {
    expect(similarity('VPN não conecta erro 809', 'VPN com erro 809 no notebook')).toBeGreaterThan(0.25);
    expect(similarity('VPN não conecta erro 809', 'Preciso de um segundo monitor')).toBeLessThan(0.1);
  });
});
