// Runs the unit tests under several machine time zones. The business rules must give identical results
// whatever zone the server or the developer's machine uses.
import { execFileSync } from "node:child_process";

const ZONES = ["UTC", "Europe/Bucharest", "America/Los_Angeles", "Pacific/Auckland", "Asia/Kolkata", "Australia/Lord_Howe"];
let failed = false;
for (const TZ of ZONES) {
  try {
    const out = execFileSync("npx", ["vitest", "run", "--reporter=dot"], { env: { ...process.env, TZ }, encoding: "utf8" });
    console.log(`TZ=${TZ.padEnd(22)} ${out.match(/Tests\s+(.*)/)?.[0]?.trim() ?? "ok"}`);
  } catch (error) {
    failed = true;
    console.log(`TZ=${TZ.padEnd(22)} FAILED`);
    console.log((error as { stdout?: string }).stdout ?? error);
  }
}
process.exit(failed ? 1 : 0);
