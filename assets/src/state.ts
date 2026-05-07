import type { Plugin, Skill, Agent, McpServer, Command, Hook, Bundle } from './types.ts';

export interface AppState {
  plugins:          Plugin[];
  skills:           Skill[];
  agents:           Agent[];
  mcpServers:       McpServer[];
  commands:         Command[];
  hooks:            Hook[];
  bundles:          Bundle[];
  query:            string;
  activeCategories: Set<string>;
  activeRepos:      Set<string>;
  view:             string;
  sort:             'az' | 'za';
}

export const state: AppState = {
  plugins:          [],
  skills:           [],
  agents:           [],
  mcpServers:       [],
  commands:         [],
  hooks:            [],
  bundles:          [],
  query:            '',
  activeCategories: new Set(),
  activeRepos:      new Set(),
  view:             'plugins',
  sort:             'az',
};
