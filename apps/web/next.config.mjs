/** @type {import('next').NextConfig} */
const nextConfig = {
  // As regras do produto (preços, desconto real, planos) vêm do pacote compartilhado.
  transpilePackages: ['@keropromo/core'],
  poweredByHeader: false,
};
export default nextConfig;
