#!/usr/bin/env node
/**
 * iskill-dep-sync · skill-deps.mjs —— iskill 体系共享代码 check/sync/env 工具
 * ---------------------------------------------------------------------------
 * 零三方依赖（Node ≥ 24 标准库）。设计文档：本仓库 docs/TECH-SPEC.md。
 *
 * 机制一句话：每个 skill 的 package.json 用 iskillDeps 声明「我 vendor 了谁的
 * 什么文件、锁定什么版本」；真源文件头部用 @iskill-source/@iskill-version 打戳；
 * 本工具比对三方（副本头 / 锁定 / 真源头）版本与 md5，报告漂移并一键同步。
 *
 * 用法：
 *   node skill-deps.mjs check  [skillDir...]          # 漂移检测（可多个仓库一起扫）
 *   node skill-deps.mjs sync   [skillDir...] [选项]    # 同步副本 + 回写锁定版本
 *   node skill-deps.mjs env    [skillDir]             # 冷启动自检：缺什么工具/技能，给安装命令
 *   node skill-deps.mjs init   <skillDir>             # 扫描带戳文件，反推生成 iskillDeps
 *
 * sync 选项：--remote 强制走 GitHub raw；--offline 只允许本地真源；--dry-run 只打印。
 * check 选项：--offline 不访问网络（取不到本地真源的条目报 UNREACHABLE）。
 *
 * 真源解析顺序（每条依赖）：ISKILL_SOURCE_HOME env → ~/.workbuddy/skills/<skill>/
 * → <skillDir>/../<skill>/ → GitHub raw（HEAD 分支）。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

// ────────────────────────────────────────────────────────────── 常量与工具

const STAMP_SOURCE = /@iskill-source\s+(\S+)/;
const STAMP_VERSION = /@iskill-version\s+(\d+\.\d+\.\d+)/;
const FETCH_TIMEOUT_MS = 8000;

const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const semverCmp = (a, b) => {
  const [x, y] = [a, b].map(v => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return Math.sign((x[i] || 0) - (y[i] || 0));
  return 0;
};
const normRepo = r => String(r || '').replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
const rel = p => { try { return path.relative(process.cwd(), p) || '.'; } catch { return p; } };

function die(msg, code = 2) { console.error(`✗ ${msg}`); process.exit(code); }

function parseArgs(argv) {
  const flags = new Set(); const dirs = [];
  for (const a of argv) {
    if (a.startsWith('--')) flags.add(a);
    else dirs.push(a);
  }
  return { flags, dirs };
}

/** 从 skillDir 向上找含 package.json 的目录（最多 5 层） */
function findSkillDir(start) {
  let d = path.resolve(start);
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(d, 'package.json'))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}

function readDeps(skillDir) {
  const pkgPath = path.join(skillDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return { pkgPath, deps: [] };
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); }
  catch (e) { die(`package.json 解析失败：${rel(pkgPath)}（${e.message}）`); }
  return { pkgPath, deps: Array.isArray(pkg.iskillDeps) ? pkg.iskillDeps : [] };
}

// ────────────────────────────────────────────────────────────── 真源解析

/** 按解析顺序找本地真源；返回 {file} 或 null */
function resolveLocalSource(dep, skillDir) {
  const candidates = [];
  if (process.env.ISKILL_SOURCE_HOME) candidates.push(path.join(process.env.ISKILL_SOURCE_HOME, dep.skill));
  candidates.push(path.join(os.homedir(), '.workbuddy', 'skills', dep.skill));
  if (skillDir) candidates.push(path.join(path.dirname(path.resolve(skillDir)), dep.skill));
  for (const base of candidates) {
    const f = path.join(base, dep.path || '.');
    try {
      // realpath 解软链后仍要求存在（软链断了视同缺失）；path 为空 = 只探技能目录本身
      fs.realpathSync(f);
      const st = fs.statSync(f);
      if (dep.path ? st.isFile() : st.isDirectory()) return { file: f };
    } catch { /* 下一个候选 */ }
  }
  return null;
}

