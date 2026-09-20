import { CronJob } from "cron";
import http from "node:http";
import https from "node:https";

import { cleanupExpiredStatuses } from "./statusCleanup.js";

// every 14 minutes send a GET request to the health endpoint
const job = new CronJob("*/14 * * * *", function () {
  const base = process.env.FRONTEND_URL;
  if (!base) return;
  const url = new URL("/health", base).href;
  const client = url.startsWith("https:") ? https : http;

  client
    .get(url, (res) => {
      if (res.statusCode === 200) console.log("GET request sent successfully");
      else console.log("GET request failed", res.statusCode);
    })
    .on("error", (e) => console.error("Error while sending request", e));
});

// Sweeps expired statuses every 10 minutes: deletes each one's image from
// ImageKit, then the row itself. Runs in every environment (not just
// production like the health ping above) because the storage it frees is
// real in development too — and it's cheap when there's nothing expired.
const statusCleanupJob = new CronJob("*/10 * * * *", async function () {
  await cleanupExpiredStatuses();
});

export { statusCleanupJob };
export default job;