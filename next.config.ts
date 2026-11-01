import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // maplibre ships modern ESM; let Next transpile it for older browsers
  transpilePackages: ['maplibre-gl'],
};

export default nextConfig;
