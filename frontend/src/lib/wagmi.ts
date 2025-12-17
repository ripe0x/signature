import { http, createConfig } from "wagmi";
import { mainnet } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

// TODO: Replace with actual WalletConnect project ID
const projectId = "e6bcaffe33373d6ffb1b01d666bf35fd";

export const config = createConfig({
  chains: [mainnet],
  connectors: [injected(), walletConnect({ projectId })],
  transports: {
    [mainnet.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
