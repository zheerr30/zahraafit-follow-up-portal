if (process.platform === "darwin" && !process.env.CI && !process.env.VERCEL) {
  process.env.NEXT_TEST_WASM ||= "1";
  process.env.NEXT_TEST_WASM_DIR ||= `${process.cwd()}/node_modules/@next/swc-wasm-nodejs`;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true
};

export default nextConfig;
