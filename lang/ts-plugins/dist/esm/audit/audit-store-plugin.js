import { AuditingFlowStore } from './auditing-flow-store.js';
export class AuditStorePlugin {
    descriptor() {
        return { id: 'audit', displayName: 'Audit Store', description: 'Captures transition + produced-data diffs' };
    }
    kind() { return 'STORE'; }
    wrapStore(store) {
        return new AuditingFlowStore(store);
    }
}
