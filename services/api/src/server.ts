import { createLogger } from "@gifting/logger";
import { z } from "zod";

import { buildApp } from "./app";

const log = createLogger("api");
const port = z.coerce.number().int().positive().default(4000).parse(process.env.API_PORT);

const app = await buildApp({ logger: log });

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  log.fatal({ err }, "API failed to start");
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
