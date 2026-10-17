import { config } from "./config.js";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_SIGNATURE_PAGES = 3;

async function rpc(method, params) {
  const res = await fetch(config.solanaRpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} failed (HTTP ${res.status})`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  return json.result;
}

function pctOf(amount, supply) {
  if (!supply || supply === 0n) return 0;
  return Number((BigInt(amount) * 10000n) / supply) / 100;
}

async function getMint(ca) {
  const r = await rpc("getAccountInfo", [ca, { encoding: "jsonParsed" }]);
  const parsed = r?.value?.data?.parsed;
  if (parsed?.type !== "mint") return null;
  return parsed.info;
}

async function getHolders(ca, supply) {
  const largest = await rpc("getTokenLargestAccounts", [ca]);
  const accounts = (largest?.value || []).slice(0, 20);
  if (accounts.length === 0) return [];

  const tokenAccts = await rpc("getMultipleAccounts", [accounts.map((a) => a.address), { encoding: "jsonParsed" }]);
  const owners = tokenAccts.value.map((v) => v?.data?.parsed?.info?.owner || null);

  const uniqueOwners = [...new Set(owners.filter(Boolean))];
  const ownerAccts = uniqueOwners.length
    ? await rpc("getMultipleAccounts", [uniqueOwners, { encoding: "jsonParsed" }])
    : { value: [] };

  // Keep classification three-valued: wallet, program-owned account, or unknown.
  // A missing account response is not enough evidence to call a holder a contract.
  const isWallet = new Map(
    uniqueOwners.map((owner, i) => {
      const account = ownerAccts.value?.[i];
      if (!account) return [owner, null];
      return [owner, account.owner === SYSTEM_PROGRAM];
    })
  );

  const byOwner = new Map();
  accounts.forEach((a, i) => {
    const owner = owners[i] || a.address;
    byOwner.set(owner, (byOwner.get(owner) || 0n) + BigInt(a.amount));
  });

  return [...byOwner.entries()]
    .map(([address, amt]) => {
      const walletStatus = isWallet.get(address);
      return {
        address,
        pct: pctOf(amt, supply),
        // null means classification could not be established from available RPC data.
        isContract: walletStatus === null || walletStatus === undefined
          ? null
          : !walletStatus,
      };
    })
    .sort((a, b) => b.pct - a.pct);
}

async function getMarket(ca) {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(ca)}`
    );

    if (!res.ok) return null;

    const json = await res.json();
    const requestedMint = ca.trim();

    const pairs = (Array.isArray(json.pairs) ? json.pairs : [])
      .filter((pair) => {
        if (pair.chainId !== "solana") return false;

        const baseAddress = pair.baseToken?.address;
        const quoteAddress = pair.quoteToken?.address;

        // Only trust pairs that explicitly identify the requested mint.
        return baseAddress === requestedMint ||
          quoteAddress === requestedMint;
      })
      .sort((a, b) =>
        (Number(b.liquidity?.usd) || 0) -
        (Number(a.liquidity?.usd) || 0)
      );

    const best = pairs[0];
    if (!best) return null;

    const isBaseToken = best.baseToken?.address === requestedMint;
    const token = isBaseToken ? best.baseToken : best.quoteToken;

    return {
      name: token?.name || "Unknown",
      symbol: token?.symbol || "???",
      liquidityUsd: Number.isFinite(Number(best.liquidity?.usd))
        ? Number(best.liquidity.usd)
        : null,
      ageDays: Number.isFinite(Number(best.pairCreatedAt)) &&
          Number(best.pairCreatedAt) > 0
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - Number(best.pairCreatedAt)) / 86_400_000
            )
          )
        : null,
    };
  } catch {
    return null;
  }
}

