import { getProvider } from "./tokens.js";

const money = (n) => `$${Number(n).toLocaleString()}`;
const missing = (value) => value === null || value === undefined;

function analyzeContract(t) {
  let score = 0;
  const flags = [];
  const gaps = [];
  const criticalGaps = [];

  if (t.honeypot === true) {
    score += 30;
    flags.push("Honeypot behaviour detected (sells may fail)");
  } else if (missing(t.honeypot)) {
    const gap = "Honeypot check not available";
    gaps.push(gap);
    criticalGaps.push(gap);
  }

  if (t.mintRenounced === false) {
    score += 8;
    flags.push("Mint authority not renounced (supply can be inflated)");
  } else if (missing(t.mintRenounced)) {
    const gap = "Mint authority status unknown";
    gaps.push(gap);
    criticalGaps.push(gap);
  }

  if (t.freezeAuthorityActive === true) {
    score += 8;
    flags.push("Freeze authority active (wallets can be frozen)");
  } else if (missing(t.freezeAuthorityActive)) {
    const gap = "Freeze authority status unknown";
    gaps.push(gap);
    criticalGaps.push(gap);
  }

  if (missing(t.liquidityUsd) || !Number.isFinite(Number(t.liquidityUsd))) {
    const gap = "Liquidity data unavailable";
    gaps.push(gap);
    criticalGaps.push(gap);
  } else if (Number(t.liquidityUsd) < 50_000) {
    score += 12;
    flags.push(`Very low liquidity (${money(t.liquidityUsd)})`);
  } else if (Number(t.liquidityUsd) < 500_000) {
    score += 5;
    flags.push(`Moderate liquidity (${money(t.liquidityUsd)})`);
  }

  if (missing(t.liquidityLockedPct)) {
    const gap = "Liquidity lock status not checked";
    gaps.push(gap);
    criticalGaps.push(gap);
  } else if (
    !Number.isFinite(Number(t.liquidityLockedPct)) ||
    Number(t.liquidityLockedPct) < 0 ||
    Number(t.liquidityLockedPct) > 100
  ) {
    const gap = "Liquidity lock percentage is invalid";
    gaps.push(gap);
    criticalGaps.push(gap);
  } else if (Number(t.liquidityLockedPct) < 50) {
    score += 8;
    flags.push(`Only ${t.liquidityLockedPct}% of liquidity is locked`);
  }

  if (missing(t.ageDays) || !Number.isFinite(Number(t.ageDays))) {
    gaps.push("Token age unknown");
  } else if (Number(t.ageDays) < 7) {
    score += 7;
    flags.push(`Token is only ${t.ageDays} day(s) old`);
  }

  return {
    name: "Contract & liquidity",
    score: Math.min(score, 35),
    flags,
    gaps,
    criticalGaps,
  };
}

function analyzeDev(t) {
  const d = t.dev;
  let score = 0;
  const flags = [];
  const gaps = [];

  if (!d) {
    return {
      name: "Dev wallet",
      score: 0,
      flags,
      gaps: ["Dev wallet could not be identified"],
      criticalGaps: [],
    };
  }

  if (d.address) {
    flags.push(`Dev wallet: ${d.address}`);
  } else {
    gaps.push("Dev wallet identity not verified");
  }

  if (d.creatorVerified === false) {
    gaps.push("Token creator attribution is unverified");
  }

  if (missing(d.prevTokensRugged)) {
    gaps.push("Dev's past tokens not checked");
  } else if (
    Number.isFinite(Number(d.prevTokensRugged)) &&
    Number(d.prevTokensRugged) >= 3
  ) {
    score += 20;
    flags.push(
      `Dev rugged ${d.prevTokensRugged} of ${d.prevTokensCreated ?? "an unknown number of"} previous tokens`
    );
  } else if (
    Number.isFinite(Number(d.prevTokensRugged)) &&
    Number(d.prevTokensRugged) >= 1
  ) {
    score += 10;
    flags.push(`Dev has ${d.prevTokensRugged} previous rugged token(s)`);
  }

  if (missing(d.holdingPct) || !Number.isFinite(Number(d.holdingPct))) {
    gaps.push("Dev holdings unknown");
  } else if (Number(d.holdingPct) >= 15) {
    score += 10;
    flags.push(`Dev still holds ${d.holdingPct}% of supply`);
  } else if (Number(d.holdingPct) >= 5) {
    score += 4;
    flags.push(`Dev holds ${d.holdingPct}% of supply`);
  } else {
    flags.push(`Dev holds ${d.holdingPct}% of supply`);
  }

  if (missing(d.soldPct) || !Number.isFinite(Number(d.soldPct))) {
    gaps.push("Dev sell activity not checked");
  } else if (Number(d.soldPct) >= 30) {
    score += 8;
    flags.push(`Dev has already sold ${d.soldPct}% of their allocation`);
  }

  if (missing(d.fundedByFreshWallet)) {
    gaps.push("Dev funding source not checked");
  } else if (d.fundedByFreshWallet === true) {
    score += 7;
    flags.push("Dev wallet was funded by a brand-new wallet");
  }

  return {
    name: "Dev wallet",
    score: Math.min(score, 30),
    flags,
    gaps,
    criticalGaps: [],
  };
}

