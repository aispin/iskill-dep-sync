# iskill-utils

> **内部技能**：iskill 技能体系的内部基础设施，**普通用户不需要关注和安装**。
> 仅当某个 iskill 技能的 SKILL.md / README 要求「同时安装 iskill-utils」，
> 或你要创建新的 iskill 技能时才需要装。

iskill 技能体系的**工具箱**：依赖同步 + 技能脚手架 + 规范宿主。

**为什么需要**：体系里有三类一处编写、多处 vendor 的文件——QR 编码器（iskill-qrcode）、
二维码裁剪（iskill-crop-qrcode）、promo-page 落地页引擎三件套（iskill-promo-page，副本遍布
26 个仓库）。真源修复后副本静默过期，此前无任何检测手段。

**是什么**：单文件零依赖 Node CLI（`scripts/skill-deps.mjs`，Node ≥ 24），五条命令：

- `create` —— 按体系规范脚手架新技能（SKILL.md / README.md / package.json / scripts/ / docs/）
- `check` —— 三方（副本头/锁定/真源头）版本 + md5 比对，报告漂移；支持多仓库一起扫
- `sync` —— 按真源覆盖副本 + 回写锁定版本（本地真源优先，`--remote`/`--offline`/`--dry-run`）
- `env` —— 新机器冷启动自检：node/git/gh/agent-browser + 依赖技能是否已装，缺什么给安装命令
- `init` —— 扫描带 `@iskill-source` 戳的文件，反推生成 `package.json` 的 `iskillDeps`

**创建新技能**：对 agent 说「**请用 iskill-utils 创建技能 <名>，用来 <一句话>**」，
或 `node skill-deps.mjs create <name>`。

体系规范全文（命名/结构/SKILL.md 要求/真源机制/发布/技能清单）：[docs/SPEC.md](docs/SPEC.md)。

**怎么装**（面向 agent，推荐）：

在 agent 聊天窗口里说：

> 请帮我安装 Skill：aispin/iskill-utils

agent 会把仓库克隆进技能目录并验证可用。开发者手动安装（等效）：

```bash
git clone https://github.com/aispin/iskill-utils.git "$HOME/.workbuddy/skills/iskill-utils"
node ~/.workbuddy/skills/iskill-utils/scripts/skill-deps.mjs --help
```

> 运行环境：Node ≥ 24，零三方依赖。宿主技能根目录非 `~/.workbuddy/skills/` 时，设
> `ISKILL_SOURCE_HOME` 指向它（工具不绑定任何特定 agent 宿主）。

设计与背景详见 [docs/TECH-SPEC.md](docs/TECH-SPEC.md)；使用说明与 SOP 见
[SKILL.md](SKILL.md)。