async function findCreator(ca) {
  let before;

  for (let page = 0; page < MAX_SIGNATURE_PAGES; page++) {
    const sigs = await rpc("getSignaturesForAddress", [
      ca,
      { limit: 1000, ...(before ? { before } : {}) },
    ]);

    if (!Array.isArray(sigs) || sigs.length === 0) {
      return { creator: null, ageDays: null, creatorVerified: false };
    }

    const oldest = sigs[sigs.length - 1];

    // Only use age when the oldest observed transaction is also confirmed
    // to contain initialization of this exact mint.
    if (sigs.length < 1000) {
      let ageDays = null;

      try {
        const tx = await rpc("getTransaction", [
          oldest.signature,
          {
            encoding: "jsonParsed",
            maxSupportedTransactionVersion: 0,
          },
        ]);

        const instructions =
          tx?.transaction?.message?.instructions || [];

        const initializedMint = instructions.some((ix) => {
          const type = ix?.parsed?.type;
          const info = ix?.parsed?.info;

          return (
            (ix?.program === "spl-token" ||
              ix?.program === "spl-token-2022") &&
            (type === "initializeMint" ||
              type === "initializeMint2") &&
            info?.mint === ca
          );
        });

        if (initializedMint && oldest.blockTime) {
          ageDays = Math.max(
            0,
            Math.floor(
              (Date.now() / 1000 - oldest.blockTime) / 86400
            )
          );
        }
      } catch {
        // Unavailable or unparseable transaction data is not proof.
      }

      // The mint authority and the original creator are not necessarily
      // the same person. Do not infer a creator from the fee payer.
      return {
        creator: null,
        ageDays,
        creatorVerified: false,
      };
    }

    before = oldest.signature;
  }

  // The search limit was reached before the oldest transaction was found.
  return { creator: null, ageDays: null, creatorVerified: false };
}

async function getDevHolding(creator, ca, supply) {
  const r = await rpc("getTokenAccountsByOwner", [creator, { mint: ca }, { encoding: "jsonParsed" }]);
  const total = (r?.value || []).reduce((sum, a) => sum + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
  return pctOf(total, supply);
}

export const solanaProvider = {
  async getTokenData(contractAddress) {
    if (!BASE58.test(contractAddress)) return null;

    const mint = await getMint(contractAddress);
    if (!mint) return null;
    const supply = BigInt(mint.supply);

    const [holdersR, marketR, creatorR] = await Promise.allSettled([
      getHolders(contractAddress, supply),
      getMarket(contractAddress),
      findCreator(contractAddress),
    ]);
    const holders = holdersR.status === "fulfilled" ? holdersR.value : [];
    const market = marketR.status === "fulfilled" ? marketR.value : null;
    const created = creatorR.status === "fulfilled" ? creatorR.value : null;

    let dev = null;
    if (created) {
      let holdingPct = null;

      // Only query holdings when an address has actually been verified.
      if (created.creator) {
        try {
          holdingPct = await getDevHolding(
            created.creator,
            contractAddress,
            supply
          );
        } catch {
          // Keep unknown rather than inventing a holding value.
        }
      }

      dev = {
        address: created.creator,
        holdingPct,
        creatorVerified: created.creatorVerified === true,
        ageDays: created.ageDays,
        soldPct: null,
        prevTokensCreated: null,
        prevTokensRugged: null,
        fundedByFreshWallet: null,
      };
    }

    const whales = holders
      .filter((h) => !h.isContract && h.pct >= 2 && h.address !== dev?.address)
      .map((h) => ({ address: h.address, pct: h.pct, recentAction: "unknown", changePct24h: null }));

    return {
      name: market?.name || "Unknown", symbol: market?.symbol || "???", chain: "solana",
      ageDays: market?.ageDays ?? created?.ageDays ?? null,
      liquidityUsd: market?.liquidityUsd ?? null,
      liquidityLockedPct: null,
      mintRenounced: mint.mintAuthority === null,
      freezeAuthorityActive: mint.freezeAuthority !== null,
      honeypot: null,
      dev,
      holders,
      holdersDataAvailable: holdersR.status === "fulfilled",
      whales,
    };
  },
};
