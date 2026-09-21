import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The repository documents itself in README.md and docs/; skip the generated
  // AGENTS.md / CLAUDE.md files.
  agentRules: false,

  images: {
    // Mock catalogue imagery. Phase 3 replaces this with the Cloudinary host.
    unoptimized: true,
    remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }],
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
