// pnpm ct:plan — prints the drafts ct:apply would create. Makes no calls.
import { channelDrafts, productTypeDrafts, storeDraft, typeDrafts } from "../src/drafts";

const plan = { store: storeDraft, types: typeDrafts, productTypes: productTypeDrafts, channels: channelDrafts };
process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
