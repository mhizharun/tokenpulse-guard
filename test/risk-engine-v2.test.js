import test from "node:test";
import assert from "node:assert/strict";
import { analyzeToken } from "../src/riskEngine.js";

function providerFor(token) {
  return {
    async getTokenData() {
      return structuredClone(token);
    },
  };
}

function completeToken(overrides = {}) {
  return {
    name: "Example Token",
    symbol: "EX",
    chain: "solana",
    honeypot: false,
    mintRenounced: true,
    freezeAuthorityActive: false,
    liquidityUsd: 1_000_000,
    liquidityLockedPct: 100,
    ageDays: 90,
    dev: {
      address: "VerifiedDevWallet",
      creatorVerified: true,
      prevTokensRugged: 0,
      prevTokensCreated: 2,
      holdingPct: 1,
      soldPct: 0,
      fundedByFreshWallet: false,
    },
    holders: [
      { address: "WalletOne", pct: 5, isContract: false },
      { address: "WalletTwo", pct: 4, isContract: false },
    ],
    whales: [],
    ...overrides,
  };
}

test("complete low-risk data produces high confidence and COMPLETE status", async () => {
  const report = await analyzeToken(
    "ExampleMint",
    providerFor(completeToken())
  );

  assert.equal(report.score, 0);
  assert.equal(report.confidence, "high");
  assert.equal(report.assessmentStatus, "COMPLETE");
  assert.deepEqual(report.criticalDataGaps, []);
  assert.deepEqual(report.dataGaps, []);
});

test("missing honeypot result is critical and lowers confidence", async () => {
  const token = completeToken({ honeypot: null });
  const report = await analyzeToken("ExampleMint", providerFor(token));

  assert.equal(report.confidence, "low");
  assert.equal(report.assessmentStatus, "INSUFFICIENT_DATA");
  assert.ok(
    report.criticalDataGaps.some((gap) => gap.includes("Honeypot"))
  );
  assert.ok(
    report.reasons.some((reason) => reason.includes("cannot establish"))
  );
});

test("unknown mint and freeze authority are not treated as safe", async () => {
  const token = completeToken({
    mintRenounced: null,
    freezeAuthorityActive: undefined,
  });
  const report = await analyzeToken("ExampleMint", providerFor(token));

  assert.equal(report.assessmentStatus, "INSUFFICIENT_DATA");
  assert.equal(report.confidence, "low");
  assert.ok(
    report.criticalDataGaps.some((gap) => gap.includes("Mint authority"))
  );
  assert.ok(
    report.criticalDataGaps.some((gap) => gap.includes("Freeze authority"))
  );
});

test("missing liquidity and lock information are critical gaps", async () => {
  const token = completeToken({
    liquidityUsd: null,
    liquidityLockedPct: null,
  });
  const report = await analyzeToken("ExampleMint", providerFor(token));

  assert.equal(report.assessmentStatus, "INSUFFICIENT_DATA");
  assert.ok(
    report.criticalDataGaps.some((gap) => gap.includes("Liquidity data"))
  );
  assert.ok(
    report.criticalDataGaps.some((gap) => gap.includes("lock status"))
  );
});

test("unknown holder classifications are excluded from concentration metrics", async () => {
  const token = completeToken({
    holders: [
      { address: "UnknownWallet", pct: 80, isContract: null },
      { address: "KnownWallet", pct: 5, isContract: false },
    ],
  });
  const report = await analyzeToken("ExampleMint", providerFor(token));
  const holders = report.sections.find(
    (section) => section.name === "Major holders"
  );

  assert.equal(holders.metrics.top1, 5);
  assert.ok(
    report.dataGaps.some((gap) => gap.includes("classifications are unknown"))
  );
  assert.equal(report.assessmentStatus, "LIMITED");
});

test("missing developer identity does not count as evidence of safety", async () => {
  const token = completeToken({
    dev: {
      address: null,
      creatorVerified: false,
      prevTokensRugged: null,
      holdingPct: null,
      soldPct: null,
      fundedByFreshWallet: null,
    },
  });
  const report = await analyzeToken("ExampleMint", providerFor(token));

  assert.notEqual(report.confidence, "high");
  assert.ok(report.dataGaps.some((gap) => gap.includes("identity")));
  assert.ok(report.dataGaps.some((gap) => gap.includes("attribution")));
});

test("high detected risk remains high regardless of missing-data confidence", async () => {
  const token = completeToken({
    honeypot: true,
    mintRenounced: null,
    freezeAuthorityActive: null,
  });
  const report = await analyzeToken("ExampleMint", providerFor(token));

  assert.ok(report.score >= 30);
  assert.equal(report.assessmentStatus, "INSUFFICIENT_DATA");
  assert.ok(report.reasons.some((reason) => reason.includes("Honeypot")));
});

test("null provider result remains null", async () => {
  const report = await analyzeToken("UnknownMint", {
    async getTokenData() {
      return null;
    },
  });

  assert.equal(report, null);
});
