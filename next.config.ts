import type { NextConfig } from 'next';

const config: NextConfig = {
  // The Agent SDK starts a bundled binary; it must load from node_modules, not a bundle.
  serverExternalPackages: ['@anthropic-ai/claude-agent-sdk', 'unpdf', 'sharp'],
  experimental: {
    // Sign-in runs on every request and holds a copy of each upload; the default 10 MB
    // would silently cut off larger fonts, guidelines and brand-folder batches.
    proxyClientMaxBodySize: '70mb',
  },
};

export default config;
