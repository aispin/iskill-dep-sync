# iskill-utils

> **内部技能**：本工具是 iskill 技能体系的内部基础设施（依赖同步 + 技能脚手架 + 规范宿主）；
> **普通用户不需要关注和安装**。只有当某个 iskill 技能的文档让你「同时安装 iskill-utils」、
> 或你要「创建新的 iskill 技能」时才需要装。

iskill 体系工具箱，零依赖（Node ≥ 24 标准库）单文件 CLI（`scripts/skill-deps.mjs`），五条命令：

- `create` —— 按 [docs/SPEC.md](docs/SPEC.md) 规范脚手架新技能（SKILL/README/package.json/scripts/docs）
- `check` —— 共享真源三方（副本头/锁定/真源头）版本 + md5 比对，报告漂移；支持多仓库一起扫
- `sync` —— 按真源覆盖副本 + 回写锁定版本（本地真源优先，`--remote`/`--offline`/`--dry-run`）
- `env` —— 新机器冷启动自检：node/git/gh/agent-browser + 依赖技能是否已装，缺什么给安装命令
- `init` —— 扫描带 `@iskill-source` 戳的文件，反推生成 `package.json` 的 `iskillDeps`

体系规范（命名/结构/SKILL.md 要求/真源机制/发布）的事实源在本仓库 **[docs/SPEC.md](docs/SPEC.md)**。

## 何时用

- 用户要「创建一个新的 iskill 技能 / 新 skill 脚手架」→ `create`（对 agent 说「请用 iskill-utils 创建技能 <名>」）。
- 用户说「检查依赖漂移 / skill 依赖同步 / vendored 文件更新 / 共享代码升级」→ `check` / `sync`。
- 改了某技能的真源文件（如 iskill-promo-page 模板引擎、iskill-qrcode 编码器）后，要找出哪些存量实例落后并同步。
- 新机器上装了一个 skill，要自检环境与依赖技能是否齐全（冷启动）→ `env`。

## 快速上手

```bash
T=~/.workbuddy/skills/iskill-utils/scripts/skill-deps.mjs

# 创建新技能（按规范生成骨架，agent 再填内容）
node $T create my-thing --dir /path/to/workspace --description "一句话：何时用+做什么"

# 漂移检测：单仓 / 多仓一起扫（check 可回答「模板改了哪些实例落后」）
node $T check /path/to/iskill-generate-sponsors
node $T check /Users/lv/WorkBuddy/ISkills/*

# 同步副本 + 回写锁定版本（默认本地真源优先）
node $T sync /path/to/iskill-generate-sponsors
node $T sync /path/to/iskill-generate-sponsors --remote    # 强制走 GitHub raw
node $T sync /path/to/iskill-generate-sponsors --offline   # 断网时只允许本地真源
node $T sync ... --dry-run                                  # 只打印不变更

# 冷启动自检：node/git/gh/agent-browser + 依赖技能是否已装，缺什么给安装命令
node $T env /path/to/any-skill

# 扫描某 skill 里带 @iskill-source 外源戳的文件，反推生成/合并 iskillDeps
node $T init /path/to/some-skill
```

## check 状态含义

| 状态 | 含义 | 处置 |
| --- | --- | --- |
| `OK` | 三方版本一致且内容一致 | 无 |
| `MISSING` | 副本缺失 | `sync` 恢复 |
| `UNSTAMPED` | 副本无戳（手改/旧副本） | `sync` 恢复 |
| `LOCK-DRIFT` | 副本头版本 ≠ package.json 锁定版本 | `sync` 修正 |
| `WARN` | 三方版本相同但内容不同 | **有人改了副本或真源但没升版本**——去真源改并升 `@iskill-version`，再 `sync` |
| `UPDATE` | 真源版本 > 锁定 | `sync` 升级 |
| `UNREACHABLE` | 本地与 raw 都取不到真源 | 查网络 / 真源仓库是否 public |

退出码：0 = 全部一致；1 = 有漂移；2 = 用法/解析错误。

## 依赖技能未装？agent 自行安装

`env` 报某依赖技能缺失时，agent/用户直接执行它给出的安装命令即可：

```bash
git clone https://github.com/aispin/<技能名>.git "$HOME/.workbuddy/skills/<技能名>"
```

克隆进技能目录即完成激活（agent 宿主按目录加载技能；若你的宿主技能根目录不是
`~/.workbuddy/skills/`，设 `ISKILL_SOURCE_HOME` 指向它即可，工具探测顺序：
`ISKILL_SOURCE_HOME` → `~/.workbuddy/skills/` → 兄弟目录 → GitHub raw 兜底）。
本机开发者惯例是 `~/.workbuddy/skills/<名>` 软链到 `~/WorkBuddy/ISkills/<名>` 的 git 仓库——
两种形态本工具都认。

## 安装（AI skill）

对 agent 说：**请帮我安装 Skill：aispin/iskill-utils**

开发者手动安装（等效）：

```bash
git clone https://github.com/aispin/iskill-utils.git "$HOME/.workbuddy/skills/iskill-utils"
node ~/.workbuddy/skills/iskill-utils/scripts/skill-deps.mjs --help
```

## 真源升版本 SOP

1. 在真源仓库改代码（如 `iskill-promo-page/templates/promo-page/assets/app.js`）；
2. **同一 commit** 里把文件头 `@iskill-version` 升号（bug 升 patch、加能力升 minor）；
3. commit + push 真源仓库；
4. `node $T check ~/WorkBuddy/ISkills/*` → 得到 `[UPDATE]` 实例清单；
5. 逐个 `node $T sync <实例仓库>`（会自动更新副本并回写锁定版本）；
6. 各实例仓库按其发布流程重新部署。

## 验收（改动本工具后必做）

```bash
# create：临时目录脚手架一个技能，检查四件套齐全
node $T create demo --dir /tmp/iskill-create-test && find /tmp/iskill-create-test -type f

# 漂移-恢复回路：人为改乱一个副本 → check 报 WARN（退出码 1）→ sync → check 全 OK
echo "// drift-test" >> ~/WorkBuddy/ISkills/iskill-generate-sponsors/scripts/lib/qrcode.mjs
node $T check ~/WorkBuddy/ISkills/iskill-generate-sponsors; echo "exit=$?"   # 期望 exit=1
node $T sync  ~/WorkBuddy/ISkills/iskill-generate-sponsors
node $T check ~/WorkBuddy/ISkills/iskill-generate-sponsors; echo "exit=$?"   # 期望 exit=0
```

## 边界

- `sync` 只管理 `iskillDeps` 声明过的文件，**绝不写**清单之外的路径（实例仓库的
  content.js / index.html 等私有文件不受影响）；sync 前校验拉回内容的 `@iskill-source`
  自指戳，与声明不符即拒绝（防呆）。
- `create` 只在目标父目录下新建 `iskill-<name>/`，已存在同名目录即拒绝；不碰其他路径。
- 真源仓库需 public 才能被别人 raw 兜底；本机开发走软链/兄弟目录，零网络依赖。
- raw 对 HEAD 引用有约 5 分钟缓存，`sync` 已带 `?t=` 绕缓存；`check` 尊重缓存。
