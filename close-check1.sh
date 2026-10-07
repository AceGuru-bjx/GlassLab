#!/bin/bash
# Comment the inspection report on issue #1 and close it; update project status.
TOKEN="${GITHUB_TOKEN:?set GITHUB_TOKEN}"
API="https://api.github.com/repos/AceGuru-bjx/GlassLab"

cat > /tmp/report1.json <<'EOF'
{
"body":"## 📊 检查报告 — 1/5 基础架构与配置层\n\n**检查对象**：`package.json` · `tsconfig.json` · `next.config.ts` · `eslint.config.mjs` · `prisma/schema.prisma` · `.gitignore` · `.github/workflows/ci.yml`\n\n### 结论：发现并修复 4 个缺陷，CI 门禁由红转绿 ✅\n\n| # | 缺陷 | 严重度 | 状态 |\n|---|------|--------|------|\n| #6 | tsconfig 类型检查范围含非应用目录，CI typecheck 红灯 | 高 | ✅ 已修复 |\n| #7 | ignoreBuildErrors 掩盖类型错误 + strict mode 关闭 | 高 | ✅ 已修复 |\n| #8 | Post.authorId 无关系/无索引/无级联 | 中 | ✅ 已修复 |\n| #9 | .env 曾被跟踪（已核实无敏感内容） | 低 | ✅ 已修复 |\n\n### CI 证据\n\n- 修复前：run 37698172155 → `Typecheck` failure（被 #6 触发）\n- 修复后：commit 535796f → **全部通过（Lint & Typecheck ✓ · Next.js Build ✓）**\n\n### 修复提交\n\n`535796f` fix(config): 修复检查 1/5 发现的配置层缺陷（Closes #6 #7 #8 #9）\n\n### 通过项（无缺陷）\n\n- `package.json`：依赖版本一致，bun.lock 冻结安装通过\n- `eslint.config.mjs`：全项目 0 警告 0 错误\n- `.gitignore`：日志/依赖/运行时产物/环境文件规则完备\n- `ci.yml`：lint → typecheck → build 三道门禁 + standalone 产物归档\n\n**检查任务 1/5 完成，本 issue 关闭。** 下一分片：检查 2/5 全局样式与布局层（#2）"
}
EOF

curl -s -m 20 -X POST -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" "$API/issues/1/comments" -d @/tmp/report1.json | grep -m1 '"id"' | head -c 40; echo
curl -s -m 20 -X PATCH -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" "$API/issues/1" -d '{"state":"closed","state_reason":"completed"}' | grep -m1 '"state"'