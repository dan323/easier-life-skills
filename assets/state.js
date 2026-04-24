/* state.js — shared mutable state for the catalog */

export const state = {
  skills:           [],   // all loaded skills across all repos
  bundles:          [],   // all loaded bundles across all repos
  query:            '',
  activeCategories: new Set(),
  view:             'skills',   // 'skills' | 'bundles'
};
