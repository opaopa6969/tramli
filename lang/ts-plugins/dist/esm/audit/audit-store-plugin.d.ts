import type { StorePlugin, PluginDescriptor } from '../api/types.js';
import { AuditingFlowStore } from './auditing-flow-store.js';
export declare class AuditStorePlugin implements StorePlugin {
    descriptor(): PluginDescriptor;
    kind(): "STORE";
    wrapStore(store: any): AuditingFlowStore;
}
