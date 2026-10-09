# iskill-dep-sync

iskill 体系「共享代码唯一真源」的 check / sync / env 工具：零依赖（Node ≥ 18 标准库）单文件 CLI。
每个 skill 用 `package.json` 的 `iskillDeps` 声明自己 vendor 了谁的什么文件、锁定什么版本；
真源文件头部用 `@iskill-source` / `@iskill-version` 打戳；本工具比对三方（副本头 / 锁定 / 真源头）
版本与 md5，报告漂移并一键同步。设计与背景详见 `docs/TECH-SPEC.md`。

## 何时用

- 用户说「检查依赖漂移 / skill 依赖同步 / vendored 文件更新 / 共享代码升级」。
- 改了某技能的真源文件（如 iskill-promo-page 模板引擎、iskill-qrcode 编码器）后，要找出哪些存量实例落后并同步。
- 新机器上装了一个 skill，要自检环境与依赖技能是否齐全（冷启动）。

## 快速上手

```bash
T=~/.workbuddy/skills/iskill-dep-sync/scripts/skill-deps.mjs

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

克隆进 `~/.workbuddy/skills/` 即完成激活（WorkBuddy 按目录加载技能）。本机开发者惯例是
`~/.workbuddy/skills/<名>` 软链到 `~/WorkBuddy/ISkills/<名>` 的 git 仓库——两种形态本工具都认
（探测顺序：`ISKILL_SOURCE_HOME` env → `~/.workbuddy/skills/` → 兄弟目录 → GitHub raw 兜底）。

## 真源升版本 SOP

1. 在真源仓库改代码（如 `iskill-promo-page/templates/promo-page/assets/app.js`）；
2. **同一 commit** 里把文件头 `@iskill-version` 升号（bug 升 patch、加能力升 minor）；
3. commit + push 真源仓库；
4. `node $T check ~/WorkBuddy/ISkills/*` → 得到 `[UPDATE]` 实例清单；
5. 逐个 `node $T sync <实例仓库>`（会自动更新副本并回写锁定版本）；
6. 各实例仓库按其发布流程重新部署。

## 验收（改动本工具后必做）

```bash
# 漂移-恢复回路：人为改乱一个副本 → check 报 WARN（退出码 1）→ sync → check 全 OK
echo "// drift-test" >> ~/WorkBuddy/ISkills/iskill-generate-sponsors/scripts/lib/qrcode.mjs
node $T check ~/WorkBuddy/ISkills/iskill-generate-sponsors; echo "exit=$?"   # 期望 exit=1
node $T sync  ~/WorkBuddy/ISkills/iskill-generate-sponsors
node $T check ~/WorkBuddy/ISkills/iskill-generate-sponsors; echo "exit=$?"   # 期望 exit=0
```

## 边界

- 只管理 `iskillDeps` 声明过的文件；sync **绝不写**清单之外的路径（实例仓库的 content.js / index.html 等私有文件不受影响）。
- sync 前校验拉回内容的 `@iskill-source` 自指戳，与声明不符即拒绝（防呆）。
- 真源仓库需 public 才能被别人 raw 兜底；本机开发走软链/兄弟目录，零网络依赖。
- raw 对 HEAD 引用有约 5 分钟缓存，`sync` 已带 `?t=` 绕缓存；`check` 尊重缓存。
