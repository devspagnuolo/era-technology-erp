/** @type {import('next').NextConfig} */
const config = {
  async rewrites() {
    const upstream = process.env.API_INTERNAL_HOSTPORT;
    if (!upstream) return [];
    if (!/^[a-zA-Z0-9.-]+:[0-9]+$/.test(upstream))
      throw new Error("API_INTERNAL_HOSTPORT inválido");
    return [
      {
        source: "/v1/:path*",
        destination: "http://" + upstream + "/v1/:path*",
      },
    ];
  },
};
export default config;
