import test from "node:test";
import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "../src/server.js";
import { guardedSwap } from "../src/guard.js";
import { analyzeToken } from "../src/riskEngine.js";
import { DEMO_ADDRESSES } from "../src/tokens.js";

async function closeServer(server) {
  const closed = new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

  // Avoid hanging on keep-alive connections after a test finishes.
  server.closeAllConnections?.();
  await closed;
}

function paymentTestServer(report) {
  const server = createHttpServer((req, res) => {
    res.setHeader("Content-Type", "application/json");

    if (!req.headers["x-payment"]) {
      res.statusCode = 402;
      res.end(JSON.stringify({
        accepts: [{
          scheme: "exact",
          network: "simulated",
          maxAmountRequired: "0.02",
          asset: "USDC",
          payTo: "SIMULATED_TOKENPULSE_TREASURY",
          resource: `http://localhost:${server.address().port}${req.url}`,
          description: "Test report",
        }],
      }));
      return;
    }

    res.end(JSON.stringify({
      paymentId: "test-payment",
      report,
    }));
  });

  return server;
}

test("risky token scores high, safe token scores low, unknown is null", async () => {
  assert.ok((await analyzeToken(DEMO_ADDRESSES.rug)).score >= 70);
  assert.ok((await analyzeToken(DEMO_ADDRESSES.safe)).score < 20);
  assert.equal(
    await analyzeToken("UnknownAddress1111111111111111"),
    null
  );
});

test("report includes dev wallet, holders and whale sections", async () => {
  const report = await analyzeToken(DEMO_ADDRESSES.rug);
  const names = report.sections.map((section) => section.name);

  assert.deepEqual(names, [
    "Contract & liquidity",
    "Dev wallet",
    "Major holders",
    "Whales",
  ]);
});

test("guard blocks risky tokens and reviews incomplete safe-token data", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const baseUrl = `http://localhost:${server.address().port}`;

    const blocked = await guardedSwap({
      baseUrl,
      contractAddress: DEMO_ADDRESSES.rug,
      amountUsd: 50,
    });

    assert.equal(blocked.decision, "BLOCKED");

    const result = await guardedSwap({
      baseUrl,
      contractAddress: DEMO_ADDRESSES.safe,
      amountUsd: 50,
    });

    assert.notEqual(result.decision, "BLOCKED");

    if (result.decision === "REVIEW") {
      assert.equal("swap" in result, false);
      assert.ok(result.dataGaps.length > 0);
    } else {
      assert.equal(result.decision, "APPROVED");
    }
  } finally {
    await closeServer(server);
  }
});

test("endpoint returns 402 without payment", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const res = await fetch(
      `http://localhost:${server.address().port}/analyze/${DEMO_ADDRESSES.safe}`
    );

    assert.equal(res.status, 402);
  } finally {
    await closeServer(server);
  }
});

test("complete high-confidence report can be approved through the 402 flow", async () => {
  const server = paymentTestServer({
    contractAddress: "TestTokenAddress",
    symbol: "TEST",
    score: 5,
    level: "low",
    confidence: "high",
    assessmentStatus: "COMPLETE",
    criticalDataGaps: [],
    dataGaps: [],
    sections: [],
    reasons: ["No major risk signals detected in the available data"],
  });

  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const result = await guardedSwap({
      baseUrl: `http://localhost:${server.address().port}`,
      contractAddress: "TestTokenAddress",
      amountUsd: 50,
    });

    assert.equal(result.decision, "APPROVED");
    assert.ok(result.swap);
    assert.match(result.message, /simulation/i);
  } finally {
    await closeServer(server);
  }
});

test("low-confidence analysis requires review and never simulates a swap", async () => {
  const server = paymentTestServer({
    contractAddress: "TestTokenAddress",
    symbol: "TEST",
    score: 5,
    level: "low",
    confidence: "low",
    assessmentStatus: "INSUFFICIENT_DATA",
    criticalDataGaps: ["Honeypot check not available"],
    dataGaps: ["Honeypot check not available"],
    sections: [],
    reasons: ["Essential security checks are missing"],
  });

  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const result = await guardedSwap({
      baseUrl: `http://localhost:${server.address().port}`,
      contractAddress: "TestTokenAddress",
      amountUsd: 50,
    });

    assert.equal(result.decision, "REVIEW");
    assert.equal("swap" in result, false);
    assert.match(result.message, /manual review/i);
  } finally {
    await closeServer(server);
  }
});

test("critical missing data cannot be approved even if confidence claims high", async () => {
  const server = paymentTestServer({
    contractAddress: "TestTokenAddress",
    symbol: "TEST",
    score: 5,
    level: "low",
    confidence: "high",
    assessmentStatus: "INSUFFICIENT_DATA",
    criticalDataGaps: ["Honeypot check not available"],
    dataGaps: [],
    sections: [],
    reasons: [],
  });

  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const result = await guardedSwap({
      baseUrl: `http://localhost:${server.address().port}`,
      contractAddress: "TestTokenAddress",
      amountUsd: 50,
    });

    assert.equal(result.decision, "REVIEW");
    assert.equal("swap" in result, false);
  } finally {
    await closeServer(server);
  }
});

test("guard rejects approval when assessment status is missing", async () => {
  const server = paymentTestServer({
    contractAddress: "TestTokenAddress",
    symbol: "TEST",
    score: 5,
    level: "low",
    confidence: "high",
    criticalDataGaps: [],
    dataGaps: [],
    sections: [],
    reasons: [],
  });

  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const result = await guardedSwap({
      baseUrl: `http://localhost:${server.address().port}`,
      contractAddress: "TestTokenAddress",
      amountUsd: 50,
    });

    assert.equal(result.decision, "REVIEW");
    assert.equal("swap" in result, false);
  } finally {
    await closeServer(server);
  }
});
