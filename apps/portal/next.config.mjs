/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The portal is a pure client-side Firebase app: no server secrets, no
  // firebase-admin. Keeping images unoptimised avoids needing a server runtime
  // for the Storage photos we render in the review screens.
  images: { unoptimized: true },
};

export default nextConfig;
