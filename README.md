# iskill-dep-sync

iskill 技能体系的「共享代码唯一真源」同步工具。

**为什么需要**：体系里有三类一处编写、多处 vendor 的文件——QR 编码器（iskill-qrcode）、
二维码裁剪（iskill-crop-qrcode）、promo-page 落地页引擎三件套（iskill-promo-page，副本遍布
26 个仓库）。真源修复后副本静默过期，此前无任何检测手段。

**是什么**：单文件零依赖 Node CLI（`scripts/skill-deps.mjs`），四条命令：

- `check` —— 三方（副本头/锁定/真源头）版本 + md5 比对，报告漂移；支持多仓库一起扫
- `sync` —— 按真源覆盖副本 + 回写锁定版本（本地真源优先，`--remote`/`--offline`/`--dry-run`）
- `env` —— 新机器冷启动自检：node/git/gh/agent-browser + 依赖技能是否已装，缺什么给安装命令
- `init` —— 扫描带 `@iskill-source` 戳的文件，反推生成 `package.json` 的 `iskillDeps`

**怎么装**：

```bash
git clone https://github.com/aispin/iskill-dep-sync.git "$HOME/.workbuddy/skills/iskill-dep-sync"
node ~/.workbuddy/skills/iskill-dep-sync/scripts/skill-deps.mjs --help
```

设计与背景详见 [docs/TECH-SPEC.md](docs/TECH-SPEC.md)；使用说明与 SOP 见
[SKILL.md](SKILL.md)。
