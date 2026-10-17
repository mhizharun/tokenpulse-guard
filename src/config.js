export const config = {
  paymentMode: process.env.PAYMENT_MODE || "simulated",
  dataSource: process.env.DATA_SOURCE || "mock", // "mock" or "solana"
  solanaRpcUrl: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  port: Number(process.env.PORT || 4020),
  riskThreshold: Number(process.env.RISK_THRESHOLD || 50), // block if score >= threshold
  reportPriceUsd: Number(process.env.REPORT_PRICE_USD || 0.02),
  payTo: "SIMULATED_TOKENPULSE_TREASURY",
  network: "simulated",
};
