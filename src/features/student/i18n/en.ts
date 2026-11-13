import { commonEn } from "./common-en";
import { en as documents } from "./documents";
import { en as queue } from "./queue";
import { en as presentation } from "./presentation";
export const en = {
  ...commonEn,
  ...documents,
  ...queue,
  ...presentation,
} as const;
export type MessageKey = keyof typeof en;
