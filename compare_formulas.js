const fs = require("fs");
const n = fs.readFileSync("src/N.formatted.js", "utf8").split("\n");
const o = fs.readFileSync("src/N-last.formatted.js", "utf8").split("\n");
function findLine(lines, pattern) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(pattern)) return i;
  }
  return -1;
}
console.log("Starting comparison...");
const newMC = findLine(n, "\"MonsterCash\" == e) return");
const oldMC = findLine(o, "\"MonsterCash\" == e) return");
console.log("=== MonsterCash ===");
console.log("New line:", newMC+1, "Old line:", oldMC+1);
if (newMC !== -1 && oldMC !== -1) {
  console.log("Same?", n[newMC].trim() === o[oldMC].trim());
  if (n[newMC].trim() !== o[oldMC].trim()) {
    const newParts = n[newMC].split("*");
    const oldParts = o[oldMC].split("*");
    for (let i = 0; i < Math.max(newParts.length, oldParts.length); i++) {
      if (newParts[i] !== oldParts[i]) {
        console.log("Diff at part", i);
        console.log("  OLD:", (oldParts[i] || "MISSING").trim());
        console.log("  NEW:", (newParts[i] || "MISSING").trim());
      }
    }
  }
}
const newDR = findLine(n, "\"Drop_Rarity\" == e ?");
const oldDR = findLine(o, "\"Drop_Rarity\" == e ?");
console.log("\n=== Drop_Rarity ===");
console.log("New line:", newDR+1, "Old line:", oldDR+1);
if (newDR !== -1 && oldDR !== -1) {
  console.log("Same?", n[newDR].trim() === o[oldDR].trim());
  if (n[newDR].trim() !== o[oldDR].trim()) {
    const newParts = n[newDR].split("*");
    const oldParts = o[oldDR].split("*");
    for (let i = 0; i < Math.max(newParts.length, oldParts.length); i++) {
      if (newParts[i] !== oldParts[i]) {
        console.log("Diff at part", i);
        console.log("  OLD:", (oldParts[i] || "MISSING").trim());
        console.log("  NEW:", (newParts[i] || "MISSING").trim());
      }
    }
  }
}