function analyzeHolders(t) {
  const holders = Array.isArray(t.holders) ? t.holders : [];
  const gaps = [];
  const criticalGaps = [];
  const flags = [];

  if (t.holdersDataAvailable === false) {
    const message = "Holder data request failed";
    gaps.push(message);
    criticalGaps.push(message);
  }

  const unknownClassification = holders.some(
    (h) => h.isContract === null || h.isContract === undefined
  );

  if (unknownClassification) {
    gaps.push("Some holder wallet classifications are unknown");
  }

  // Only explicitly classified wallets are used for wallet concentration.
  const real = holders
    .filter((h) => h.isContract === false && Number.isFinite(Number(h.pct)))
    .sort((a, b) => Number(b.pct) - Number(a.pct));

  if (real.length === 0) {
    gaps.push("Verified wallet holder concentration unavailable");
    return {
      name: "Major holders",
      score: 0,
      flags,
      gaps: [...new Set(gaps)],
      criticalGaps: [...new Set(criticalGaps)],
    };
  }

  const top1 = Number(real[0].pct);
  const top5 = real
    .slice(0, 5)
    .reduce((sum, holder) => sum + Number(holder.pct), 0);

  let score = 0;

  if (top1 >= 25) {
    score += 10;
    flags.push(`Top holder owns ${top1}% of supply`);
  } else if (top1 >= 10) {
    score += 4;
    flags.push(`Top holder owns ${top1}% of supply`);
  }

  if (top5 >= 50) {
    score += 10;
    flags.push(`Top 5 holders own ${top5.toFixed(1)}% of supply`);
  } else if (top5 >= 30) {
    score += 5;
    flags.push(`Top 5 holders own ${top5.toFixed(1)}% of supply`);
  }

  return {
    name: "Major holders",
    score: Math.min(score, 20),
    flags,
    gaps: [...new Set(gaps)],
    criticalGaps: [...new Set(criticalGaps)],
    metrics: {
      top1,
      top5: Number(top5.toFixed(1)),
      classifiedWalletCount: real.length,
    },
  };
}

function analyzeWhales(t) {
  let score = 0;
  const flags = [];
  const gaps = [];
  const whales = Array.isArray(t.whales) ? t.whales : [];

  const known = whales.filter(
    (w) =>
      w.recentAction === "unknown" ||
      missing(w.recentAction)
        ? false
        : ["buying", "selling", "holding"].includes(w.recentAction)
  );

  if (whales.some((w) => !known.includes(w))) {
    gaps.push("Whale buy/sell activity not fully verified");
  }

  const sellers = known.filter((w) => w.recentAction === "selling");
  const buyers = known.filter((w) => w.recentAction === "buying");

  if (sellers.length >= 2) {
    score += 15;
    flags.push(`${sellers.length} whales are selling right now`);
  } else if (sellers.length === 1) {
    score += 7;
    flags.push("1 whale is selling right now");
  }

  if (buyers.length > 0 && sellers.length === 0) {
    flags.push(`${buyers.length} whale(s) accumulating (positive signal)`);
  }

  const combined = whales.reduce((sum, whale) => {
    const pct = Number(whale.pct);
    return sum + (Number.isFinite(pct) && pct >= 0 ? pct : 0);
  }, 0);

  if (whales.length > 0) {
    if (combined >= 40) {
      score += 8;
      flags.push(
        `${whales.length} whale wallets hold ${combined.toFixed(1)}% combined`
      );
    } else if (combined >= 20) {
      score += 4;
      flags.push(
        `${whales.length} whale wallets hold ${combined.toFixed(1)}% combined`
      );
    } else if (known.length === 0) {
      flags.push(
        `${whales.length} whale wallet(s) hold ${combined.toFixed(1)}% combined`
      );
    }
  }

  return {
    name: "Whales",
    score: Math.min(score, 15),
    flags,
    gaps,
    criticalGaps: [],
  };
}

export async function analyzeToken(
  contractAddress,
  provider = getProvider()
) {
  const t = await provider.getTokenData(contractAddress);
  if (!t) return null;

  const sections = [
    analyzeContract(t),
    analyzeDev(t),
    analyzeHolders(t),
    analyzeWhales(t),
  ];

  // Score reflects observed risk. Missing evidence is represented separately.
  const score = Math.min(
    100,
    sections.reduce((sum, section) => sum + section.score, 0)
  );

  const level = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
  const flags = sections.flatMap((section) => section.flags);
  const dataGaps = [...new Set(sections.flatMap((section) => section.gaps))];
  const criticalDataGaps = [
    ...new Set(sections.flatMap((section) => section.criticalGaps ?? [])),
  ];

  let confidence;
  let assessmentStatus;

  if (criticalDataGaps.length > 0) {
    confidence = "low";
    assessmentStatus = "INSUFFICIENT_DATA";
  } else if (dataGaps.length > 0) {
    confidence = dataGaps.length <= 3 ? "medium" : "low";
    assessmentStatus = "LIMITED";
  } else {
    confidence = "high";
    assessmentStatus = "COMPLETE";
  }

  const reasons = flags.length
    ? [...flags]
    : ["No major risk signals detected in the available data"];

  if (criticalDataGaps.length > 0) {
    reasons.push(
      "Essential security checks are missing; this assessment cannot establish that the token is safe."
    );
  } else if (dataGaps.length > 0) {
    reasons.push(
      "Some information is unavailable; the risk assessment is not complete."
    );
  }

  return {
    contractAddress,
    name: t.name,
    symbol: t.symbol,
    chain: t.chain,
    score,
    level,
    confidence,
    assessmentStatus,
    criticalDataGaps,
    sections,
    dataGaps,
    reasons,
    generatedAt: new Date().toISOString(),
  };
}
