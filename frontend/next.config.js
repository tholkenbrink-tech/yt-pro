/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cloudflare Pages' Next.js framework preset runs a plain `next build` and
  // serves the resulting output directly (SSR + static via the CF adapter),
  // so no next-on-pages transform or `output: 'export'` is required here.
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
