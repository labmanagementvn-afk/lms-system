import type { NextConfig } from 'next';

// For single-host demos the web server forwards API paths to the NestJS process, so the
// browser talks to one origin (build with NEXT_PUBLIC_API_URL=/api/v1 and API_PROXY_TARGET).
const apiProxyTarget = process.env.API_PROXY_TARGET;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (!apiProxyTarget) return [];
    return ['/api/:path*', '/iclock/:path*', '/healthz'].map((source) => ({
      source,
      destination: `${apiProxyTarget}${source}`,
    }));
  },
};

export default nextConfig;
