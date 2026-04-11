import { EventLogStoreDecorator } from './event-log-store-decorator.js';
export class EventLogStorePlugin {
    descriptor() {
        return { id: 'eventstore', displayName: 'Event Log Store', description: 'Tenure-lite: append-only transition log with replay' };
    }
    kind() { return 'STORE'; }
    wrapStore(store) {
        return new EventLogStoreDecorator(store);
    }
}
