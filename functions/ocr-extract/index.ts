const functionName = 'ocr-extract';

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    const body = await req.json();
    const { imageBase64, mimeType } = body;

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: '缺少 imageBase64 参数' }), {
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

    console.info(`[${functionName}] request ${requestId} image_size=${imageBase64.length}`);

    const dataUrl = `data:${mimeType || 'image/png'};base64,${imageBase64}`;

    const response = await fetch('https://api.meoo.host/meoo-ai/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen3-vl-plus',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: dataUrl },
              },
              {
                type: 'text',
                text: '这是一页日语辞书的扫描图片。请提取其中所有文字内容，保持原始排版格式（每行一个词条）。只输出提取的文字，不要添加任何解释。如果是竖排文字，请按从上到下、从右到左的阅读顺序输出。',
              },
            ],
          },
        ],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[${functionName}] upstream failed ${requestId} status=${response.status}: ${errText.slice(0, 300)}`);
      return new Response(JSON.stringify({ error: `OCR 服务调用失败: ${response.status}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content || '';

    console.info(`[${functionName}] success ${requestId} text_length=${text.length}`);

    return new Response(JSON.stringify({ success: true, text }), {
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
