import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mainnet } from "wagmi/chains";
import { http } from "wagmi";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "e6bcaffe33373d6ffb1b01d666bf35fd";
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;

export const config = getDefaultConfig({
  appName: "LESS",
  projectId,
  chains: [mainnet],
  transports: {
    [mainnet.id]: http(rpcUrl),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
