import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The repository documents itself in README.md and docs/; skip the generated
  // AGENTS.md / CLAUDE.md files.
  agentRules: false,
};

export default nextConfig;
