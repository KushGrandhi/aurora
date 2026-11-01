export type Problem = {
  itemId?: string;
  severity: "error" | "warning" | "unverified";
  message: string;
  hint?: string;
};
