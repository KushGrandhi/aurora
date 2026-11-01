import { z } from "zod";

export const FORMATS = ["number", "integer", "percent", "currency", "date", "compact", "delta", "bytes", "kilobytes", "megabytes", "gigabytes"] as const;
export const FormatSchema = z.enum(FORMATS);
export type Format = z.infer<typeof FormatSchema>;

export const IdSchema = z.string().regex(/^[A-Za-z_]\w*$/);
export type Id = z.infer<typeof IdSchema>;

export const QuerySchema = z.object({ sql: z.string().min(1) });
export type Query = z.infer<typeof QuerySchema>;
