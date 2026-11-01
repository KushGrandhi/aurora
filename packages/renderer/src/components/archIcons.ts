import { Box, Brain, Database, Globe, HardDrive, Layers, Monitor, Network, Server, SquareFunction, User, Zap, type LucideIcon } from "lucide-react";
import type { ARCH_KINDS } from "@genui/spec";

export const ARCH_ICONS: Record<(typeof ARCH_KINDS)[number], LucideIcon> = {
  service: Server, database: Database, queue: Layers, cache: Zap, client: Monitor, user: User,
  storage: HardDrive, function: SquareFunction, gateway: Network, external: Globe, model: Brain,
};
export const DEFAULT_ICON = Box;
