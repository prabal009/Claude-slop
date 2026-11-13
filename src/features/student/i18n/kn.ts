import { commonKn } from "./common-kn";
import { kn as documents } from "./documents";
import { kn as queue } from "./queue";
import { kn as presentation } from "./presentation";
import type { MessageKey } from "./en";
export const kn: Record<MessageKey, string> = {
  ...commonKn,
  ...documents,
  ...queue,
  ...presentation,
};
