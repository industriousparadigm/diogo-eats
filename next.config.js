/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["sharp"],
  // Allow the laptop's wifi IP so iPhone HMR + dev requests aren't blocked
  // as cross-origin when hitting the dev server over the local network.
  // Add whatever local-network IPs the laptop hops between (hotspot, home wifi, etc.).
  // These are LAN-only addresses, safe to allow in dev.
  allowedDevOrigins: ["172.20.10.14", "192.168.1.116", "192.168.1.0/24"],
};

module.exports = nextConfig;
