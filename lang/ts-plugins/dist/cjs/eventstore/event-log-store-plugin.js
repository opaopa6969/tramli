"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventLogStorePlugin = void 0;
const event_log_store_decorator_js_1 = require("./event-log-store-decorator.js");
class EventLogStorePlugin {
    descriptor() {
        return { id: 'eventstore', displayName: 'Event Log Store', description: 'Tenure-lite: append-only transition log with replay' };
    }
    kind() { return 'STORE'; }
    wrapStore(store) {
        return new event_log_store_decorator_js_1.EventLogStoreDecorator(store);
    }
}
exports.EventLogStorePlugin = EventLogStorePlugin;
