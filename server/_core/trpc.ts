import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

/**
 * M1: Error formatter.
 *  - `data.stack` is always stripped (it leaked whenever NODE_ENV !== "production").
 *  - An error that did not originate as a TRPCError (a plain `throw new Error(...)`
 *    or a driver/library error, which tRPC wraps as INTERNAL_SERVER_ERROR with the
 *    original as `cause`) gets a generic message in production. Intentional
 *    TRPCErrors — including deliberate INTERNAL_SERVER_ERRORs with their own message
 *    and zod BAD_REQUESTs — keep their message.
 *    (tRPC's wrapper sets `message = cause.message`; a deliberate TRPCError that
 *    passes `cause` but no `message` is treated the same, since its message is the
 *    raw cause text.)
 */
export function isUnexpectedError(error: TRPCError): boolean {
  const cause = error.cause;
  return (
    error.code === "INTERNAL_SERVER_ERROR" &&
    cause !== undefined &&
    !(cause instanceof TRPCError) &&
    error.message === cause.message
  );
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const { stack: _stack, ...data } = shape.data;
    const message =
      process.env.NODE_ENV === "production" && isUnexpectedError(error)
        ? "Internal error"
        : shape.message;
    return { ...shape, message, data };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
