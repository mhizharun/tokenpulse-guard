import test from "node:test";
import assert from "node:assert/strict";
import { solanaProvider } from "../src/solanaProvider.js";
import { analyzeToken } from "../src/riskEngine.js";

const CA = "So11111111111111111111111111111111111111112";
const SYSTEM = "11111111111111111111111111111111";

let dexPairs = [];

function fakeFetch(url, opts) {
  const json = (v) => ({
    ok: true,
    status: 200,
    json: async () => v,
  });

  if (String(url).includes("dexscreener")) {
    return json({ pairs: dexPairs });
  }

  const { method, params } = JSON.parse(opts.body);

  const result = {
    getAccountInfo: {
      value: {
        data: {
          parsed: {
            type: "mint",
            info: {
              mintAuthority: null,
              freezeAuthority: null,
              supply: "1000000",
              decimals: 6,
            },
          },
        },
      },
    },

    getTokenLargestAccounts: {
      value: [
        { address: "TA1", amount: "300000" },
        { address: "TA2", amount: "100000" },
      ],
    },

    getMultipleAccounts: String(params[0][0]).startsWith("TA")
      ? {
          value: [
            {
              data: {
                parsed: {
                  info: { owner: "OwnerWallet" },
                },
              },
            },
            {
              data: {
                parsed: {
                  info: { owner: "PoolPda" },
                },
              },
            },
          ],
        }
      : {
          value: [
            { owner: SYSTEM },
            null,
          ],
        },

    getSignaturesForAddress: [
      {
        signature: "sig1",
        blockTime: Math.floor(Date.now() / 1000) - 5 * 86400,
      },
    ],

    getTransaction: {
      transaction: {
        message: {
          accountKeys: [{ pubkey: "CreatorWallet" }],
        },
      },
    },

    getTokenAccountsByOwner: {
      value: [
        {
          account: {
            data: {
              parsed: {
                info: {
                  tokenAmount: { amount: "50000" },
                },
              },
            },
          },
        },
      ],
    },
  }[method];

  return json({ result });
}

function makePair({
  baseAddress,
  quoteAddress,
  baseName = "Test",
  baseSymbol = "TST",
  quoteName = "Quote Token",
  quoteSymbol = "QTK",
  liquidity = 250000,
  ageDays = 3,
}) {
  return {
    chainId: "solana",
    liquidity: { usd: liquidity },
    pairCreatedAt: Date.now() - ageDays * 86400000,
    baseToken: {
      address: baseAddress,
      name: baseName,
      symbol: baseSymbol,
    },
    quoteToken: {
      address: quoteAddress,
      name: quoteName,
      symbol: quoteSymbol,
    },
  };
}

async function withFakeFetch(pairs, callback) {
  const realFetch = globalThis.fetch;
  const previousPairs = dexPairs;

  globalThis.fetch = fakeFetch;
  dexPairs = pairs;

  try {
    return await callback();
  } finally {
    globalThis.fetch = realFetch;
    dexPairs = previousPairs;
  }
}

test("solana provider maps RPC + DexScreener data to the shared shape", async () => {
  await withFakeFetch([
    makePair({
      baseAddress: CA,
      quoteAddress: "QuoteMint",
    }),
  ], async () => {
    const t = await solanaProvider.getTokenData(CA);

    assert.equal(t.mintRenounced, true);
    assert.equal(t.liquidityUsd, 250000);
    assert.equal(t.name, "Test");
    assert.equal(t.symbol, "TST");
    assert.equal(t.holders[0].address, "OwnerWallet");
    assert.equal(t.holders[0].pct, 30);
    assert.equal(t.holders[0].isContract, false);
    assert.equal(t.holders[1].isContract, null);
    assert.equal(t.dev.address, null);
    assert.equal(t.dev.holdingPct, null);
    assert.equal(t.dev.creatorVerified, false);

    const report = await analyzeToken(CA, solanaProvider);
    assert.ok(report.dataGaps.length > 0);
    assert.notEqual(report.confidence, "high");
  });
});

