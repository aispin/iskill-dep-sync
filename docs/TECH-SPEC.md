# TECH SPEC · iskill 体系「共享代码唯一真源 + 依赖同步 + 技能自安装」

> 本文档是 iskill-dep-sync 的设计规格与背景记录。落地方案由用户于 2026-10-09 拍板。

## 1. 背景与问题

iskill 体系（`~/WorkBuddy/ISkills/` 下 29 个 `iskill-*` 技能，27 个独立 git 仓库，origin 均为
`github.com/aispin/iskill-*`）存在三类「一处编写、多处使用」的资产，此前全部靠**手动复制同步**：

| 组 | 文件 | 真源 | 副本分布 |
| --- | --- | --- | --- |
| 1 | `scripts/lib/qrcode.mjs`（零依赖 QR 编码器） | iskill-qrcode | iskill-generate-sponsors |
| 2 | `scripts/lib/qrcrop.mjs`（二维码定位裁剪） | iskill-crop-qrcode | iskill-generate-sponsors |
| 3 | promo-page 引擎三件套 `app.js / style.css / icons.js` | iskill-promo-page `templates/promo-page/assets/` | **26 个仓库**的 `promo-page/assets/`（落地页实例的 content.js / index.html 属各技能私有，不在共享范围） |

后果：真源修复后（如灯箱 bug、编码器格式位修正），所有 vendored 副本**静默过期**——没有任何
机制知道哪些仓库落后了；三组副本各自为政，口径分裂。

**存量可移植性缺口**（第二个动机）：以 iskill-promo-page 为例，新用户只装一个技能文件夹时——
- 核心生成（init.mjs）纯 Node 可用 ✅，产物 file:// 自包含 ✅
- 但赞助模块（需 iskill-generate-sponsors）、截图验收（需 iskill-ui-verify→agent-browser）、
  gh-pages 部署（需 git/gh）三条支线要么断、要么靠用户踩坑自救，SKILL.md 没有把依赖与装法写成
  agent 可照做的指令
- 脚本里埋着只在本机成立的写死值：node 版本路径、`/opt/homebrew/bin/gh`、本机代理
  `127.0.0.1:10080`、owner `aispin` / `aispin.github.io`

## 2. 目标（用户定调）

1. **唯一真源**：跨 skill 共享的文件有且只有一个真源仓库，副本可检测漂移、可一键同步。
2. **agent 自安装**：任何技能用户（通过 agent）装了 skill 本体后，能**自行安装该 skill 依赖的
   其他技能与环境工具**——不依赖 SkillHub 的依赖解析（SkillHub 是单文件夹复制，没有依赖机制）。
3. **保持零依赖哲学**：vendored 副本默认随 skill 走（单文件夹自包含、离线可跑）；工具本身零三方
   依赖；不做 npm 发布、不做 CI。

被否掉的方案：npm 发布 + workflow（SkillHub 分发不含 node_modules、沙箱 npm 痛苦）；运行时 GitHub
拉取（把网络依赖引进运行时，单独安装的 skill 会缺件）。

## 3. 机制设计

### 3.1 版本戳（唯一版本事实源）

真源与 vendored 副本**逐字节相同**（不变量 = md5 相同），戳在文件头只有一份：

```js
/**
 * @iskill-source iskill-qrcode/scripts/lib/qrcode.mjs
 * @iskill-version 1.0.0
 */
```

- `@iskill-source` = `<真源仓库名>/<仓库内路径>`；提取正则 `/@iskill-source\s+(\S+)/`。
- `@iskill-version` = semver；**改真源必须同 commit 升版本**（bug 升 patch、能力升 minor）。
- 真源仓库 package.json **不设** version 字段（避免双事实源）。
- CSS 文件用 `/* ... */` 注释包裹同样的两行。

### 3.2 package.json schema

真源方（`iskillShared`，自描述、无版本）；消费方（`iskillDeps`，声明 + 锁定）：

```jsonc
// 真源方（iskill-qrcode / iskill-crop-qrcode / iskill-promo-page）
{ "name": "iskill-qrcode", "private": true, "type": "module",
  "iskillShared": [ { "path": "scripts/lib/qrcode.mjs", "description": "零依赖 QR 编码器" } ] }

// 消费方（iskillDeps：skill/repo/path=真源坐标，version=锁定版本，local=副本路径）
{ "name": "iskill-generate-sponsors", "private": true, "type": "module",
  "iskillDeps": [
    { "skill": "iskill-qrcode", "repo": "aispin/iskill-qrcode",
      "path": "scripts/lib/qrcode.mjs", "version": "1.0.0", "local": "scripts/lib/qrcode.mjs" }
  ] }
```

`path` ≠ `local` 合法（promo-page 引擎：真源在 `templates/...`，副本在 `promo-page/assets/...`）。

