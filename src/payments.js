import { randomUUID } from "node:crypto";
import { config } from "./config.js";

export function buildRequirements(resource) {
  return {
    x402Version: 1,
    accepts: [{
      scheme: "exact",
      network: config.network,
      maxAmountRequired: String(config.reportPriceUsd),
      asset: "USDC",
      payTo: config.payTo,
      resource,
      description: "TokenPulse AI token risk report",
    }],
  };
}

export async function createPaymentHeader(requirements) {
  if (config.paymentMode !== "simulated") {
    throw new Error("Live payments are not implemented here. Use PAYMENT_MODE=simulated.");
  }
  const req = requirements.accepts[0];
  const payload = {
    mode: "simulated",
    paymentId: randomUUID(),
    amount: req.maxAmountRequired,
    payTo: req.payTo,
    resource: req.resource,
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function verifyPaymentHeader(header, resource) {
  try {
    const p = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    if (p.mode !== "simulated") return { ok: false, reason: "unsupported payment mode" };
    if (Number(p.amount) < config.reportPriceUsd) return { ok: false, reason: "amount too low" };
    if (p.payTo !== config.payTo) return { ok: false, reason: "wrong recipient" };
    if (p.resource !== resource) return { ok: false, reason: "wrong resource" };
    return { ok: true, paymentId: p.paymentId };
  } catch {
    return { ok: false, reason: "malformed payment header" };
  }
}
