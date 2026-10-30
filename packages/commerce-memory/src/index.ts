import { defineConnector } from "@gifting/commerce";

import { createMemoryConnector } from "./memory";

export { createMemoryConnector, memoryCatalog, type MemoryOptions } from "./memory";

/**
 * COMMERCE_CONNECTOR=memory: a platform in memory, for local development
 * without a commerce platform. Everything is lost when the API restarts.
 * MEMORY_SIGN_IN=hosted plays a platform with its own sign-in page.
 */
export default defineConnector(({ env, log, production }) => {
  if (production) throw new Error("The memory connector is for development only; set COMMERCE_CONNECTOR to a real platform.");
  const signIn = env.MEMORY_SIGN_IN === "hosted" ? "hosted" : "password";
  log.warn({ signIn }, "commerce: the memory connector keeps customers until the API restarts");
  return createMemoryConnector({ signIn }).connector;
});
