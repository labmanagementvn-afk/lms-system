import type { NextConfig } from 'next';

// For single-host demos the web server forwards API paths to the NestJS process, so the
// browser talks to one origin (build with NEXT_PUBLIC_API_URL=/api/v1 and API_PROXY_TARGET).
const apiProxyTarget = process.env.API_PROXY_TARGET;
// Small build machines (the Docker image on Render): skip type checking, which CI already does,
// and build with one worker to keep memory down.
const lowMemoryBuild = process.env.LOW_MEMORY_BUILD === '1';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: lowMemoryBuild },
  eslint: { ignoreDuringBuilds: lowMemoryBuild },
  experimental: lowMemoryBuild ? { cpus: 1, webpackMemoryOptimizations: true } : {},
  async rewrites() {
    if (!apiProxyTarget) return [];
    return ['/api/:path*', '/iclock/:path*', '/healthz'].map((source) => ({
      source,
      destination: `${apiProxyTarget}${source}`,
    }));
  },
};

export default nextConfig;
