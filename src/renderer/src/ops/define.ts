import type { StructDef, StructValue } from "./prop";
import type { Context, OperatorDef, OpResult } from "./types";

/**
 * Type-safe operator definition helper. Preserves the inference from the
 * `props` schema into the `exec` body, so operators don't need
 * `Record<string, unknown>` casts inside themselves.
 */
export function defineOperator<P extends StructDef, R = unknown>(
  def: Omit<OperatorDef<R>, "props" | "exec"> & {
    props: P;
    exec: (
      ctx: Context,
      props: StructValue<P>,
      raw: Record<string, unknown>,
    ) => OpResult<R> | Promise<OpResult<R>>;
  },
): OperatorDef<R> {
  return def as unknown as OperatorDef<R>;
}
