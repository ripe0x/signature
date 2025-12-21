import { http, createConfig } from "wagmi";
import { mainnet } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "e6bcaffe33373d6ffb1b01d666bf35fd";
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;

export const config = createConfig({
  chains: [mainnet],
  connectors: [injected(), walletConnect({ projectId })],
  transports: {
    [mainnet.id]: http(rpcUrl),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
