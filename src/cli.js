import { analyzeToken } from "./riskEngine.js";
import { mockProvider } from "./tokens.js";
import { solanaProvider } from "./solanaProvider.js";
import { printReport } from "./format.js";

const args = process.argv.slice(2);
const ca = args.find((a) => !a.startsWith("--"));
if (!ca) {
  console.log("Usage: npm run analyze -- <CONTRACT_ADDRESS> [--mock]");
  process.exit(1);
}

try {
  const report = await analyzeToken(ca.trim(), args.includes("--mock") ? mockProvider : solanaProvider);
  if (!report) console.log("Token not found for this contract address.");
  else printReport(report);
} catch (e) {
  console.log(`Analysis failed: ${e.message}`);
  console.log("Tip: the free public RPC is rate-limited. Set SOLANA_RPC_URL to a provider URL and retry.");
  process.exit(1);
}
