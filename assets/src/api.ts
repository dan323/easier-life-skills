import type { SkillsIndex } from './types.ts';

const RAW_BASE = 'https://raw.githubusercontent.com';
const BRANCH   = 'master';

export async function fetchIndex(ownerRepo: string, builtin = false): Promise<SkillsIndex> {
  if (builtin && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    const res = await fetch('/skills_index.json');
    if (res.ok) return res.json() as Promise<SkillsIndex>;
  } else if (builtin && window.location.hostname === 'dan323.github.io') {
    const res = await fetch('/easier-life-skills/skills_index.json');
    if (res.ok) return res.json() as Promise<SkillsIndex>;
  }
  const url = `${RAW_BASE}/${ownerRepo}/${BRANCH}/skills_index.json`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} — could not load skills_index.json from ${ownerRepo}`);
  return res.json() as Promise<SkillsIndex>;
}
