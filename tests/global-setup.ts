import { execSync } from 'node:child_process';

/** Recria o schema no banco de teste. Recusa rodar se a URL não for claramente de um banco de teste (db push --force-reset apaga tudo). */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/nexo_test';
  const dbName = new URL(url).pathname.replace('/', '');
  if (!/test/i.test(dbName))
    throw new Error(`TEST_DATABASE_URL aponta para "${dbName}". Por segurança, o banco de teste precisa ter "test" no nome.`);
  execSync('npx prisma db push --force-reset --skip-generate', { env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit' });
}
