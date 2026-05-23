declare global {
  interface Window {
    gtag?:      Gtag.Gtag;
    dataLayer?: unknown[];
  }
}

type EntityKind  = 'marketplace' | 'plugin' | 'skill' | 'agent' | 'mcpServer' | 'command' | 'hook' | 'bundle';
type CommandType = 'marketplace_add' | 'install' | 'bundle_copy';

export interface InstallCopyParams {
  kind:         EntityKind;
  name:         string;
  source:       string;
  command_type: CommandType;
}

export interface EntityOpenParams {
  kind:   EntityKind;
  name:   string;
  source: string;
}

export interface ShareCopyParams {
  kind:   EntityKind;
  name:   string;
  source: string;
}

export interface AppEvents {
  install_copy: InstallCopyParams;
  entity_open:  EntityOpenParams;
  share_copy:   ShareCopyParams;
}

export type AppEventName = keyof AppEvents;

// Distributive mapped type → proper discriminated union so TypeScript can
// narrow params by name: { name: 'install_copy'; params: InstallCopyParams }
//                       | { name: 'entity_open';  params: EntityOpenParams }
export type AnalyticsEvent = { [E in AppEventName]: { name: E; params: AppEvents[E] } }[AppEventName];
