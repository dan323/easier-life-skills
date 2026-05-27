'use strict';

function nowTs() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `~${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;
}

function todayDate() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `~${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

module.exports = { nowTs, todayDate };
