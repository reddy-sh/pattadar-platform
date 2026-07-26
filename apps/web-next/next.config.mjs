/** Fresh config — kit's next.config.js is webpack-era and must not be copied. */
const nextConfig = {
  output: 'standalone',
  // Workspace source packages shipped as raw TS.
  transpilePackages: ['@pattadar/tokens'],
  redirects: async () => [
    { source: '/app/properties', destination: '/app/parcels?tab=properties', permanent: false },
    { source: '/app/deeds', destination: '/app/documents', permanent: false },
    { source: '/app/sro', destination: '/app/tools?tab=sro', permanent: false },
    { source: '/app/stamp-duty', destination: '/app/tools?tab=stamp-duty', permanent: false },
    { source: '/app/market-value', destination: '/app/tools?tab=market-value', permanent: false },
    { source: '/app/calculator', destination: '/app/tools?tab=calculator', permanent: false },
  ],
};
export default nextConfig;
