if (process.platform === "darwin" && !process.env.CI && !process.env.VERCEL) {
  process.env.NEXT_TEST_WASM ||= "1";
  process.env.NEXT_TEST_WASM_DIR ||= `${process.cwd()}/node_modules/@next/swc-wasm-nodejs`;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ship the generator files with the route that serves them.
  outputFileTracingIncludes: { "/api/generators/[name]": ["./generators/**"], "/api/generators/asset/[hash]": ["./generators/**"], "/api/foods": ["./generators/**"] },
  async redirects() {
    // Old portal addresses go to the new screens.
    return [
      { source: "/admin", destination: "/coach", permanent: false },
      { source: "/admin/:path*", destination: "/coach", permanent: false },
      { source: "/client/intake", destination: "/app/intake", permanent: false },
      { source: "/client/:path*", destination: "/app", permanent: false },
      { source: "/debug", destination: "/", permanent: false }
    ];
  }
};

export default nextConfig;
