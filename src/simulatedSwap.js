const portfolio = { USDC: 1000 };

export function getPortfolio() { return { ...portfolio }; }

export function simulateSwap({ symbol, amountUsd }) {
  if (portfolio.USDC < amountUsd) throw new Error("insufficient simulated USDC");
  portfolio.USDC -= amountUsd;
  portfolio[symbol] = (portfolio[symbol] || 0) + amountUsd;
  return { status: "simulated_swap_executed", symbol, amountUsd, portfolio: getPortfolio() };
}
