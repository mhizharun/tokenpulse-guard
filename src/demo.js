import { createServer } from "./server.js";
import { guardedSwap } from "./guard.js";
import { config } from "./config.js";
import { DEMO_ADDRESSES } from "./tokens.js";

const server = createServer();
await new Promise((r) => server.listen(config.port, r));
const baseUrl = `http://localhost:${config.port}`;

console.log(`\n=== TokenPulse Guard demo (${config.paymentMode.toUpperCase()} - no real funds) ===`);

const scenarios = [
  ["Scenario A: risky token", DEMO_ADDRESSES.rug],
  ["Scenario B: safe token", DEMO_ADDRESSES.safe],
  ["Scenario C: mixed token", DEMO_ADDRESSES.mid],
];

for (const [label, ca] of scenarios) {
  console.log(`\n--- ${label} ---`);
  console.log(`User pastes C.A: ${ca}`);
  console.log(`Paying $${config.reportPriceUsd} for deep analysis (dev wallet, holders, whales)...`);
  const r = await guardedSwap({ baseUrl, contractAddress: ca, amountUsd: 100 });
  console.log(`\n${r.message}`);
  for (const s of r.sections) {
    console.log(`  [${s.name}] ${s.score} pts`);
    s.flags.forEach((f) => console.log(`     - ${f}`));
  }
  if (r.swap) console.log("  Portfolio:", r.swap.portfolio);
}

server.close();
