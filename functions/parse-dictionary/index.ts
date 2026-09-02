import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const functionName = 'parse-dictionary';

interface DictEntry {
  surface: string;
  reading: string;
  meanings: string[];
  pos: string;
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    const body = await req.json();
    const { text, dictionaryId, batchIndex } = body;

    if (!text || !dictionaryId) {
      return new Response(JSON.stringify({ error: '缺少 text 或 dictionaryId 参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('MEOO_PROJECT_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'MEOO_PROJECT_API_KEY 未配置' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    console.info(`[${functionName}] request ${requestId} batch=${batchIndex ?? 0} text_length=${text.length}`);

    // 截取合理长度的文本发送给 LLM
    const chunk = text.slice(0, 6000);

    const response = await fetch('https://api.meoo.host/meoo-ai/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen3.6-plus',
        messages: [
          {
            role: 'system',
            content: `你是一个日语辞书解析器。用户会给你从辞书（PDF/EPUB）中提取的原始文本，你需要将其解析为结构化的词典词条。

每个词条包含：
- surface: 词条原文（汉字/假名）
- reading: 读音（平假名）
- meanings: 释义数组（中文）
- pos: 词性（如"名词"、"动词"、"形容词"、"副词"等，无法判断则留空）

规则：
1. 只输出 JSON 数组，不要输出其他内容
2. 如果文本中没有可识别的词典词条，输出空数组 []
3. 最多输出 30 个词条
4. 释义用中文
5. 如果原文有【】标注的读音，提取为 reading

输出格式：
[{"surface":"言葉","reading":"ことば","meanings":["话，语言","措辞"],"pos":"名词"}]`,
          },
          {
            role: 'user',
            content: chunk,
          },
        ],
        max_tokens: 4096,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[${functionName}] LLM failed ${requestId} status=${response.status}: ${errText.slice(0, 300)}`);
      return new Response(JSON.stringify({ error: `LLM 调用失败: ${response.status}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    let content = result.choices?.[0]?.message?.content || '[]';

    // 清理可能的 markdown 代码块标记
    content = content.replace(/^```json?\n?/m, '').replace(/\n?```$/m, '').trim();

    let entries: DictEntry[];
    try {
      entries = JSON.parse(content);
    } catch {
      console.warn(`[${functionName}] JSON parse failed ${requestId}, attempting extraction`);
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        entries = JSON.parse(match[0]);
      } else {
        entries = [];
      }
    }

    if (!Array.isArray(entries)) entries = [];

    // 过滤无效条目
    entries = entries.filter(
      (e) => e.surface && typeof e.surface === 'string' && e.surface.trim().length > 0
    );

    console.info(`[${functionName}] parsed ${requestId} entries=${entries.length}`);

    // 写入数据库
    if (entries.length > 0) {
      const rows = entries.map((e) => ({
        surface: e.surface.trim(),
        reading: e.reading || '',
        meanings: (e.meanings || []).map((m: string) => ({ lang: 'zh', text: m })),
        pos: e.pos || '',
        jlpt_level: null,
        is_common: false,
        source: 'import',
        dictionary_id: dictionaryId,
      }));

      const { error: insertError } = await supabaseAdmin
        .from('dictionary_entries')
        .insert(rows);

      if (insertError) {
        console.error(`[${functionName}] DB insert failed ${requestId}: ${insertError.message}`);
        return new Response(JSON.stringify({ error: `数据库写入失败: ${insertError.message}` }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ success: true, entryCount: entries.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${functionName}] failed ${requestId}: ${message}`);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
