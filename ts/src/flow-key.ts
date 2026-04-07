/**
 * Branded string type for type-safe FlowContext keys.
 *
 * Use dedicated FlowKey instances as keys, not raw strings.
 * Each key maps to exactly one data type in the context.
 */
export type FlowKey<T> = string & { readonly __type: T };

export function flowKey<T>(name: string): FlowKey<T> {
  return name as FlowKey<T>;
}
