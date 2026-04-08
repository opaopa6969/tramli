import type { StorePlugin, PluginDescriptor } from '../api/types.js';
import { EventLogStoreDecorator } from './event-log-store-decorator.js';

export class EventLogStorePlugin implements StorePlugin {
  descriptor(): PluginDescriptor {
    return { id: 'eventstore', displayName: 'Event Log Store', description: 'Tenure-lite: append-only transition log with replay' };
  }
  kind() { return 'STORE' as const; }

  wrapStore(store: any): EventLogStoreDecorator {
    return new EventLogStoreDecorator(store);
  }
}
