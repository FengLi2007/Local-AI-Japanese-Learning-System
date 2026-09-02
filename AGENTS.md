# AGENTS.md

## Dependencies
- `date-fns` + `date-fns/locale`：时间格式化（学习档案页的相对时间显示）
- `@supabase/supabase-js`：云服务数据库访问（由平台自动生成 client）

## Architecture
- 后端管线通过 Edge Function `analyze-text` 实现：LLM 分词/翻译 → 数据库验证（词典/音调/语法）→ 结构化 JSON 返回
- 前端三栏布局：左栏输入+历史、中栏渲染（SentenceRenderer）、右栏知识点档案
- 核心渲染组件 `src/components/SentenceRenderer.tsx` 内联了 TextWithRuby、PitchAccentLine、GrammarAccordion 三个子组件
- 数据库 5 张表：dictionary_entries / grammar_points / pitch_accent / analysis_history / knowledge_points
- 设计系统：日式极简（和紙色背景 + 墨色文字 + 朱色/藍/抹茶/金 四色语义）

## Lessons
- Edge Function 中 `supabase.rpc` 是函数引用，不能用作条件判断（TS 会报 TS2774）
- 音调数据用"核位置整数"表示（0=平板型），前端 SVG 渲染时需转换为高低坐标序列
- client.ts 未导出 `projectUrlId` 时，Edge Function 调用不需要 `OneDay-App-Id` header
