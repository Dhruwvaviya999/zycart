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

  /**
   * The account pages Clerk replaced. Emails sent before the move still link
   * here, so each lands somewhere useful: password help is inside Clerk's
   * sign-in ("Forgot password?"), and Clerk verifies addresses itself.
   */
  async redirects() {
    return [
      { source: '/forgot-password', destination: '/login', permanent: false },
      { source: '/reset-password', destination: '/login', permanent: false },
      { source: '/verify-email', destination: '/account', permanent: false },
    ];
  },
};

export default nextConfig;
