import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/app",
  webpack: (config) => {
    // thirdweb → @base-org/account → @coinbase/cdp-sdk declares optional
    // @x402/* payment deps that are not published for bundlers; WTR never
    // touches that code path, so resolve them to false instead of failing
    // the build.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/evm/upto/client": false,
      "@x402/evm/exact/client": false,
      "@x402/evm": false,
      "@x402/svm/exact/client": false,
      "@x402/core/client": false,
    };
    return config;
  },
};

export default nextConfig;
