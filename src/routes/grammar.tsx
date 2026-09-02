import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/supabase/client';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/grammar')({
  component: GrammarPage,
});

interface GrammarPoint {
  id: string;
  pattern: string;
  meaning_zh: string;
  jlpt_level: number;
  connection: string;
  usage_notes: string;
  examples: { ja: string; zh: string }[];
  tags: string[];
}

const LEVEL_COLORS: Record<number, string> = {
  5: 'bg-matcha/10 text-matcha',
  4: 'bg-gold/10 text-gold',
  3: 'bg-indigo-jp/10 text-indigo-jp',
  2: 'bg-vermillion/10 text-vermillion',
  1: 'bg-foreground/10 text-foreground',
};

function LevelBadge({ level }: { level: number }) {
  return (
    <Badge variant="secondary" className={cn('text-xs font-medium', LEVEL_COLORS[level] || '')}>
      N{level}
    </Badge>
  );
}

function GrammarCard({ point }: { point: GrammarPoint }) {
  const [open, setOpen] = useState(false);
  const examples = point.examples?.length ? point.examples : [];

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-sm border-border/60"
      onClick={() => setOpen(!open)}
    >
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-jp text-lg font-medium">{point.pattern}</span>
            <LevelBadge level={point.jlpt_level} />
          </div>
          <ChevronDown
            size={16}
            className={cn('text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{point.meaning_zh}</p>

        {open && (
          <div className="mt-4 space-y-3 border-t border-border/50 pt-4 animate-fade-slide-up">
            {point.connection && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">接续</p>
                <p className="text-sm font-jp">{point.connection}</p>
              </div>
            )}
            {point.usage_notes && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">用法</p>
                <p className="text-sm leading-relaxed">{point.usage_notes}</p>
              </div>
            )}
            {examples.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">例句</p>
                <div className="space-y-2">
                  {examples.slice(0, 3).map((ex, i) => (
                    <div key={i} className="rounded-md bg-muted/50 p-2.5">
                      <p className="font-jp text-sm">{ex.ja}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{ex.zh}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {point.tags?.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {point.tags.map((tag) => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function GrammarPage() {
  const [points, setPoints] = useState<GrammarPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    async function load() {
      setLoading(true);
      let query = supabase
        .from('grammar_points')
        .select('*')
        .order('jlpt_level', { ascending: false })
        .limit(100);

      if (filter !== 'all') {
        query = query.eq('jlpt_level', Number(filter));
      }

      const { data, error } = await query;
      if (error) {
        toast.error('语法数据加载失败');
      } else {
        setPoints((data as GrammarPoint[]) || []);
      }
      setLoading(false);
    }
    load();
  }, [filter]);

  const levels = ['all', '5', '4', '3', '2', '1'];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-xl font-medium tracking-tight">语法库</h1>
        </div>

        <Tabs value={filter} onValueChange={setFilter} className="mb-6">
          <TabsList className="w-full justify-start bg-secondary/50">
            {levels.map((l) => (
              <TabsTrigger key={l} value={l} className="text-sm">
                {l === 'all' ? '全部' : `N${l}`}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : points.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <p className="font-jp">没有符合条件的语法点</p>
          </div>
        ) : (
          <div className="space-y-3">
            {points.map((point) => (
              <GrammarCard key={point.id} point={point} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
