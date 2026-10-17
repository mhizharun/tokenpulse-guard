import { config } from "./config.js";
import { createPaymentHeader } from "./payments.js";
import { simulateSwap } from "./simulatedSwap.js";

export async function fetchAnalysis(baseUrl, contractAddress) {
  const url = `${baseUrl}/analyze/${contractAddress}`;
  let res = await fetch(url);

  if (res.status === 402) {
    const requirements = await res.json();
    const header = await createPaymentHeader(requirements);
    res = await fetch(url, { headers: { "X-PAYMENT": header } });
  }
  if (res.status === 404) throw new Error("Token not found for this contract address");
  if (!res.ok) throw new Error(`analysis failed (${res.status})`);
  return res.json();
}

export async function guardedSwap({
  baseUrl,
  contractAddress,
  amountUsd,
  threshold = config.riskThreshold
}) {
  const { report, paymentId } = await fetchAnalysis(
    baseUrl,
    contractAddress.trim()
  );

  if (
    !report ||
    !Number.isFinite(report.score) ||
    report.score < 0 ||
    report.score > 100
  ) {
    throw new Error("Invalid risk report; refusing to proceed");
  }

  const blocked = report.score >= threshold;

  // Fail closed: approval requires a complete report with explicit,
  // empty lists for both ordinary and critical data gaps.
  const validDataGaps = Array.isArray(report.dataGaps);
  const validCriticalGaps = Array.isArray(report.criticalDataGaps);

  const review = !blocked && (
    report.confidence !== "high" ||
    report.assessmentStatus !== "COMPLETE" ||
    !validDataGaps ||
    report.dataGaps.length > 0 ||
    !validCriticalGaps ||
    report.criticalDataGaps.length > 0
  );

  const base = {
    symbol: report.symbol,
    contractAddress: report.contractAddress,
    score: report.score,
    level: report.level,
    confidence: report.confidence,
    assessmentStatus: report.assessmentStatus ?? "UNKNOWN",
    criticalDataGaps: validCriticalGaps ? report.criticalDataGaps : [],
    dataGaps: validDataGaps ? report.dataGaps : [],
    sections: report.sections,
    reasons: report.reasons,
    paymentId,
  };

  if (blocked) {
    return {
      ...base,
      decision: "BLOCKED",
      message: `Swap into ${report.symbol} blocked: risk ${report.score}/100 (threshold ${threshold}).`,
    };
  }

  if (review) {
    return {
      ...base,
      decision: "REVIEW",
      message: `Swap into ${report.symbol} requires manual review: analysis confidence is low. ${base.dataGaps.length} data gap(s) reported.`,
    };
  }

  const swap = simulateSwap({
    symbol: report.symbol,
    amountUsd
  });

  return {
    ...base,
    decision: "APPROVED",
    swap,
    message: `Swap into ${report.symbol} approved by the configured risk rules: ${report.score}/100. This is a simulation, not a real blockchain transaction.`,
  };
}
