import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const functionName = 'analyze-text';

interface TokenResult {
  surface: string;
  reading: string;
  lemma: string;
  pos: string;
  posDetail: string;
  isContent: boolean;
  translation: string;
}

interface LLMAnalysisResult {
  sentences: {
    original: string;
    tokens: TokenResult[];
    translation: string;
  }[];
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);

  const responseHeaders = { 'Content-Type': 'application/json' };

  try {
    const body = await req.json();
    const { text } = body as { text: string };

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'テキストを入力してください' }), {
        status: 400, headers: responseHeaders,
      });
    }

    if (text.length > 2000) {
      return new Response(JSON.stringify({ error: 'テキストが長すぎます（上限2000字）' }), {
        status: 400, headers: responseHeaders,
      });
    }

    // 日文文字を含むかチェック
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3000-\u303F]/.test(text);
    if (!hasJapanese) {
      return new Response(JSON.stringify({ error: '日文内容が検出されませんでした' }), {
        status: 400, headers: responseHeaders,
      });
    }

    console.info(`[${functionName}] request ${requestId} textLen=${text.length}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const apiKey = Deno.env.get('MEOO_PROJECT_API_KEY');

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI サービスが設定されていません' }), {
        status: 500, headers: responseHeaders,
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Step 1: LLM に分詞・注音・翻訳・アラインメントを依頼
    const llmPrompt = `あなたは日本語解析エンジンです。以下の日本語テキストを解析してください。

テキスト: "${text}"

以下のJSON形式で出力してください（JSON以外の文字は含めないでください）:
{
  "sentences": [
    {
      "original": "原文の一文",
      "tokens": [
        {
          "surface": "表面形",
          "reading": "ひらがな読み",
          "lemma": "辞書形",
          "pos": "品詞(名詞/動詞/形容詞/副詞/助詞/助動詞/接続詞/感動詞/接頭詞/接尾辞)",
          "posDetail": "品詞細分類",
          "isContent": true,
          "translation": "対応する中国語訳"
        }
      ],
      "translation": "文全体の中国語訳"
    }
  ]
}

ルール:
- 文は「。」「！」「？」「改行」で分割
- readingは必ずひらがなで（カタカナ語もひらがなに変換）
- 助詞・助動詞のisContentはfalse
- 名詞・動詞・形容詞・副詞のisContentはtrue
- translationは実詞のみの対応訳（助詞は空文字）
- ローマ字は使用禁止
- 固有名詞はそのまま表記`;

    // Meoo AI をストリーミングで呼び出し、SSE を累積して完全な JSON テキストを得る
    const llmResponse = await fetch('https://api.meoo.host/meoo-ai/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen3.6-plus',
        messages: [{ role: 'user', content: llmPrompt }],
        temperature: 0.1,
        stream: true,
      }),
    });

    if (!llmResponse.ok) {
      const errText = await llmResponse.text();
      console.error(`[${functionName}] LLM failed ${requestId} status=${llmResponse.status}: ${errText.slice(0, 200)}`);
      return new Response(JSON.stringify({ error: 'AI 解析に失敗しました' }), {
        status: 502, headers: responseHeaders,
      });
    }

    // SSE ストリームを読み取り、delta.content を累積
    const reader = llmResponse.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) fullText += delta;
          } catch {
            // 不正な JSON 行を無視
          }
        }
      }
    } catch (streamErr) {
      const m = streamErr instanceof Error ? streamErr.message : String(streamErr);
      console.error(`[${functionName}] stream failed ${requestId}: ${m}`);
      return new Response(JSON.stringify({ error: 'AI 応答の読み取りに失敗しました' }), {
        status: 502, headers: responseHeaders,
      });
    }

    if (!fullText) {
      return new Response(JSON.stringify({ error: 'AI 応答が空です' }), {
        status: 502, headers: responseHeaders,
      });
    }

    // JSON を頑健に抽出（最初の { から最後の } まで）
    let analysisResult: LLMAnalysisResult;
    try {
      const start = fullText.indexOf('{');
      const end = fullText.lastIndexOf('}');
      const jsonText = start >= 0 && end > start ? fullText.slice(start, end + 1) : fullText;
      analysisResult = JSON.parse(jsonText);
    } catch {
      console.error(`[${functionName}] JSON parse failed ${requestId}`);
      return new Response(JSON.stringify({ error: 'AI 出力の解析に失敗しました' }), {
        status: 502, headers: responseHeaders,
      });
    }

    // Step 2: 辞書データで検証・補強
    const allLemmas = analysisResult.sentences
      .flatMap(s => s.tokens)
      .filter(t => t.isContent)
      .map(t => t.lemma);

    const uniqueLemmas = [...new Set(allLemmas)];
    let dictEntries: Record<string, { meanings: { lang: string; text: string }[]; pos: string; jlptLevel: number | null }> = {};

    if (uniqueLemmas.length > 0) {
      const { data: dictData } = await supabase
        .from('dictionary_entries')
        .select('surface, reading, meanings, pos, jlpt_level')
        .in('surface', uniqueLemmas.slice(0, 50));

      if (dictData) {
        for (const entry of dictData) {
          dictEntries[entry.surface] = {
            meanings: entry.meanings as { lang: string; text: string }[],
            pos: entry.pos,
            jlptLevel: entry.jlpt_level,
          };
        }
      }
    }

    // Step 3: 音調データを取得
    const contentSurfaces = analysisResult.sentences
      .flatMap(s => s.tokens)
      .filter(t => t.isContent)
      .map(t => t.surface);
    const uniqueSurfaces = [...new Set(contentSurfaces)];

    let pitchMap: Record<string, { accent_nucleus: number; mora_count: number; accent_type: string; reading: string }> = {};
    if (uniqueSurfaces.length > 0) {
      const { data: pitchData } = await supabase
        .from('pitch_accent')
        .select('surface, reading, accent_nucleus, mora_count, accent_type')
        .in('surface', uniqueSurfaces.slice(0, 50));

      if (pitchData) {
        for (const p of pitchData) {
          pitchMap[p.surface] = {
            accent_nucleus: p.accent_nucleus,
            mora_count: p.mora_count,
            accent_type: p.accent_type,
            reading: p.reading,
          };
        }
      }
    }

    // Step 4: 文法ポイントをマッチング
    const { data: grammarData } = await supabase
      .from('grammar_points')
      .select('id, pattern, meaning_zh, jlpt_level, connection, usage_notes, examples')
      .limit(200);

    const matchedGrammar: Record<string, {
      id: string; pattern: string; meaningZh: string; jlptLevel: number;
      connection: string; usageNotes: string; examples: { ja: string; zh: string }[];
    }> = {};

    if (grammarData) {
      const fullText = text;
      for (const gp of grammarData) {
        // パターンマッチング（〜を除去して検索）
        const searchPattern = gp.pattern.replace(/〜/g, '');
        if (searchPattern.length >= 2 && fullText.includes(searchPattern)) {
          matchedGrammar[gp.pattern] = {
            id: gp.id,
            pattern: gp.pattern,
            meaningZh: gp.meaning_zh,
            jlptLevel: gp.jlpt_level,
            connection: gp.connection,
            usageNotes: gp.usage_notes,
            examples: (gp.examples as { ja: string; zh: string }[]) || [],
          };
        }
      }
    }

    // Step 5: 知識ポイントの繰り返しチェック
    const grammarNames = Object.keys(matchedGrammar);
    let repeatInfo: Record<string, { daysSince: number; prevExample: string }> = {};

    if (grammarNames.length > 0) {
      const { data: kpData } = await supabase
        .from('knowledge_points')
        .select('name, last_seen_at, example_sentences')
        .in('name', grammarNames);

      if (kpData) {
        for (const kp of kpData) {
          const daysSince = Math.floor((Date.now() - new Date(kp.last_seen_at).getTime()) / 86400000);
          const examples = (kp.example_sentences as string[]) || [];
          repeatInfo[kp.name] = {
            daysSince,
            prevExample: examples[0] || '',
          };
        }
      }
    }

    // Step 6: 結果を構築
    const sentences = analysisResult.sentences.map(sentence => {
      const tokens = sentence.tokens.map(token => {
        const dictInfo = dictEntries[token.lemma];
        const pitchInfo = pitchMap[token.surface];
        return {
          ...token,
          dictMeanings: dictInfo?.meanings || null,
          dictPos: dictInfo?.pos || null,
          jlptLevel: dictInfo?.jlptLevel || null,
          pitch: pitchInfo ? {
            accentNucleus: pitchInfo.accent_nucleus,
            moraCount: pitchInfo.mora_count,
            accentType: pitchInfo.accent_type,
            found: true,
          } : {
            accentNucleus: 0,
            moraCount: token.reading.length,
            accentType: '未収録',
            found: false,
          },
        };
      });

      // 文法マッチ（この文に含まれるもの）
      const sentenceGrammar = Object.values(matchedGrammar).filter(gp => {
        const searchPattern = gp.pattern.replace(/〜/g, '');
        return sentence.original.includes(searchPattern);
      }).map(gp => ({
        ...gp,
        isRepeat: gp.pattern in repeatInfo,
        daysSinceLastSeen: repeatInfo[gp.pattern]?.daysSince,
        previousExample: repeatInfo[gp.pattern]?.prevExample,
      }));

      return {
        original: sentence.original,
        tokens,
        translation: sentence.translation,
        alignmentValid: true,
        grammarPoints: sentenceGrammar,
      };
    });

    // Step 7: 履歴に保存
    const resultJson = { sentences, analyzedAt: new Date().toISOString() };
    const { data: historyData } = await supabase
      .from('analysis_history')
      .insert({
        input_text: text,
        result_json: resultJson,
        sentence_count: sentences.length,
      })
      .select('id')
      .single();

    // Step 8: 知識ポイントを更新
    for (const gp of Object.values(matchedGrammar)) {
      const existing = repeatInfo[gp.pattern];
      if (existing) {
        // 既存の知識ポイントの接触回数を取得してインクリメント
        const { data: existingKp } = await supabase
          .from('knowledge_points')
          .select('id, contact_count')
          .eq('name', gp.pattern)
          .maybeSingle();

        if (existingKp) {
          await supabase
            .from('knowledge_points')
            .update({
              contact_count: (existingKp.contact_count || 0) + 1,
              last_seen_at: new Date().toISOString(),
            })
            .eq('id', existingKp.id);
        }
      } else {
        await supabase
          .from('knowledge_points')
          .insert({
            point_type: 'grammar',
            name: gp.pattern,
            contact_count: 1,
            example_sentences: [sentences[0]?.original || ''],
          });
      }
    }

    console.info(`[${functionName}] success ${requestId} sentences=${sentences.length}`);

    return new Response(JSON.stringify({
      success: true,
      data: {
        inputText: text,
        sentences,
        analyzedAt: new Date().toISOString(),
        historyId: historyData?.id || null,
      },
    }), { headers: responseHeaders });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${functionName}] failed ${requestId}: ${message}`);
    return new Response(JSON.stringify({ error: `解析エラー: ${message}` }), {
      status: 500, headers: responseHeaders,
    });
  }
});
