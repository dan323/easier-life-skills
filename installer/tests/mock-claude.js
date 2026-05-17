#!/usr/bin/env node
// Minimal `claude` mock for installer tests.
// No imports — must be valid as both CJS and ESM.
const args = process.argv.slice(2);
const joined = args.join(' ');

if (joined === '--version') {
  process.stdout.write('claude 1.0.0-test\n');
  process.exit(0);
}

if (joined === 'plugin marketplace list --json') {
  process.stdout.write('[]\n');
  process.exit(0);
}

if (joined === 'plugin list --json') {
  const override = process.env.MOCK_CLAUDE_PLUGIN_LIST;
  process.stdout.write((override ?? JSON.stringify([
    { id: 'docs@easier-life-skills',       version: '1.0.1' },
    { id: 'code-audit@easier-life-skills', version: '2.0.0' },
    { id: 'unrelated@some-other-plugin',   version: '0.1.0' },
  ])) + '\n');
  process.exit(0);
}

// marketplace add, plugin install, plugin update — succeed silently
process.exit(0);
