// Trava de segurança do `npm run db:reset` (apaga TODAS as tabelas): só roda contra banco local.
import fs from 'node:fs';

let url = process.env.DATABASE_URL;
if (!url && fs.existsSync('.env')) {
  const m = fs.readFileSync('.env', 'utf8').match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
  url = m?.[1];
}
if (!url) { console.error('DATABASE_URL não definida (veja .env.example).'); process.exit(1); }

const host = new URL(url).hostname;
const local = ['localhost', '127.0.0.1', '::1', 'host.docker.internal', 'postgres', 'db'].includes(host);
if (!local && !process.argv.includes('--force')) {
  console.error(`Recusado: db:reset apagaria o banco em "${host}", que não parece local.\nPara produção use "npm run db:setup" (não apaga nada). Se for mesmo proposital: npm run db:reset -- --force`);
  process.exit(1);
}
