# Nexo Assist

Agent de atendimento do service desk de TI da Nexo: o funcionário descreve o problema no chat, e o agent consulta chamados, busca na central de ajuda, abre/atualiza chamados (sempre com confirmação) e chama um analista quando precisa. O analista atende pelo console, com o agent pausado.

## Como rodar

```bash
npm install
cp .env.example .env      # preencha OPENAI_API_KEY e SESSION_SECRET (openssl rand -hex 32)
npm run db:reset          # cria o SQLite e carrega os dados de exemplo
npm run dev               # http://localhost:3000
npm test                  # testes (usam um SQLite separado, test.db)
npm run typecheck
```

Usuários de exemplo. **O login aceita qualquer senha** (o PRD pede isso para os funcionários do seed; a identidade é o e-mail corporativo). As senhas ficam guardadas como hash (`nexo123`), prontas para virar autenticação real trocando uma linha em `app/api/auth/login/route.ts`:
`ana.souza@nexo.com.br` (3 abertos, 1 vencido, 1 resolvido há 4 dias que ainda pode ser reaberto) · `rafael.lima@nexo.com.br` e `marina.alves@nexo.com.br` (analistas). O seed também cria 7 conversas para o console abrir populado (3 transferidas, 2 com o agent, 2 resolvidas pelo agent).

## Arquitetura

```
app/            interface (Next.js) e rotas HTTP finas: autenticam, validam e chamam serviços
components/     DecisionSteps (transparência), cards, rascunho, opções rápidas
agent/          Mastra: instructions.ts (política), tools.ts (schemas), actions.ts (regras + registro das decisões)
services/       tickets, central de ajuda, conversas/transferência, rascunhos, sistema legado (retry)
lib/            sessão assinada, senha (scrypt), SLA, prioridade, tipos compartilhados
prisma/         schema SQLite + seed
```

Decisões principais:
- **O modelo decide a ação; o código garante a regra.** Prioridade (impacto × urgência), prazos em horas/dias úteis, duplicidade, janela de 7 dias para reabrir, limite de mensagens e "só cria depois de confirmar" ficam em código testado, não no prompt.
- **A identidade vem da sessão.** O cookie é `id.hmac` e só aponta para uma sessão no banco. Nenhuma rota nem ferramenta aceita `userId` do cliente ou do modelo; `/api/conversations`, `/api/analyst` exigem papel ANALYST.
- **Confirmação no servidor.** `proposeDraft` grava um rascunho; o chamado só nasce em `POST /api/chat/draft` (botão Confirmar), com os dados do rascunho gravado, nunca do cliente.
- **Persistência:** SQLite/Prisma guarda usuários, sessões, conversas, mensagens (com os passos de decisão), rascunhos e chamados. O estado "com o agent / aguardando / com analista" sobrevive a reinício.
- **Sistema legado instável:** chamadas passam por `legacy()` (retry com backoff, falha simulada via `TICKETS_FAILURE_RATE`). Se continuar fora, o passo aparece como falha e o agent oferece tentar de novo ou chamar um analista; confirmar um rascunho com o legado fora mantém o rascunho.

## Como o agent decide o que fazer

A cada mensagem, o Mastra roda um loop com 7 ferramentas: `searchHelpCenter`, `listMyTickets`, `getTicket`, `askUser`, `proposeDraft`, `escalateToAnalyst`, `redirectOutOfScope`. A política (instructions.ts) é: dúvida → central de ajuda; consulta → listar/selecionar/consultar e oferecer analista se vencido; problema novo → conferir chamados abertos antes (atualizar ou reabrir em vez de duplicar), perguntar uma coisa por vez, montar rascunho; fora de TI → redirecionar; sem segurança (< 0.5) → analista.

**Transparência.** Toda ferramenta exige `understood`, `confidence` e `reason`. Cada ação vira um `DecisionStep` (o que entendeu, o que fez, confiança, por quê, dados, tempo), mostrado como chips acima da resposta e, em "Ver decisões", em detalhe. Fica gravado na mensagem, então o analista vê o mesmo no console. A confiança é a informada pelo modelo (autoavaliação, não probabilidade calibrada); abaixo de 0.5 o código recusa montar rascunho e manda escalar.

## Como garanti a qualidade das decisões

Testes sobre o código real (`npm test`, 48 casos): SLA em horas/dias úteis e vencimento, matriz de prioridade ("meu computador parou" não é crítico), duplicidade/atualização/reabertura, rascunho só vira chamado ao confirmar, rascunho de outro usuário, chamado alheio inacessível, crítico transfere sozinho, pausa e papéis do analista, cookie adulterado, retry do legado. O que **não** está coberto: a qualidade das respostas do modelo em si. Faltam evals com conversas gravadas (ver "Com mais tempo").

## Modelo

`openai/gpt-4.1-mini` por padrão (`MODEL` no .env): bom em tool calling, baixa latência e custo baixo por conversa. Custo controlado com `maxSteps: 6`, saída limitada, só as últimas 10 mensagens no contexto, instruções enxutas, prioridade/SLA em código (sem tokens) e limite de 30 mensagens por sessão e 1000 caracteres por mensagem. Para trocar, ex.: `MODEL=anthropic/claude-haiku-4-5` + `ANTHROPIC_API_KEY`.

## Telas e protótipo

Seguem o `nexo.pen`: login em dois painéis, chat (rascunho com Confirmar/Editar/Cancelar e atalho ⌘↵, opções rápidas dentro do balão, lista selecionável de chamados, card de chamado com prazo vencido), Meu perfil e console em três colunas (lista com filtros, conversa, painel "Chamados do funcionário"). Simulados neste protótipo: "Redefinir senha" (não envia e-mail), "Esqueci minha senha" (mostra o ramal 4000) e o indicador "online" do console (considera atividade nos últimos 15 minutos).

## Trade-offs

- Busca da central de ajuda por palavras-chave: suficiente para ~10 artigos; com mais artigos, embeddings.
- SQLite: simples e persistente, mas serve a uma instância; em produção, Postgres (troca de `provider` no schema).
- Uma conversa contínua por funcionário (permite voltar outro dia). Polling a cada 4–5 s no lugar de WebSocket para o analista/funcionário.
- Horário útil usa o fuso do servidor e não considera feriados.
- O login limita tentativas em memória (por instância).

## Com mais tempo

Evals automáticos do agent (conversas-modelo com ação esperada), tracing, WebSocket/SSE para o console, feriados no SLA, Postgres, rate limit distribuído, testes de interface.

## Deploy (diferencial)

Plataforma com disco persistente ou Postgres (Railway/Fly.io). Defina `SESSION_SECRET`, a chave do provedor, `MAX_MESSAGES_PER_SESSION` e `DATABASE_URL`; o cookie já usa `secure` em produção. Limite o gasto no painel do provedor do modelo.