test("market analysis identifies the requested mint as the quote token", async () => {
  await withFakeFetch([
    makePair({
      baseAddress: "OtherMint",
      quoteAddress: CA,
      quoteName: "Requested Token",
      quoteSymbol: "REQ",
      liquidity: 180000,
    }),
  ], async () => {
    const token = await solanaProvider.getTokenData(CA);

    assert.equal(token.name, "Requested Token");
    assert.equal(token.symbol, "REQ");
    assert.equal(token.liquidityUsd, 180000);
  });
});

test("market analysis selects the matching pair with highest liquidity", async () => {
  await withFakeFetch([
    makePair({
      baseAddress: CA,
      quoteAddress: "QuoteA",
      baseName: "Requested Token",
      baseSymbol: "REQ",
      liquidity: 25000,
    }),
    makePair({
      baseAddress: CA,
      quoteAddress: "QuoteB",
      baseName: "Requested Token",
      baseSymbol: "REQ",
      liquidity: 250000,
    }),
    makePair({
      baseAddress: "UnrelatedMint",
      quoteAddress: "AnotherMint",
      baseName: "Unrelated",
      baseSymbol: "BAD",
      liquidity: 999999,
    }),
  ], async () => {
    const token = await solanaProvider.getTokenData(CA);

    assert.equal(token.name, "Requested Token");
    assert.equal(token.symbol, "REQ");
    assert.equal(token.liquidityUsd, 250000);
  });
});

test("market analysis does not use unrelated token pairs", async () => {
  await withFakeFetch([
    makePair({
      baseAddress: "UnrelatedMint",
      quoteAddress: "AnotherMint",
      baseName: "Wrong Token",
      baseSymbol: "BAD",
      liquidity: 999999,
    }),
  ], async () => {
    const token = await solanaProvider.getTokenData(CA);

    assert.equal(token.name, "Unknown");
    assert.equal(token.symbol, "???");
    assert.equal(token.liquidityUsd, null);
  });
});

test("invalid address returns null without network calls", async () => {
  const realFetch = globalThis.fetch;
  let called = false;

  globalThis.fetch = async () => {
    called = true;
    throw new Error("Network should not be called");
  };

  try {
    assert.equal(
      await solanaProvider.getTokenData("not-an-address"),
      null
    );
    assert.equal(called, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});


test("failed holder RPC is treated as critical missing data", async () => {
  const realFetch = globalThis.fetch;

  globalThis.fetch = async (url, opts) => {
    if (String(url).includes("dexscreener")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          pairs: [
            makePair({
              baseAddress: CA,
              quoteAddress: "QuoteMint",
            }),
          ],
        }),
      };
    }

    const { method } = JSON.parse(opts.body);

    if (method === "getTokenLargestAccounts") {
      return {
        ok: false,
        status: 503,
        json: async () => ({}),
      };
    }

    return fakeFetch(url, opts);
  };

  try {
    const report = await analyzeToken(CA, solanaProvider);

    assert.ok(
      report.criticalDataGaps.includes("Holder data request failed")
    );
    assert.equal(report.confidence, "low");
    assert.equal(report.assessmentStatus, "INSUFFICIENT_DATA");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("malformed RPC response is rejected", async () => {
  const realFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    if (String(url).includes("dexscreener")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ pairs: [] }),
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: "2.0", id: 1 }),
    };
  };

  try {
    await assert.rejects(
      solanaProvider.getTokenData(CA),
      /response is missing result/
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("RPC timeout aborts a stalled request", async () => {
  const realFetch = globalThis.fetch;
  const previousTimeout = process.env.SOLANA_RPC_TIMEOUT_MS;

  process.env.SOLANA_RPC_TIMEOUT_MS = "25";

  globalThis.fetch = async (_url, opts) => {
    return new Promise((resolve, reject) => {
      if (opts.signal.aborted) {
        reject(new Error("Request aborted"));
        return;
      }

      opts.signal.addEventListener(
        "abort",
        () => reject(new Error("Request aborted")),
        { once: true }
      );
    });
  };

  try {
    await assert.rejects(
      solanaProvider.getTokenData(CA),
      /timed out after 25ms/
    );
  } finally {
    globalThis.fetch = realFetch;

    if (previousTimeout === undefined) {
      delete process.env.SOLANA_RPC_TIMEOUT_MS;
    } else {
      process.env.SOLANA_RPC_TIMEOUT_MS = previousTimeout;
    }
  }
});
