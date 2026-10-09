# iskill 技能体系规范（SPEC）

> 本规范的事实源在本仓库（iskill-utils）。ISkills 工作区根 README 只留薄指引指向这里。
> 配套工具：`scripts/skill-deps.mjs`（check / sync / env / init / create）。

## 一、技能规范

### 1. 命名

- 统一 `iskill-` 前缀，且**四处一致**：GitHub 仓库名 / 本地 git 目录 / agent 技能目录（如
  `~/.workbuddy/skills/<名>`）/ `SKILL.md` 的 `name`（或一级标题）。
- 改名时四处（含 GitHub 仓库、全局配置文件）一齐迁移。
- 名字须为小写 kebab-case：`iskill-[a-z0-9-]+`。

### 2. 目录结构

```
iskill-<name>/
├── SKILL.md        # 技能入口（agent 读它决定怎么执行），含 YAML description（触发词）
├── README.md       # 面向人的说明 + 依赖同步提示
├── package.json    # 元信息 + iskillDeps / iskillShared（见「共享真源」）
├── scripts/        # 可执行脚本（零三方依赖，Node ≥ 24 标准库）
├── docs/           # 过程文档 / 技术规格（TECH-SPEC 等）
└── references/     # 参考资料（可选）
```

### 3. SKILL.md 要求

- `description:` 写清**何时触发**（触发词）与核心能力——这是 agent 路由的唯一依据；
- 有「**安装（AI skill）**」一节：面向 agent 为主（对 agent 说「请帮我安装 Skill：aispin/<名>」），
  开发者手动命令为辅；
- 声明了 `iskillDeps` 的技能必须有「**依赖同步**」一节（vendored 副本清单 + 同时安装
  iskill-utils 的提示词 + 自举命令）；
- 有外部工具 / 环境依赖的，写「**依赖与自举**」：依赖什么、何时需要、怎么探测、缺失时怎么
  安装或降级。

### 4. 依赖约定

- **零三方依赖**：脚本只用 Node ≥ 24 标准库；确需三方库放 `ISkills/deps/<库名>/`（不入技能仓库）。
- **安装即自包含**：skill 是单文件夹分发，装上就能用；跨技能依赖必须在 SKILL.md 写明，
  且 agent 可自行 `git clone` 安装缺失技能。

### 5. 共享真源机制（跨技能共享代码）

多处 vendor 的文件实行「**唯一真源 + vendored 副本**」，由本仓库的 skill-deps 统一管理：

- **真源文件**头部带戳：`@iskill-source <repo>/<path>` + `@iskill-version x.y.z`——
  版本唯一事实源在**文件头**（一个仓库可同时是多个文件的真源，各自独立演进；副本离开真源
  后靠戳自证身份）。**改真源必须同 commit 升版本**（bug 升 patch、加能力升 minor）。
- **真源方** `package.json` 用 `iskillShared` 自描述（不设 version 字段，防双事实源）。
- **消费方** `package.json` 用 `iskillDeps` 声明（skill / repo / path / 锁定 version / local 副本路径）。
- 工具：`node skill-deps.mjs check|sync|env|init ...`；本机无工具时按 SKILL.md 自举命令
  curl raw 现场拉取运行。
- **SOP**：改真源 → 升戳 → commit+push → `check` 全仓库 → 逐个 `sync` → 受影响实例重新部署。

### 6. 创建新技能（create）

对 agent 说：**「请用 iskill-utils 创建技能 <名>，用来 <一句话>」**，或直接：

```bash
node skill-deps.mjs create <name> [--dir <父目录>] [--description <一句话>]
```

自动生成符合本规范的骨架（SKILL.md / README.md / package.json / scripts/ / docs/），
agent 再按 TODO 提示填内容、写实现、发布。

### 7. 安装与发布

- 安装（agent）：对 agent 说「**请帮我安装 Skill：aispin/<名>**」——即 clone 进 agent 技能目录；
- 发布：`iskill-github-publisher` 统一建仓推送；对外展示用 `iskill-promo-page` 生成落地页
  （gh-pages 分支模式部署）；
- 隐私：提交一律用 GitHub noreply 邮箱 `85879+aispin@users.noreply.github.com`，作者名 `ZEO`。

## 二、技能清单（30 个）

> 2026-10-09 核实。公开仓 = `github.com/aispin/<名>`；🔒 = 私有仓（有意保密）。

