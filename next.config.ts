import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // O Mastra usa dependências nativas/dinâmicas: não deve ser empacotado pelo bundler.
  serverExternalPackages: ['@mastra/core', '@prisma/client'],
};
export default nextConfig;
