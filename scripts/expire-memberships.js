import {expireDueMemberships} from "../src/membership/service.js";
import {closePool} from "../src/platform/db.js";

try {
  const result = await expireDueMemberships(process.env.MEMBERSHIP_EXPIRY_BATCH_SIZE || 500);
  process.stdout.write(JSON.stringify({ ok: true, expiredCount: result.expiredCount, items: result.items.map(item => ({ id: item.id, endDate: item.end_date })) }) + "\n");
} catch (error) {
  process.stderr.write(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }) + "\n");
  process.exitCode = 1;
} finally {
  await closePool();
}
