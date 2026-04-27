import { Tramli, type FlowKey } from '@unlaxer/tramli';

export type DataPair = [FlowKey<unknown>, unknown];
export type DataInput = Map<string, unknown> | DataPair[];

export function resolveData(input?: DataInput): Map<string, unknown> | undefined {
  if (input == null) return undefined;
  if (input instanceof Map) return input;
  return Tramli.data(...input);
}
