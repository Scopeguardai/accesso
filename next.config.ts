import type { NextConfig } from 'next';

const config: NextConfig = {
  // The Agent SDK starts a bundled binary; it must load from node_modules, not a bundle.
  serverExternalPackages: ['@anthropic-ai/claude-agent-sdk'],
};

export default config;
