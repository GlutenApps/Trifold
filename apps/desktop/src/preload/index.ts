import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  API_METHODS,
  channelName,
  EVENT_CHANNELS,
  type ApiNamespace,
  type TrifoldEvents,
} from '@trifold/api';

/**
 * Builds `window.trifold` mechanically from `API_METHODS` (packages/api), so the bridge can never
 * drift from the interface. Each method becomes `ipcRenderer.invoke` on its channel.
 */
type Invoker = (...args: unknown[]) => Promise<unknown>;

const bridge: Record<string, unknown> = {};

for (const ns of Object.keys(API_METHODS) as ApiNamespace[]) {
  const methods: Record<string, Invoker> = {};
  for (const method of API_METHODS[ns]) {
    const channel = channelName(ns, method);
    methods[method] = (...args) => ipcRenderer.invoke(channel, ...args);
  }
  bridge[ns] = methods;
}

bridge['on'] = <E extends keyof TrifoldEvents>(
  event: E,
  listener: (payload: TrifoldEvents[E]) => void,
): (() => void) => {
  const channel = EVENT_CHANNELS[event];
  if (!channel) throw new Error(`unknown event ${String(event)}`);
  const wrapped = (_e: IpcRendererEvent, payload: TrifoldEvents[E]) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
};

contextBridge.exposeInMainWorld('trifold', bridge);
