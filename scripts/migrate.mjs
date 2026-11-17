#!/usr/bin/env node
/**
 * 数据库迁移（幂等重放）
 *
 * 依次执行 database/ 下三个 schema 文件。所有语句都是幂等写法
 * （IF NOT EXISTS / INSERT OR IGNORE / INSERT OR REPLACE），可安全重复执行。
 *
 * 用法：
 *   node scripts/migrate.mjs              # 本地 D1
 *   node scripts/migrate.mjs --remote     # 远程(生产) D1
 *   node scripts/migrate.mjs --remote --db CUSTOM   # 指定其他 binding（默认 DB）
 *
 * 用 binding 名（DB）而不是数据库名，这样一键部署时 Cloudflare 按你填的
 * 库名创建的数据库也能正常迁移。
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const dbDir = path.join(rootDir, 'database');
const configPath = path.join(rootDir, 'wrangler.toml');

const SQL_FILES = [
  'schema-v1.1-base.sql',
  'schema-v1.3-notification-messaging.sql',
  'schema-v1.4-refresh-tokens.sql',
];

let remote = false;
let binding = 'DB';
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '--remote') remote = true;
  else if (arg === '--local') remote = false;
  else if (arg === '--db') binding = argv[++i] ?? binding;
  else if (arg.startsWith('--db=')) binding = arg.slice(5);
  else if (!arg.startsWith('--')) binding = arg;
}

if (!existsSync(configPath)) {
  console.error(`❌ 找不到配置文件：${configPath}`);
  process.exit(1);
}

const target = remote ? '远程(生产)' : '本地';
console.log(`🔄 运行数据库迁移 [${target}]...`);
console.log(`📦 目标 binding: ${binding}`);

// Windows 上 Node 无法直接执行 npx.cmd，优先用本地 node_modules 里的 wrangler 入口
const wranglerEntry = path.join(rootDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const hasLocalWrangler = existsSync(wranglerEntry);

function runWrangler(args, opts = {}) {
  const common = { stdio: 'inherit', cwd: rootDir, ...opts };
  if (hasLocalWrangler) {
    return execFileSync(process.execPath, [wranglerEntry, ...args], common);
  }
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return execFileSync(npx, ['wrangler', ...args], { ...common, shell: process.platform === 'win32' });
}

for (const file of SQL_FILES) {
  const filePath = path.join(dbDir, file);
  if (!existsSync(filePath)) {
    console.error(`❌ 缺少 schema 文件：${filePath}`);
    process.exit(1);
  }
  console.log(`📝 执行 ${file} ...`);
  runWrangler([
    'd1',
    'execute',
    binding,
    ...(remote ? ['--remote'] : []),
    '--config',
    configPath,
    '--file',
    filePath,
    '--yes',
  ]);
}

console.log('✅ 迁移完成!');
