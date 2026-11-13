import { commonHi } from "./common-hi";
import { hi as documents } from "./documents";
import { hi as queue } from "./queue";
import { hi as presentation } from "./presentation";
import type { MessageKey } from "./en";
export const hi: Record<MessageKey, string> = {
  ...commonHi,
  ...documents,
  ...queue,
  ...presentation,
};