async function fetchRaw(repo, p, bust) {
  const url = `https://raw.githubusercontent.com/${repo}/HEAD/${p}${bust ? `?t=${Date.now()}` : ''}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}

/** 取真源内容：返回 {kind:'local', file, text} | {kind:'raw', text} | {kind:'none', why} */
async function getSource(dep, skillDir, { remote = false, offline = false, bust = false } = {}) {
  if (!remote) {
    const hit = resolveLocalSource(dep, skillDir);
    if (hit) return { kind: 'local', file: hit.file, text: fs.readFileSync(hit.file, 'utf8') };
    if (offline) return { kind: 'none', why: '本地无真源且 --offline 禁网' };
  }
  const repo = normRepo(dep.repo) || `aispin/${dep.skill}`;
  try {
    const text = await fetchRaw(repo, dep.path, bust);
    return { kind: 'raw', text };
  } catch (e) {
    if (remote) return { kind: 'none', why: `raw 拉取失败（${e.message}）；可用 --offline 仅同步本地真源，或稍后重试` };
    return { kind: 'none', why: `本地与 raw 均不可达（${e.message}）` };
  }
}

// ────────────────────────────────────────────────────────────── check

async function checkOne(dep, skillDir, opts, idx) {
  const tag = `[${idx + 1}]`;
  const localPath = path.join(skillDir, dep.local);
  const bad = (status, detail) => console.log(`  ${tag} [${status}] ${dep.local} ← ${dep.skill}/${dep.path}${detail ? `\n        ${detail}` : ''}`);

  let copyText;
  try { copyText = fs.readFileSync(localPath, 'utf8'); }
  catch { return bad('MISSING', '副本缺失，跑 sync 恢复'); }

  const copyStamp = stampInfo(copyText);
  if (!copyStamp) return bad('UNSTAMPED', '副本无 @iskill-source 戳（可能是手改/旧副本），跑 sync 恢复');
  if (copyStamp.source !== `${dep.skill}/${dep.path}`)
    return bad('LOCK-DRIFT', `副本戳指向 ${copyStamp.source}，与声明 ${dep.skill}/${dep.path} 不符`);

  if (copyStamp.version !== dep.version)
    return bad('LOCK-DRIFT', `副本头版本 ${copyStamp.version} ≠ 锁定 ${dep.version}，跑 sync 修正`);

  const src = await getSource(dep, skillDir, opts);
  if (src.kind === 'none') return bad('UNREACHABLE', src.why);
  const srcStamp = stampInfo(src.text);
  if (!srcStamp) return bad('UNREACHABLE', '真源未打戳（@iskill-source/@iskill-version），先给真源补戳');

  const where = src.kind === 'local' ? rel(src.file) : 'GitHub raw';
  if (semverCmp(srcStamp.version, dep.version) > 0)
    return bad('UPDATE', `真源 ${srcStamp.version}（${where}）> 锁定 ${dep.version}，跑 sync 升级`);
  if (semverCmp(srcStamp.version, dep.version) < 0)
    return bad('LOCK-DRIFT', `真源 ${srcStamp.version}（${where}）< 锁定 ${dep.version}？检查是不是锁错了版本`);

  if (md5(src.text) !== md5(copyText))
    return bad('WARN', `三方版本同为 ${dep.version} 但内容不同（真源：${where}）——改了忘升版本！去真源仓库改代码并升 @iskill-version，再回来 sync`);

  console.log(`  ${tag} [OK] ${dep.local} ← ${dep.skill}/${dep.path}@${dep.version}（真源：${where}）`);
  return true;
}

async function cmdCheck(dirs, flags) {
  const opts = { offline: flags.has('--offline') };
  const targets = expandTargets(dirs);
  if (!targets.length) die('未找到含 iskillDeps 的 package.json（在目标目录及其上层找过了）');
  let drift = 0; let total = 0;
  for (const dir of targets) {
    const { deps } = readDeps(dir);
    console.log(`□ ${rel(dir)}（${deps.length} 条依赖）`);
    for (let i = 0; i < deps.length; i++) {
      total++;
      const ok = await checkOne(deps[i], dir, opts, i);
      if (!ok) drift++;
    }
  }
  console.log(drift ? `\n✗ ${drift}/${total} 条依赖有漂移（退出码 1）` : `\n✓ ${total}/${total} 条依赖全部一致`);
  process.exit(drift ? 1 : 0);
}

/** dirs 为空 → cwd 向上找；否则逐个解析 */
function expandTargets(dirs) {
  const list = dirs.length ? dirs : ['.'];
  const out = [];
  for (const d of list) {
    const found = findSkillDir(d);
    if (found && !out.includes(found)) out.push(found);
    else if (!found) console.error(`⚠ 跳过（找不到 package.json）：${d}`);
  }
  return out;
}

// ────────────────────────────────────────────────────────────── sync

async function cmdSync(dirs, flags) {
  const opts = { remote: flags.has('--remote'), offline: flags.has('--offline'), bust: true };
  if (opts.remote && opts.offline) die('--remote 与 --offline 互斥');
  const dry = flags.has('--dry-run');
  const targets = expandTargets(dirs);
  if (!targets.length) die('未找到含 iskillDeps 的 package.json');
  let changed = 0; let total = 0;

  for (const dir of targets) {
    const { pkgPath, deps } = readDeps(dir);
    if (!deps.length) { console.log(`□ ${rel(dir)}：无 iskillDeps，跳过`); continue; }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    let dirty = false;
    console.log(`□ ${rel(dir)}`);

    for (const dep of deps) {
      total++;
      const localPath = path.join(dir, dep.local);
      const src = await getSource(dep, dir, opts);
      if (src.kind === 'none') { console.log(`  [SKIP] ${dep.local}：${src.why}`); continue; }
      const stamp = stampInfo(src.text);
      if (!stamp) { console.log(`  [SKIP] ${dep.local}：真源未打戳，拒绝同步（先给真源补戳）`); continue; }
      if (stamp.source !== `${dep.skill}/${dep.path}`) {
        console.log(`  [SKIP] ${dep.local}：真源自指戳 ${stamp.source} ≠ 声明 ${dep.skill}/${dep.path}，拒绝同步（防呆）`);
        continue;
      }
      const same = fs.existsSync(localPath) && md5(fs.readFileSync(localPath, 'utf8')) === md5(src.text)
        && stamp.version === dep.version;
      if (same) { console.log(`  [OK] ${dep.local}@${dep.version}（已是最新）`); continue; }

      const where = src.kind === 'local' ? rel(src.file) : 'GitHub raw';
      console.log(`  [SYNC] ${dep.local}  ${dep.version} → ${stamp.version}（真源：${where}）${dry ? '（dry-run）' : ''}`);
      if (dry) { changed++; continue; }
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, src.text);
      dep.version = stamp.version;
      dirty = true; changed++;
    }

    if (dirty && !dry) {
      pkg.iskillDeps = deps;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    }
  }
  console.log(dry ? `\n（dry-run）将变更 ${changed} 个文件` : `\n✓ 同步完成：${changed} 个文件变更`);
  if (!dry && changed) {
    console.log('— 复核 —');
    await cmdCheck(dirs, new Set());
  }
}

// ────────────────────────────────────────────────────────────── env（冷启动自检）

function hasBin(bin, args = ['--version']) {
  try { execFileSync(bin, args, { stdio: 'pipe' }); return true; } catch { return false; }
}

function findAgentBrowser() {
  if (hasBin('agent-browser')) return 'PATH';
  const patterns = [
    path.join(os.homedir(), 'WorkBuddy/ISkills/deps/agent-browser/node_modules/.bin/agent-browser'),
  ];
  for (const f of patterns) if (fs.existsSync(f)) return f;
  const base = path.join(os.homedir(), '.workbuddy/binaries/node/versions');
  try {
    for (const v of fs.readdirSync(base)) {
      const f = path.join(base, v, 'bin/agent-browser');
      if (fs.existsSync(f)) return f;
    }
  } catch { /* 目录不存在 */ }
  return null;
}

function cmdEnv(dirs) {
  const dir = expandTargets(dirs.slice(0, 1))[0] || path.resolve(dirs[0] || '.');
  console.log(`□ 环境自检：${rel(dir)}`);
  const rows = [];
  const nodeOk = process.version;
  rows.push(['node', nodeOk, '（本工具运行即已具备）']);
  rows.push(['git', hasBin('git') ? '✓' : null, 'macOS: xcode-select --install；或 https://git-scm.com']);
  rows.push(['gh', hasBin('gh') ? '✓' : null, 'brew install gh && gh auth login（仅部署 GitHub Pages 需要）']);
  const ab = findAgentBrowser();
  rows.push(['agent-browser', ab ? (ab === 'PATH' ? '✓ (PATH)' : `✓ (${rel(ab)})`) : null,
    'npm i -g agent-browser && agent-browser install（仅截图/样本需要）']);

  for (const [name, ok, hint] of rows)
    console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(14)} ${ok || hint}`);

  const { deps } = readDeps(dir);
  const skills = [...new Set(deps.map(d => d.skill))];
  if (skills.length) console.log(`  依赖技能（${skills.length}）：`);
  for (const s of skills) {
    const hit = resolveLocalSource({ skill: s, path: '' }, dir);
    if (hit) console.log(`    ✓ ${s}  (${rel(path.dirname(hit.file))})`);
    else {
      console.log(`    ✗ ${s}  未安装`);
      console.log(`        安装：git clone https://github.com/aispin/${s}.git "$HOME/.workbuddy/skills/${s}"`);
    }
  }
  const missing = rows.filter(r => !r[1]).length
    + skills.filter(s => !resolveLocalSource({ skill: s, path: '' }, dir)).length;
  console.log(missing ? `\n✗ ${missing} 项缺失，按上方提示安装后重跑` : '\n✓ 环境完备');
  process.exit(missing ? 1 : 0);
}

