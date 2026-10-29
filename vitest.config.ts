import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Os testes de integração usam um Postgres DEDICADO (o nome do banco precisa conter "test": a suíte recria o schema do zero).
// Local: createdb nexo_test  (ou um Postgres do Docker). Pode apontar outro com TEST_DATABASE_URL.
const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/nexo_test';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    fileParallelism: false, // os testes de integração compartilham o mesmo banco de teste
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: { DATABASE_URL: TEST_DB, SESSION_SECRET: 'segredo-de-teste-com-mais-de-16-chars', TICKETS_FAILURE_RATE: '0' },
  },
});
