import { config } from "./config.js";
import { solanaProvider } from "./solanaProvider.js";

const MOCK_DATA = {
  "SAFEc0ntractAddre55111111111111111111111111": {
    name: "SafeCoin", symbol: "SAFE", chain: "demo",
    ageDays: 900, liquidityUsd: 12_000_000, liquidityLockedPct: 95,
    mintRenounced: true, honeypot: false,
    dev: { address: "DevWa11etSafe1111111", holdingPct: 1.5, soldPct: 10,
           prevTokensCreated: 2, prevTokensRugged: 0, fundedByFreshWallet: false },
    holders: [
      { address: "Holder1", pct: 6.1, isContract: false },
      { address: "Holder2", pct: 4.8, isContract: false },
      { address: "Holder3", pct: 3.9, isContract: false },
      { address: "Holder4", pct: 3.2, isContract: false },
      { address: "Holder5", pct: 2.7, isContract: false },
    ],
    whales: [
      { address: "Whale1", pct: 2.1, recentAction: "holding", changePct24h: 0 },
    ],
  },

  "RUGXc0ntractAddre55222222222222222222222222": {
    name: "RugX", symbol: "RUGX", chain: "demo",
    ageDays: 2, liquidityUsd: 14_000, liquidityLockedPct: 0,
    mintRenounced: false, honeypot: true,
    dev: { address: "DevWa11etRug2222222", holdingPct: 22, soldPct: 35,
           prevTokensCreated: 9, prevTokensRugged: 6, fundedByFreshWallet: true },
    holders: [
      { address: "Holder1", pct: 31, isContract: false },
      { address: "Holder2", pct: 14, isContract: false },
      { address: "Holder3", pct: 9, isContract: false },
      { address: "Holder4", pct: 7, isContract: false },
      { address: "Holder5", pct: 5, isContract: false },
    ],
    whales: [
      { address: "Whale1", pct: 12, recentAction: "selling", changePct24h: -40 },
      { address: "Whale2", pct: 8, recentAction: "selling", changePct24h: -25 },
    ],
  },

  "MIDCc0ntractAddre55333333333333333333333333": {
    name: "MidCap", symbol: "MIDC", chain: "demo",
    ageDays: 40, liquidityUsd: 400_000, liquidityLockedPct: 60,
    mintRenounced: true, honeypot: false,
    dev: { address: "DevWa11etMid3333333", holdingPct: 6, soldPct: 20,
           prevTokensCreated: 3, prevTokensRugged: 1, fundedByFreshWallet: false },
    holders: [
      { address: "Holder1", pct: 14, isContract: false },
      { address: "Holder2", pct: 9, isContract: false },
      { address: "Holder3", pct: 7, isContract: false },
      { address: "Holder4", pct: 5, isContract: false },
      { address: "Holder5", pct: 4, isContract: false },
    ],
    whales: [
      { address: "Whale1", pct: 7, recentAction: "buying", changePct24h: 15 },
    ],
  },
};

export const mockProvider = {
  async getTokenData(contractAddress) {
    return MOCK_DATA[contractAddress] || null;
  },
};

export function getProvider() {
  return config.dataSource === "solana" ? solanaProvider : mockProvider;
}

export const DEMO_ADDRESSES = {
  safe: "SAFEc0ntractAddre55111111111111111111111111",
  rug: "RUGXc0ntractAddre55222222222222222222222222",
  mid: "MIDCc0ntractAddre55333333333333333333333333",
};
