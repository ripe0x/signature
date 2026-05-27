import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mainnet } from "wagmi/chains";
import { fallback, http } from "wagmi";
import { getMainnetRpcUrls } from "./rpc";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "e6bcaffe33373d6ffb1b01d666bf35fd";

// Paid Alchemy first (when set), then public fallbacks. viem rotates to the
// next transport on any failure (timeout, rate-limit, 5xx), so the site keeps
// working if the primary RPC is unavailable.
const mainnetTransport = fallback(
  getMainnetRpcUrls().map((url) =>
    http(url, {
      timeout: 10_000,
      retryCount: 1,
    })
  )
);

export const config = getDefaultConfig({
  appName: "LESS",
  projectId,
  chains: [mainnet],
  transports: {
    [mainnet.id]: mainnetTransport,
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
