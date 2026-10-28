import { execSync } from 'node:child_process';

/** Cria um SQLite limpo (test.db) com o schema atual antes da suíte. */
export default function setup() {
  execSync('npx prisma db push --force-reset --skip-generate', { env: { ...process.env, DATABASE_URL: 'file:./test.db' }, stdio: 'ignore' });
}
