// The worker entry point. The job runner is not wired yet (ADR 0011 is
// proposed); for now this lists the registered jobs and exits.
import { createLogger } from "@gifting/logger";

import { JOBS } from "./jobs/index";

const log = createLogger("worker");

for (const job of JOBS) {
  log.info({ job: job.name, schedule: job.schedule, milestone: job.milestone }, "job registered");
}
log.info({ count: JOBS.length }, "worker scaffold: runner not wired yet (ADR 0011)");
