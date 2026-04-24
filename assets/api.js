/* api.js — fetches a skills_index.json from any GitHub repo */

const RAW_BASE = 'https://raw.githubusercontent.com';
const BRANCH   = 'master';

export async function fetchIndex(ownerRepo) {
  const url = `${RAW_BASE}/${ownerRepo}/${BRANCH}/skills_index.json`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} — could not load skills_index.json from ${ownerRepo}`);
  return res.json();
}
