// pnpm ct:plan — prints the drafts ct:apply would create. Makes no calls.
import {
  associateRoleDrafts,
  categoryDrafts,
  channelDrafts,
  productTypeDrafts,
  shippingMethodDraft,
  storeDraft,
  taxCategoryDraft,
  typeDrafts,
  zoneDraft,
} from "../src/drafts";

const plan = {
  store: storeDraft,
  types: typeDrafts,
  productTypes: productTypeDrafts,
  taxCategory: taxCategoryDraft,
  zone: zoneDraft,
  shippingMethod: shippingMethodDraft,
  channels: channelDrafts,
  associateRoles: associateRoleDrafts,
  categories: categoryDrafts,
};
process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
