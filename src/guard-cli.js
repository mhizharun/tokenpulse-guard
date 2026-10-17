import { config } from "./config.js";
import { createServer } from "./server.js";
import { guardedSwap } from "./guard.js";
import { printReport } from "./format.js";
import { analyzeToken } from "./riskEngine.js";

config.dataSource = "solana";
const [ca, amount] = process.argv.slice(2);
if (!ca) { console.log("Usage: npm run guard -- <CONTRACT_ADDRESS> [amountUsd]"); process.exit(1); }

const server = createServer();
await new Promise((r) => server.listen(config.port, r));
try {
  console.log(`\nPaying $${config.reportPriceUsd} (${config.paymentMode}) for deep analysis...`);
  const result = await guardedSwap({
    baseUrl: `http://localhost:${config.port}`, contractAddress: ca, amountUsd: Number(amount || 100),
  });
  printReport(await analyzeToken(ca.trim()));
  console.log(result.message);
} catch (e) {
  console.log(`Failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  server.close();
}
