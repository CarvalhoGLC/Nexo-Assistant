import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    fileParallelism: false, // os testes de integração compartilham o mesmo SQLite de teste
    env: { DATABASE_URL: 'file:./test.db', SESSION_SECRET: 'segredo-de-teste-com-mais-de-16-chars', TICKETS_FAILURE_RATE: '0' },
  },
});
