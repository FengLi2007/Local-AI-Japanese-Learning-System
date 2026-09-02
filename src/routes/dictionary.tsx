import { useState, useCallback } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { supabase } from '@/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Search, BookOpen } from 'lucide-react';
import { DictionaryImport } from '@/components/DictionaryImport';

export const Route = createFileRoute('/dictionary')({
  component: DictionaryPage,
});

interface DictEntry {
  id: string;
  surface: string;
  reading: string;
  meanings: { lang: string; text: string }[];
  pos: string;
  jlpt_level: number | null;
  is_common: boolean;
}

function DictionaryPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DictEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setSearched(true);
    setExpandedId(null);
    try {
      const { data, error } = await supabase
        .from('dictionary_entries')
        .select('*')
        .or(`surface.ilike.%${trimmed}%,reading.ilike.%${trimmed}%`)
        .limit(20);
      if (error) throw new Error(error.message);
      setResults((data as DictEntry[]) ?? []);
    } catch (e) {
      toast.error(`搜索失败：${e instanceof Error ? e.message : '未知错误'}`);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') doSearch(query);
  };

  const jlptLabel = (level: number | null) =>
    level ? `N${level}` : null;

  return (
    <div className="min-h-screen bg-background">
      {/* 头部 */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-xl font-semibold tracking-wide font-jp">词典</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* 导入辞书 */}
        <DictionaryImport onImported={() => {}} />

        {/* 搜索栏 */}
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入汉字或假名搜索…"
            className="font-jp h-11"
          />
          <Button
            onClick={() => doSearch(query)}
            disabled={loading || !query.trim()}
            className="h-11 px-5 shrink-0"
          >
            <Search size={16} className="mr-1.5" />
            搜索
          </Button>
        </div>

        {/* 加载中 */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-md" />
            ))}
          </div>
        )}

        {/* 空状态 */}
        {!loading && searched && results.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <BookOpen size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-jp">无搜索结果</p>
          </div>
        )}

        {/* 结果列表 */}
        {!loading && results.length > 0 && (
          <div className="space-y-2">
            {results.map((entry) => {
              const isOpen = expandedId === entry.id;
              return (
                <Card
                  key={entry.id}
                  className="cursor-pointer transition-shadow hover:shadow-sm"
                  onClick={() => setExpandedId(isOpen ? null : entry.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-3">
                        <span className="text-lg font-jp font-medium">{entry.surface}</span>
                        <span className="text-sm text-muted-foreground font-jp">
                          【{entry.reading}】
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {entry.is_common && (
                          <Badge variant="secondary" className="text-xs">常用</Badge>
                        )}
                        {entry.pos && (
                          <Badge variant="outline" className="text-xs font-jp">{entry.pos}</Badge>
                        )}
                        {jlptLabel(entry.jlpt_level) && (
                          <Badge className="text-xs bg-vermillion/10 text-vermillion border-vermillion/20">
                            {jlptLabel(entry.jlpt_level)}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* 展开详情 */}
                    {isOpen && (
                      <div className="mt-3 pt-3 border-t border-border animate-fade-slide-up">
                        <ul className="space-y-1.5">
                          {(entry.meanings?.length ? entry.meanings : []).map((m, idx) => (
                            <li key={idx} className="text-sm flex items-start gap-2">
                              <span className="text-muted-foreground shrink-0">{idx + 1}.</span>
                              <span>{m.text}</span>
                            </li>
                          ))}
                        </ul>
                        {!(entry.meanings?.length) && (
                          <p className="text-sm text-muted-foreground">无释义数据</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* 初始状态 */}
        {!loading && !searched && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="font-jp text-lg mb-2">搜索单词</p>
            <p className="text-sm">输入汉字或假名开始搜索</p>
          </div>
        )}
      </main>
    </div>
  );
}
