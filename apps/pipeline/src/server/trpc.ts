import { initTRPC } from "@trpc/server";
import { ZodError } from "zod";

export const t = initTRPC.create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: { ...shape.data, zodError: error.cause instanceof ZodError ? error.cause.flatten() : null },
    };
  },
});

export const router = t.router;
export const procedure = t.procedure;
