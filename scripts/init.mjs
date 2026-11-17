#!/usr/bin/env node
/**
 * 博客系统初始化（手动部署用；用 Deploy to Cloudflare 按钮可以跳过本脚本）
 *
 * 依次做：
 *   1. 确认 wrangler 可用并已登录
 *   2. 创建 D1 / KV / R2（已存在则跳过）
 *   3. 把真实资源 ID 回写到根目录 wrangler.toml 的占位值
 *   4. 生成并写入 JWT_SECRET
 *   5. 对远程库执行迁移
 *
 * 用法：npm run init
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const configPath = path.join(rootDir, 'wrangler.toml');
const DB_PLACEHOLDER = '00000000-0000-0000-0000-000000000000';
const KV_PLACEHOLDER = '00000000000000000000000000000000';
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const HEX32_RE = /[0-9a-f]{32}/;
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(args, opts = {}) {
  return execFileSync(npx, ['wrangler', ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: opts.stdio ?? ['ignore', 'pipe', 'pipe'],
  });
}

function tryRun(args) {
  try {
    return run(args);
  } catch (error) {
    const out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    return `__FAILED__${out}`;
  }
}

function patchConfig(placeholder, real, note) {
  if (!existsSync(configPath)) return false;
  const src = readFileSync(configPath, 'utf8');
  if (!src.includes(placeholder)) return false;
  const updated = src.split(placeholder).join(real);
  writeFileSync(configPath, updated, 'utf8');
  console.log(`   已写入 ${note}`);
  return true;
}

console.log('🚀 开始初始化博客系统...\n');

// 1. wrangler 登录状态
try {
  run(['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
} catch {
  console.error('❌ 未找到 wrangler，请先执行：npm install');
  process.exit(1);
}

try {
  run(['whoami']);
} catch {
  console.log('📝 请先登录 Cloudflare 账号（会打开浏览器）...');
  execFileSync(npx, ['wrangler', 'login'], { cwd: rootDir, stdio: 'inherit' });
}

// 2. D1
console.log('💾 创建 D1 数据库 blog-db ...');
const dbOut = tryRun(['d1', 'create', 'blog-db']);
const dbId = UUID_RE.exec(dbOut)?.[0];
if (dbId) {
  console.log(`   已创建，database_id = ${dbId}`);
  patchConfig(DB_PLACEHOLDER, dbId, 'database_id');
} else {
  console.log(`   跳过（可能已存在）：${dbOut.split('\n').filter(Boolean).pop() ?? ''}`);
}

// 3. KV
console.log('🗄️  创建 KV 命名空间 blog-cache ...');
const kvOut = tryRun(['kv', 'namespace', 'create', 'blog-cache']);
let kvId = HEX32_RE.exec(kvOut)?.[0];
if (!kvId) {
  const listOut = tryRun(['kv', 'namespace', 'list']);
  const idx = listOut.indexOf('blog-cache');
  if (idx >= 0) kvId = HEX32_RE.exec(listOut.slice(idx))?.[0];
}
if (kvId) {
  console.log(`   已创建，id = ${kvId}`);
  patchConfig(KV_PLACEHOLDER, kvId, 'KV id');
} else {
  console.log(`   跳过（可能已存在）：${kvOut.split('\n').filter(Boolean).pop() ?? ''}`);
}

// 4. R2
console.log('📦 创建 R2 存储桶 blog-storage ...');
const r2Out = tryRun(['r2', 'bucket', 'create', 'blog-storage']);
console.log(`   ${r2Out.split('\n').filter(Boolean).pop() ?? '完成'}`);

// 5. JWT_SECRET
const jwtSecret = randomBytes(32).toString('base64');
console.log('\n🔑 生成并写入 JWT_SECRET ...');
execFileSync(npx, ['wrangler', 'secret', 'put', 'JWT_SECRET'], {
  cwd: rootDir,
  input: `${jwtSecret}\n`,
  stdio: ['pipe', 'inherit', 'inherit'],
});
console.log('   JWT_SECRET 已写入（值只存在于 Cloudflare，不落盘）');

// 6. 迁移
console.log('\n🔄 对远程库执行迁移 ...');
execFileSync(process.execPath, [path.join(scriptDir, 'migrate.mjs'), '--remote'], {
  cwd: rootDir,
  stdio: 'inherit',
});

console.log('\n✅ 初始化完成\n');
console.log('下一步：');
console.log('  1) 改 wrangler.toml 的 [vars]：FRONTEND_URL / STORAGE_PUBLIC_URL / RESEND_FROM_EMAIL');
console.log('  2) 需要邮件通知则：npx wrangler secret put RESEND_API_KEY');
console.log('  3) 部署：npm run deploy');
