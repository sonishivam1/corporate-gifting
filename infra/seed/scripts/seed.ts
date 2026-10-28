// pnpm seed — M0 package 0.3 imports the seed data through the commercetools
// Import API. Until then this reports what would be imported and stops.
import { createLogger } from "@gifting/logger";

import { products, vendors } from "../src/index";

const log = createLogger("seed");

log.info({ vendors: vendors.length, products: products.length }, "seed data ready");
log.warn("Import into commercetools is not built yet (M0 package 0.3); run pnpm ct:plan to see the setup drafts.");
process.exitCode = 1;