### 3.3 skill-deps.mjs CLI

单文件零依赖（fs/path/crypto/fetch/AbortController），见 `scripts/skill-deps.mjs` 头注释。要点：

- **真源解析顺序**：`ISKILL_SOURCE_HOME` env → `~/.workbuddy/skills/<skill>/`（软链约定，
  realpath 解析）→ `<skillDir>/../<skill>/`（兄弟目录，覆盖任意平铺安装）→ GitHub raw
  `raw.githubusercontent.com/<owner>/<repo>/HEAD/<path>`（HEAD 跟随默认分支；8s 超时；
  sync 带 `?t=` 绕 raw 约 5 分钟的 HEAD 缓存）。本地命中即离线可用。
- **check**：三方（副本头 / 锁定 / 真源头）版本 + md5 比对 → `OK / MISSING / UNSTAMPED /
  LOCK-DRIFT / WARN（版本同内容异＝改了忘升版本）/ UPDATE / UNREACHABLE`；退出码 1=有漂移。
  支持多仓库一起扫（回答「模板改了哪些实例落后」）。
- **sync**：默认本地优先；`--remote` 强制 raw；`--offline` 禁网；`--dry-run` 只打印。
  写副本前校验拉回内容的 `@iskill-source` 自指戳（与声明不符即拒绝，防呆）；同步回写
  package.json 锁定版本；结束自动重跑 check。**只写 iskillDeps 清单内路径**，绝不碰实例私有文件。
- **env**（冷启动自检）：探测 node/git/gh/agent-browser + 依赖技能是否已装（软链/兄弟目录）；
  缺什么直接给**agent 可照做的安装命令**——技能缺失给
  `git clone https://github.com/aispin/<名>.git "$HOME/.workbuddy/skills/<名>"`，
  agent 读 SKILL.md 即会执行，这就是「技能自安装」的落地点（不需要 SkillHub 支持依赖解析）。
- **init**：扫描 skill 内带 `@iskill-source` 外源戳的文件，反推生成/合并 iskillDeps。

### 3.4 SKILL.md 双节约定

每个涉及共享资产的 skill，SKILL.md 增加固定两节（本仓库 SKILL.md 为标准范本）：

1. **「依赖同步」**：声明哪些文件是 vendored（**不要手改，去真源改+升版再回来 sync**）+ 自举代码块
   （本机无工具时 `curl raw → 临时目录 → 运行`，保证任何机器装了 skill 就能用 check/sync）。
2. **「依赖与自举」**（有环境/跨技能依赖的 skill）：逐项写明依赖什么、何时需要、如何探测、
   如何安装、缺失时如何降级。

### 3.5 存量可移植性修补（iskill-promo-page）

- SKILL.md 的 node 兜底路径写死版本号 → 改 `command -v node` 探测链
- deploy.sh 代理默认 `127.0.0.1:10080` → 默认空（不走代理），需用时 `GH_PROXY=` 显式给
- `GH_USER=aispin` / `aispin.github.io` / owner 写死 → 默认改空 + 报错提示（env/参数可覆盖）
- sync-shared.mjs 保留但标注 legacy，日常改指 skill-deps

## 4. 落地清单（2026-10-09 执行记录）

- 新仓库 `iskill-dep-sync`：SKILL.md / README.md / docs/TECH-SPEC.md / package.json /
  scripts/skill-deps.mjs；active 软链 `~/.workbuddy/skills/iskill-dep-sync`
- 真源打戳 v1.0.0：iskill-qrcode（qrcode.mjs）、iskill-crop-qrcode（qrcrop.mjs）、
  iskill-promo-page（引擎三件套）+ 各自 package.json（iskillShared）
- 消费方：26 个含 `promo-page/assets/` 引擎副本的仓库（含 iskill-promo-page 自身实例）+
  iskill-generate-sponsors（另含 qrcode.mjs / qrcrop.mjs）→ 全部 package.json（iskillDeps）+
  sync 写入带戳副本
- 验证回路：改乱副本 → check WARN(1) → sync → check OK(0)；真源升版 → check 出 UPDATE 清单 →
  sync 逐个升级；--remote / --offline；挪走软链后 raw 自举可用

## 5. 边界与非目标

- 不迁移既有先例：super-mark 运行时加载 media-transcribe、lang-scene-app vendor generative-bgm
  （性质不同且已工作良好）；今后新共享代码一律走本机制。
- 不做 CI 自动漂移提醒（本地 check 够用，27 仓库零 CI 是现状）。
- Windows 发布缺口（bash 脚本）不在本期；生成侧全部纯 Node 本就跨平台。
- raw 兜底要求真源仓库 public；私有仓只能走本地解析。
