import { useState, useCallback, useEffect } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { supabase, supabaseUrl } from '@/supabase/client';
import { SentenceRenderer } from '@/components/SentenceRenderer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { BookOpen, Library, Archive, Sparkles, Loader2, Trash2 } from 'lucide-react';
import type { SentenceAnalysis, Token, KnowledgePoint, HistoryRecord } from '@/lib/types';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

function IndexPage() {
  const [inputText, setInputText] = useState('');
  const [sentences, setSentences] = useState<SentenceAnalysis[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [knowledgePoints, setKnowledgePoints] = useState<KnowledgePoint[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);

  // 加载知识点和历史
  useEffect(() => {
    async function load() {
      const [kpRes, histRes] = await Promise.all([
        supabase.from('knowledge_points').select('*').order('contact_count', { ascending: false }).limit(20),
        supabase.from('analysis_history').select('id, input_text, sentence_count, created_at').order('created_at', { ascending: false }).limit(10),
      ]);
      if (kpRes.data) setKnowledgePoints(kpRes.data as KnowledgePoint[]);
      if (histRes.data) setHistory(histRes.data as HistoryRecord[]);
    }
    load();
  }, []);

  const handleAnalyze = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;
    if (text.length > 2000) {
      toast.error('文本过长（上限 2000 字）');
      return;
    }

    setAnalyzing(true);
    setSentences([]);
    setSelectedToken(null);

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/analyze-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || '解析失败');
        return;
      }

      if (result.success && result.data?.sentences) {
        // 为每个 token 分配颜色索引
        let colorIdx = 0;
        const processed = result.data.sentences.map((s: any) => ({
          ...s,
          tokens: s.tokens.map((t: any) => ({
            ...t,
            colorIndex: t.isContent ? colorIdx++ : undefined,
          })),
        }));
        setSentences(processed);
        toast.success(`解析完成：${processed.length} 句`);

        // 刷新知识点
        const { data: kpData } = await supabase
          .from('knowledge_points')
          .select('*')
          .order('contact_count', { ascending: false })
          .limit(20);
        if (kpData) setKnowledgePoints(kpData as KnowledgePoint[]);

        // 刷新历史
        const { data: histData } = await supabase
          .from('analysis_history')
          .select('id, input_text, sentence_count, created_at')
          .order('created_at', { ascending: false })
          .limit(10);
        if (histData) setHistory(histData as HistoryRecord[]);
      }
    } catch (e) {
      toast.error(`解析错误：${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setAnalyzing(false);
    }
  }, [inputText]);

  const handleWordClick = useCallback((token: Token) => {
    setSelectedToken(token);
  }, []);

  const handleDeleteHistory = async (id: string) => {
    const { error } = await supabase.from('analysis_history').delete().eq('id', id);
    if (error) {
      toast.error('删除失败');
      return;
    }
    setHistory(prev => prev.filter(h => h.id !== id));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 导航 */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <h1 className="font-jp text-lg font-medium tracking-widest">
            言の葉
            <span className="ml-2 text-xs font-normal text-muted-foreground tracking-normal">日语学习解析台</span>
          </h1>
          <nav className="flex items-center gap-1">
            <Link to="/dictionary" className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <BookOpen size={15} />
              <span className="hidden sm:inline">词典</span>
            </Link>
            <Link to="/grammar" className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Library size={15} />
              <span className="hidden sm:inline">语法</span>
            </Link>
            <Link to="/archive" className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Archive size={15} />
              <span className="hidden sm:inline">档案</span>
            </Link>
          </nav>
        </div>
      </header>

      {/* 主内容：三栏布局 */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr_260px]">
          {/* 左栏：输入区 */}
          <aside className="space-y-4">
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground tracking-wide">输入</h2>
              <Textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="请粘贴日语文本…&#10;（歌词、台词、小说、文献等）"
                className="min-h-[160px] resize-y font-jp text-sm leading-relaxed bg-paper"
                maxLength={2000}
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{inputText.length}/2000</span>
                <Button
                  onClick={handleAnalyze}
                  disabled={analyzing || !inputText.trim()}
                  className="gap-1.5"
                >
                  {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {analyzing ? '解析中…' : '开始解析'}
                </Button>
              </div>
            </Card>

            {/* 历史 */}
            {history.length > 0 && (
              <Card className="p-4">
                <h2 className="mb-3 text-sm font-medium text-muted-foreground tracking-wide">历史</h2>
                <div className="space-y-1.5">
                  {history.slice(0, 5).map((h) => (
                    <div key={h.id} className="group flex items-start justify-between gap-1 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent">
                      <button
                        className="flex-1 text-left font-jp truncate text-foreground/80"
                        onClick={() => setInputText(h.inputText)}
                        title={h.inputText}
                      >
                        {h.inputText.slice(0, 30)}{h.inputText.length > 30 ? '…' : ''}
                      </button>
                      <button
                        className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                        onClick={() => handleDeleteHistory(h.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </aside>

          {/* 中栏：渲染区 */}
          <section className="min-h-[400px]">
            {sentences.length === 0 && !analyzing ? (
              <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-muted-foreground">
                <p className="font-jp text-2xl mb-3 opacity-30">言の葉</p>
                <p className="text-sm">输入文本后点击「开始解析」</p>
                <p className="mt-1 text-xs opacity-60">自动解析振假名、音调线、翻译与语法</p>
              </div>
            ) : analyzing ? (
              <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 size={28} className="animate-spin" />
                <p className="text-sm">正在解析…</p>
              </div>
            ) : (
              <div className="space-y-4">
                {sentences.map((sentence, i) => (
                  <Card key={i} className="overflow-hidden">
                    <SentenceRenderer sentence={sentence} onWordClick={handleWordClick} />
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* 右栏：知识点 */}
          <aside className="space-y-4">
            {/* 选中的词语 */}
            {selectedToken && (
              <Card className="p-4 animate-fade-slide-up">
                <h2 className="mb-2 text-sm font-medium text-muted-foreground">选中的词语</h2>
                <p className="font-jp text-xl font-medium">{selectedToken.surface}</p>
                <p className="text-sm text-muted-foreground font-jp">【{selectedToken.reading}】</p>
                <Separator className="my-2" />
                <div className="space-y-1 text-sm">
                  <p><span className="text-muted-foreground">词性：</span>{selectedToken.pos}</p>
                  {selectedToken.translation && (
                    <p><span className="text-muted-foreground">释义：</span>{selectedToken.translation}</p>
                  )}
                </div>
              </Card>
            )}

            {/* 知识点列表 */}
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground tracking-wide">知识点</h2>
              {knowledgePoints.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  暂无记录
                </p>
              ) : (
                <div className="space-y-2">
                  {knowledgePoints.map((kp) => (
                    <div key={kp.id} className="flex items-center justify-between rounded-md bg-muted/30 px-2.5 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="secondary" className="shrink-0 text-[10px] px-1 py-0">
                          {kp.pointType === 'grammar' ? '语法' : '词汇'}
                        </Badge>
                        <span className="font-jp text-xs truncate">{kp.name}</span>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">×{kp.contactCount}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}
