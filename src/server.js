import http from "node:http";
import { config } from "./config.js";
import { analyzeToken } from "./riskEngine.js";
import { buildRequirements, verifyPaymentHeader } from "./payments.js";

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body, null, 2));
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const match = url.pathname.match(/^\/analyze\/([A-Za-z0-9]{20,})$/);
    if (req.method !== "GET" || !match) return send(res, 404, { error: "not found" });

    const resource = url.pathname;
    const header = req.headers["x-payment"];
    if (!header) return send(res, 402, buildRequirements(resource));

    const check = verifyPaymentHeader(header, resource);
    if (!check.ok) return send(res, 402, { error: check.reason, ...buildRequirements(resource) });

    const report = await analyzeToken(match[1]);
    if (!report) return send(res, 404, { error: "token not found for this contract address" });

    return send(res, 200, { paymentId: check.paymentId, report });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer().listen(config.port, () =>
    console.log(`TokenPulse analysis endpoint: http://localhost:${config.port}/analyze/:contractAddress (${config.paymentMode} mode)`));
}
