import { useState, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { supabase, supabaseUrl, projectUrlId } from '@/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Upload, FileText, BookOpen, Loader2, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface ImportedDict {
  id: string;
  name: string;
  file_type: string;
  entry_count: number;
  status: string;
  created_at: string;
}

type ImportPhase = 'idle' | 'extracting' | 'ocr' | 'parsing' | 'done' | 'error';

export function DictionaryImport({ onImported }: { onImported?: () => void }) {
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [dictionaries, setDictionaries] = useState<ImportedDict[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDictionaries = useCallback(async () => {
    const { data } = await supabase
      .from('imported_dictionaries')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setDictionaries(data as ImportedDict[]);
  }, []);

  useState(() => { loadDictionaries(); });

  const callEdgeFunction = async (name: string, body: unknown) => {
    const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'OneDay-App-Id': projectUrlId,
      },
      body: JSON.stringify(body),
    });
    return response;
  };

  const extractPdfText = async (file: File): Promise<{ texts: string[]; hasScannedPages: boolean }> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const texts: string[] = [];
    let hasScannedPages = false;
    const totalPages = pdf.numPages;

    for (let i = 1; i <= totalPages; i++) {
      setStatusText(`正在提取第 ${i}/${totalPages} 页…`);
      setProgress(Math.round((i / totalPages) * 40));

      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => item.str)
        .join('');

      if (pageText.trim().length < 10) {
        hasScannedPages = true;
        texts.push('');
      } else {
        texts.push(pageText);
      }
    }

    return { texts, hasScannedPages };
  };

  const ocrPage = async (file: File, pageIndex: number): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(pageIndex + 1);

    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];

    const response = await callEdgeFunction('ocr-extract', {
      imageBase64: base64,
      mimeType: 'image/png',
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      console.warn(`OCR failed for page ${pageIndex + 1}`);
      return '';
    }
    return result.text || '';
  };

  const extractEpubText = async (file: File): Promise<string[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const texts: string[] = [];

    const htmlFiles = Object.keys(zip.files).filter(
      (name) => /\.(x?html?|htm)$/i.test(name) && !zip.files[name].dir
    );

    for (let i = 0; i < htmlFiles.length; i++) {
      setStatusText(`正在读取章节 ${i + 1}/${htmlFiles.length}…`);
      setProgress(Math.round(((i + 1) / htmlFiles.length) * 40));

      const content = await zip.files[htmlFiles[i]].async('string');
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      const text = doc.body?.textContent || '';
      if (text.trim().length > 0) {
        texts.push(text.trim());
      }
    }

    return texts;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    const isEpub = file.name.toLowerCase().endsWith('.epub');

    if (!isPdf && !isEpub) {
      toast.error('仅支持 PDF 和 EPUB 格式');
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast.error('文件大小不能超过 100MB');
      return;
    }

    setPhase('extracting');
    setProgress(0);
    setStatusText('正在读取文件…');

    try {
      // 1. 创建导入记录
      const dictName = file.name.replace(/\.(pdf|epub)$/i, '');
      const { data: dictRecord, error: dictError } = await supabase
        .from('imported_dictionaries')
        .insert({ name: dictName, file_type: isPdf ? 'pdf' : 'epub', status: 'processing' })
        .select()
        .single();

      if (dictError || !dictRecord) {
        throw new Error('创建导入记录失败');
      }

      // 2. 提取文本
      let textChunks: string[] = [];

      if (isPdf) {
        const { texts, hasScannedPages } = await extractPdfText(file);

        if (hasScannedPages) {
          setPhase('ocr');
          setStatusText('检测到扫描页，正在进行 OCR 识别…');
          for (let i = 0; i < texts.length; i++) {
            if (texts[i] === '') {
              setProgress(40 + Math.round(((i + 1) / texts.length) * 20));
              setStatusText(`OCR 识别第 ${i + 1}/${texts.length} 页…`);
              texts[i] = await ocrPage(file, i);
            }
          }
        }

        textChunks = texts.filter((t) => t.trim().length > 20);
      } else {
        textChunks = await extractEpubText(file);
      }

      if (textChunks.length === 0) {
        throw new Error('未能从文件中提取到有效文本');
      }

      // 3. 合并并分块发送给解析函数
      setPhase('parsing');
      const fullText = textChunks.join('\n');
      const chunkSize = 5000;
      const chunks: string[] = [];
      for (let i = 0; i < fullText.length; i += chunkSize) {
        chunks.push(fullText.slice(i, i + chunkSize));
      }

      // 最多处理前 10 个分块（避免超长文件耗时过久）
      const maxChunks = Math.min(chunks.length, 10);
      let totalEntries = 0;

      for (let i = 0; i < maxChunks; i++) {
        setProgress(60 + Math.round(((i + 1) / maxChunks) * 35));
        setStatusText(`正在解析词条 ${i + 1}/${maxChunks}…`);

        const response = await callEdgeFunction('parse-dictionary', {
          text: chunks[i],
          dictionaryId: dictRecord.id,
          batchIndex: i,
        });

        const result = await response.json();
        if (response.ok && result.success) {
          totalEntries += result.entryCount || 0;
        }
      }

      // 4. 更新导入记录
      await supabase
        .from('imported_dictionaries')
        .update({ status: 'completed', entry_count: totalEntries })
        .eq('id', dictRecord.id);

      setPhase('done');
      setProgress(100);
      setStatusText(`导入完成，共解析 ${totalEntries} 个词条`);
      toast.success(`「${dictName}」导入完成：${totalEntries} 个词条`);

      loadDictionaries();
      onImported?.();
    } catch (err) {
      setPhase('error');
      const msg = err instanceof Error ? err.message : '导入失败';
      setStatusText(msg);
      toast.error(msg);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('imported_dictionaries').delete().eq('id', id);
    if (error) {
      toast.error('删除失败');
      return;
    }
    // 同时删除关联词条
    await supabase.from('dictionary_entries').delete().eq('dictionary_id', id);
    setDictionaries((prev) => prev.filter((d) => d.id !== id));
    toast.success('已删除辞书及其词条');
  };

  const isProcessing = phase === 'extracting' || phase === 'ocr' || phase === 'parsing';

  return (
    <div className="space-y-4">
      {/* 导入区域 */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground tracking-wide">导入辞书</h2>
          <Badge variant="outline" className="text-[10px]">PDF / EPUB</Badge>
        </div>

        {isProcessing ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              <span>{statusText}</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary/40 hover:bg-accent/50"
          >
            <Upload size={20} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {phase === 'done' ? '继续导入其他辞书' : '点击选择 PDF 或 EPUB 文件'}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              支持扫描版 PDF（自动 OCR）
            </p>
          </button>
        )}

        {phase === 'done' && (
          <div className="mt-3 flex items-center gap-2 text-sm text-matcha">
            <CheckCircle2 size={14} />
            <span>{statusText}</span>
          </div>
        )}
        {phase === 'error' && (
          <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle size={14} />
            <span>{statusText}</span>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.epub"
          className="hidden"
          onChange={handleFileSelect}
        />
      </Card>

      {/* 已导入列表 */}
      {dictionaries.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-medium text-muted-foreground tracking-wide mb-3">已导入辞书</h2>
          <div className="space-y-2">
            {dictionaries.map((dict) => (
              <div key={dict.id} className="group flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  {dict.file_type === 'pdf' ? (
                    <FileText size={14} className="shrink-0 text-vermillion" />
                  ) : (
                    <BookOpen size={14} className="shrink-0 text-indigo-jp" />
                  )}
                  <span className="text-sm truncate">{dict.name}</span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {dict.entry_count} 词
                  </Badge>
                </div>
                <button
                  className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                  onClick={() => handleDelete(dict.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
