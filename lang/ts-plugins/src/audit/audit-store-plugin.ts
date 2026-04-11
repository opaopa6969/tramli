import type { StorePlugin, PluginDescriptor } from '../api/types.js';
import { AuditingFlowStore } from './auditing-flow-store.js';

export class AuditStorePlugin implements StorePlugin {
  descriptor(): PluginDescriptor {
    return { id: 'audit', displayName: 'Audit Store', description: 'Captures transition + produced-data diffs' };
  }
  kind() { return 'STORE' as const; }

  wrapStore(store: any): AuditingFlowStore {
    return new AuditingFlowStore(store);
  }
}
