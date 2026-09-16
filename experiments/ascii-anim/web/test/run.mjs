/* Runs every watertable suite in sequence and reports the tally. */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { HERE, buildProbe } from "./harness.mjs";

buildProbe();
const suites = ["world.mjs", "pressure.mjs", "underground.mjs", "hosting.mjs"];
let failed = 0;
for (const s of suites) {
  process.stdout.write("\n=== " + s.replace(".mjs", "") + " ===\n");
  try {
    execFileSync(process.execPath, [join(HERE, s)], { stdio: "inherit" });
  } catch (e) { failed++; }
}
console.log("\n" + (failed ? failed + " suite(s) failed" : "every suite passed"));
process.exit(failed ? 1 : 0);
