import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { supabase } from '@/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowLeft, Trash2, ChevronDown, ChevronUp, BookOpen, Brain, Clock } from 'lucide-react';

export const Route = createFileRoute('/archive')({
  component: ArchivePage,
});

interface HistoryItem {
  id: string;
  input_text: string;
  sentence_count: number;
  created_at: string;
}

interface KnowledgeItem {
  id: string;
  point_type: string;
  name: string;
  contact_count: number;
  last_seen_at: string;
}

export function ArchivePage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [histRes, kpRes] = await Promise.all([
          supabase.from('analysis_history').select('*').order('created_at', { ascending: false }).limit(20),
          supabase.from('knowledge_points').select('*').order('contact_count', { ascending: false }),
        ]);
        if (histRes.error) throw new Error(histRes.error.message);
        if (kpRes.error) throw new Error(kpRes.error.message);
        setHistory((histRes.data as HistoryItem[]) || []);
        setKnowledge((kpRes.data as KnowledgeItem[]) || []);
      } catch (e) {
        toast.error(`数据加载失败：${e instanceof Error ? e.message : '未知错误'}`);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  async function handleDelete(id: string) {
    if (!window.confirm('确定删除这条记录吗？')) return;
    const { error } = await supabase.from('analysis_history').delete().eq('id', id);
    if (error) {
      toast.error(`删除失败：${error.message}`);
      return;
    }
    setHistory(prev => prev.filter(h => h.id !== id));
    toast.success('已删除');
  }

  const lastStudy = history.length > 0 ? history[0].created_at : null;

  return (
    <div className="min-h-screen bg-background px-4 py-8 md:px-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-light tracking-wide">学习档案</h1>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-3 gap-3">
          <Card className="p-4 text-center">
            <BookOpen size={16} className="mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-semibold">{history.length}</p>
            <p className="text-xs text-muted-foreground">总解析次数</p>
          </Card>
          <Card className="p-4 text-center">
            <Brain size={16} className="mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-semibold">{knowledge.length}</p>
            <p className="text-xs text-muted-foreground">知识点</p>
          </Card>
          <Card className="p-4 text-center">
            <Clock size={16} className="mx-auto mb-1 text-muted-foreground" />
            <p className="text-sm font-semibold mt-1">
              {lastStudy ? formatDistanceToNow(new Date(lastStudy), { addSuffix: true, locale: zhCN }) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">最近学习</p>
          </Card>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-12">加载中…</p>
        ) : (
          <>
            {/* Timeline */}
            <section className="mb-10">
              <h2 className="mb-4 text-sm font-medium text-muted-foreground tracking-widest uppercase">解析历史</h2>
              {history.length === 0 ? (
                <p className="text-muted-foreground text-sm py-6 text-center">暂无学习记录</p>
              ) : (
                <div className="space-y-2">
                  {history.map(item => (
                    <Card key={item.id} className="p-4 group">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground mb-1">
                            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: zhCN })}
                            {' · '}
                            {format(new Date(item.created_at), 'MM/dd HH:mm')}
                            {' · '}
                            {item.sentence_count} 句
                          </p>
                          <p className="text-sm truncate font-jp">
                            {expandedId === item.id ? item.input_text : item.input_text.slice(0, 50) + (item.input_text.length > 50 ? '...' : '')}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                            {expandedId === item.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(item.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {/* Knowledge Points */}
            <section>
              <h2 className="mb-4 text-sm font-medium text-muted-foreground tracking-widest uppercase">知识点</h2>
              {knowledge.length === 0 ? (
                <p className="text-muted-foreground text-sm py-6 text-center">暂无知识点记录</p>
              ) : (
                <div className="space-y-2">
                  {knowledge.map(kp => (
                    <Card key={kp.id} className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={kp.point_type === 'grammar' ? 'default' : 'secondary'} className="text-[10px]">
                          {kp.point_type === 'grammar' ? '语法' : '词汇'}
                        </Badge>
                        <span className="text-sm font-jp">{kp.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>×{kp.contact_count}</span>
                        <span>{formatDistanceToNow(new Date(kp.last_seen_at), { addSuffix: true, locale: zhCN })}</span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
