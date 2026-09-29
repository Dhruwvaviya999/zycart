import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The repository documents itself in README.md and docs/; skip the generated
  // AGENTS.md / CLAUDE.md files.
  agentRules: false,

  images: {
    // Mock catalogue imagery. Phase 3 replaces this with the Cloudinary host.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Phase 18: product images uploaded through the console — Cloudinary in
      // production, the API's own /api/uploads on a development machine.
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'http', hostname: 'localhost', pathname: '/api/uploads/**' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
