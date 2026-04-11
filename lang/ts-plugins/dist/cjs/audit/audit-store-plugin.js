"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditStorePlugin = void 0;
const auditing_flow_store_js_1 = require("./auditing-flow-store.js");
class AuditStorePlugin {
    descriptor() {
        return { id: 'audit', displayName: 'Audit Store', description: 'Captures transition + produced-data diffs' };
    }
    kind() { return 'STORE'; }
    wrapStore(store) {
        return new auditing_flow_store_js_1.AuditingFlowStore(store);
    }
}
exports.AuditStorePlugin = AuditStorePlugin;
