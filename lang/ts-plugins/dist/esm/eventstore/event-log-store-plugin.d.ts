import type { StorePlugin, PluginDescriptor } from '../api/types.js';
import { EventLogStoreDecorator } from './event-log-store-decorator.js';
export declare class EventLogStorePlugin implements StorePlugin {
    descriptor(): PluginDescriptor;
    kind(): "STORE";
    wrapStore(store: any): EventLogStoreDecorator;
}
