import { http, createConfig } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
import { CHAIN_ID } from "./contracts";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "e6bcaffe33373d6ffb1b01d666bf35fd";
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
const sepoliaRpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;

const useTestnet = CHAIN_ID === 11155111;

export const config = useTestnet
  ? createConfig({
      chains: [sepolia],
      connectors: [injected(), walletConnect({ projectId })],
      transports: {
        [sepolia.id]: http(sepoliaRpcUrl || "https://eth-sepolia.g.alchemy.com/v2/demo"),
      },
    })
  : createConfig({
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
