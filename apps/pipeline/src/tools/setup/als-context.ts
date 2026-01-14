// als-context.ts
import { AsyncLocalStorage } from "node:async_hooks";

export interface LogContext {
  correlationId?: string; // Make optional if not always present
  // Add other contextual fields you might want (tenantId, userId, etc.)
  [key: string]: unknown; // Allow arbitrary context keys
}

export const als = new AsyncLocalStorage<LogContext>();
