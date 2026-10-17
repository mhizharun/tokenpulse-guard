export function printReport(r) {
  console.log(`\n${r.name} (${r.symbol}) on ${r.chain}`);
  console.log(`Risk: ${r.score}/100 (${r.level})  |  Data confidence: ${r.confidence}`);
  for (const s of r.sections) {
    console.log(`\n[${s.name}] ${s.score} pts`);
    s.flags.forEach((f) => console.log(`  - ${f}`));
  }
  if (r.dataGaps.length) {
    console.log("\nNot checked / unavailable:");
    r.dataGaps.forEach((g) => console.log(`  ? ${g}`));
  }
  console.log("");
}