| 技能 | 一句话 | 领域 |
| --- | --- | --- |
| iskill-app-icon | 网站/应用/PWA 图标与 favicon 生成 | 前端资产 |
| iskill-audio-verify | 网页音频播放的截图级验证与排查 | 调试验证 |
| iskill-build-books 🔒 | Markdown 小说目录一键变在线电子书 App（Vue3+PWA+BGM） | 内容工具 |
| iskill-content-precheck | 短视频文案发布前违禁词/敏感词预检与爆款评估 | 爆款短视频链路 |
| iskill-copy-deslop | 短视频口播稿去 AI 味、改口语、模拟观众反馈 | 爆款短视频链路 |
| iskill-crop-qrcode | 二维码自动定位裁剪（从海报抠纯码），QR 码眼真源 | 二维码族 |
| iskill-utils ⚙️ | 体系工具箱：依赖同步 + create 脚手架 + 本规范（内部技能，普通用户无需安装） | 基础设施 |
| iskill-dig-media | 视频/文案配素材：聚合图库 + AI 生成图片/视频 | 爆款短视频链路 |
| iskill-generate-sponsors | 给开源项目加赞赏/赞助模块（码卡+外链卡），promo-page 引擎消费方 | 前端资产 |
| iskill-generative-bgm | 纯前端 Web Audio 生成式 BGM（零素材、离线） | 前端资产 |
| iskill-geometric-bg | 种子随机的几何背景/纹理/hero 底图 SVG 生成 | 前端资产 |
| iskill-github-publisher | 本地 skill 发布到 GitHub 并准备 SkillHub 认领 | 基础设施 |
| iskill-headroom-workbuddy2api | 把 WorkBuddy 内置模型接成 OpenAI 兼容 API（hub+headroom） | 基础设施 |
| iskill-hot-topic-scout | 短视频热点选题、每日选题清单 | 爆款短视频链路 |
| iskill-huggingface-ext | HuggingFace 缓存目录迁移 + 软链（释放系统盘） | 开发者工具 |
| iskill-lang-scene-app 🔒 | 每日场景对话语言学习 App（React+PWA+真人语音） | 内容工具 |
| iskill-media-transcribe | 视频/音频批量转 mp3 + 带时间戳字幕 | 内容工具 |
| iskill-music-beats | 音乐节拍/BPM 分析，供卡点剪辑对齐转场 | 爆款短视频链路 |
| iskill-pipeline-dashboard | 通用工作流可视化操盘台（底层技能，不直接暴露） | 基础设施 |
| iskill-promo-page | skill/工具/开源项目落地页生成器，引擎三件套真源 | 前端资产 |
| iskill-pwa-guideline | PWA 标准化最佳实践（Manifest/图标/离线/更新） | 前端资产 |
| iskill-qrcode | 二维码生成（5 风格 SVG）+ 解码 CLI，QR 编码器真源 | 二维码族 |
| iskill-script-launcher | 「双击就能跑」的跨平台脚本与启停器 | 开发者工具 |
| iskill-super-mark | 微信收藏内容变可检索分类的个人收藏册 | 内容工具 |
| iskill-ui-verify | agent 的截图验证 / UI 验收 / 视觉回归 | 调试验证 |
| iskill-video-clipper | 实拍素材短视频剪辑（15-60s 成片/剪映草稿） | 爆款短视频链路 |
| iskill-viral-copywriter | 短视频口播稿/带货文案生成（多平台四套） | 爆款短视频链路 |
| iskill-viral-teardown | 爆款短视频拆解分析、找对标 | 爆款短视频链路 |
| iskill-webgl-scene-probe | WebGL/three.js/R3F 应用内部状态验证排查 | 调试验证 |
| iskill-workbuddy-deepseek | 同步 DeepSeek 网页版对话给 agent 继续执行 | 基础设施 |

## 三、共享真源速查

| 真源文件（`@iskill-version`） | 真源仓库 | 消费方 |
| --- | --- | --- |
| `scripts/lib/qrcode.mjs` | iskill-qrcode | iskill-generate-sponsors |
| `scripts/lib/qrcrop.mjs` | iskill-crop-qrcode | iskill-generate-sponsors |
| `templates/promo-page/assets/{app.js,style.css,icons.js}` | iskill-promo-page | 25 个实例仓库（各技能 `promo-page/assets/`） |

消费方在各自 `package.json` 的 `iskillDeps` 声明锁定版本；同步与漂移检测见各技能
SKILL.md「依赖同步」节，工具与 SOP 见本仓库 SKILL.md。
