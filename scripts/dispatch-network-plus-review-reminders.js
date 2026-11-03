import "../src/platform/load-env.js";
import { dispatchNetworkPlusRequestReviewReminders } from "../src/network-plus/request-collaboration.js";
import { closePool } from "../src/platform/db.js";

try {
  const result = await dispatchNetworkPlusRequestReviewReminders({ limit: Number(process.env.NETWORK_PLUS_REVIEW_REMINDER_BATCH_SIZE || 100) });
  process.stdout.write(JSON.stringify({ ok: true, ...result }) + "\n");
} catch (error) {
  process.stderr.write(JSON.stringify({ ok: false, code: error.code || "DISPATCH_FAILED", message: error.message }) + "\n");
  process.exitCode = 1;
} finally {
  await closePool();
}