// ────────────────────────────────────────────────────────────── init

function* walk(dir, skip = new Set(['.git', 'node_modules', '.workbuddy'])) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (skip.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p, skip);
    else if (/\.(mjs|js|css)$/.test(e.name)) yield p;
  }
}

function cmdInit(dirs) {
  const dir = path.resolve(dirs[0] || '.');
  const selfName = path.basename(dir);
  const found = new Map(); // source → {version, local}
  for (const f of walk(dir)) {
    const text = fs.readFileSync(f, 'utf8');
    const m = text.match(STAMP_SOURCE);
    if (!m) continue;
    const src = m[1];
    const v = (text.match(STAMP_VERSION) || [])[1];
    if (!v) { console.error(`⚠ 有 @iskill-source 但无版本戳，跳过：${rel(f)}`); continue; }
    const [srcSkill, ...rest] = src.split('/');
    if (srcSkill === selfName) continue; // 自己就是真源，不进 iskillDeps
    found.set(src, { srcSkill, srcPath: rest.join('/'), version: v, local: path.relative(dir, f) });
  }
  if (!found.size) { console.log('未发现带 @iskill-source 外源戳的文件；若真源还没打戳，先去真源补戳。'); return; }

  const deps = [...found.values()].map(x => ({
    skill: x.srcSkill, repo: `aispin/${x.srcSkill}`, path: x.srcPath,
    version: x.version, local: x.local.split(path.sep).join('/'),
  }));

  const pkgPath = path.join(dir, 'package.json');
  let pkg = { name: selfName, private: true, type: 'module' };
  if (fs.existsSync(pkgPath)) {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    console.log(`合并进现有 ${rel(pkgPath)}（不动 iskillDeps 之外的字段）`);
  } else {
    console.log(`新建 ${rel(pkgPath)}`);
  }
  pkg.iskillDeps = deps;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`✓ 写入 ${deps.length} 条 iskillDeps：`);
  for (const d of deps) console.log(`    ${d.local} ← ${d.skill}/${d.path}@${d.version}`);
  console.log('下一步：node skill-deps.mjs sync ' + dir + ' && node skill-deps.mjs check ' + dir);
}

// ────────────────────────────────────────────────────────────── 入口

function stampInfo(text) {
  const s = (text.match(STAMP_SOURCE) || [])[1];
  const v = (text.match(STAMP_VERSION) || [])[1];
  return s && v ? { source: s, version: v } : null;
}

const [cmd, ...rest] = process.argv.slice(2);
const { flags, dirs } = parseArgs(rest);
switch (cmd) {
  case 'check': await cmdCheck(dirs, flags); break;
  case 'sync': await cmdSync(dirs, flags); break;
  case 'env': cmdEnv(dirs); break;
  case 'init': cmdInit(dirs); break;
  default:
    console.log(fs.readFileSync(new URL(import.meta.url)).toString().match(/\/\*\*[\s\S]*?\*\//)[0]
      .replace(/^\/\*\*|\*\/$|^\s*\* ?/gm, '').trim());
}
