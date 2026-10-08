# 玻璃实验室 GlassLab

Kyant0/AndroidLiquidGlass（Apache-2.0）液态玻璃算法的 **Web 移植与实时调参实验室**。
上游 AGSL 着色器被逐式移植为 canvas 位移贴图 + SVG 滤镜链（feImage → feDisplacementMap ×3 光谱色散 → feGaussianBlur → feColorMatrix），配合菲涅尔边缘高光，可在浏览器中实时折射/调参/保存预设。

## 技术栈

- Next.js 16（App Router，`output: "standalone"`）+ React 19 + TypeScript 5
- Tailwind CSS 4（CSS-first）+ shadcn/ui（New York）
- framer-motion（拖拽舞台）· zod v4（API 校验）· Prisma + SQLite（预设存储）

## 本地开发

```bash
bun install
bunx prisma generate
bun run db:push        # 创建 SQLite（db/custom.db，已 gitignore）
bun run dev            # http://localhost:3000，日志 tee 到 dev.log
```

### 环境变量

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | SQLite 连接串，如 `file:./db/custom.db`。**构建产物在运行时读取**，启动产物前必须设置 |

## 构建与产物启动

```bash
bun run build
# 产物 = .next/standalone（已含 public/ 与 db/custom.db 若存在）
# 注意：SQLite 相对路径按 Prisma schema 目录解析而非进程 CWD，
#       产物环境请使用绝对路径。
DATABASE_URL="file:$(pwd)/db/custom.db" PORT=3000 node .next/standalone/server.js
```

CI（`.github/workflows/ci.yml`）三道门禁 + 干净环境冒烟：

1. **Lint & Typecheck**（Bun 固定 1.3.14）
2. **Next.js Build**：CI 内 `prisma db push` 建库 → 构建打包 → 归档 standalone artifact
3. **Standalone smoke test**：仅下载 artifact（无 repo、无 node_modules），`node server.js` 启动后探测 `/`、`/api/presets`、`/logo.svg` 全 200

## 浏览器兼容矩阵

| 引擎 | 效果 |
|---|---|
| Chromium / Blink | 完整效果：位移折射 + 光谱色散 + 菲涅尔高光 |
| Safari / WebKit | 降级：`blur()+saturate()` 玻璃（`backdrop-filter: url()` 不支持） |
| Firefox / Gecko | 降级：同 Safari（url() 引用语法可解析但不渲染，Bugzilla #1738191） |

降级由 `src/components/glass/liquid-glass.tsx` 的 `supportsSvgBackdrop()` UA + CSS.supports 检测驱动，功能不受影响，仅损失折射质感。

## 仓库结构

```
src/app/                 # 页面外壳 + /api/presets CRUD（zod 校验、错误语义化）
src/components/glass/    # LiquidGlass 滤镜链 / 实验舞台 / 演示卡片
src/lib/glass/           # GlassConfig 预设（12 款）+ 位移贴图烘焙
prisma/schema.prisma     # GlassPreset 模型
.github/workflows/ci.yml # lint/typecheck/build/smoke 四 job
```

## 验收状态

第一阶段全面深度检查（1/5 基础架构 → 5/5 构建部署）已全部闭环：
缺陷一律走 Issue → 修复 → CI 门禁 → 关闭 流程，记录见 [Issues](https://github.com/AceGuru-bjx/GlassLab/issues) 与 `worklog.md`。
