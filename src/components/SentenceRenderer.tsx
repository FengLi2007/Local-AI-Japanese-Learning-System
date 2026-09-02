import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import type { SentenceAnalysis, Token, GrammarMatch } from '@/lib/types';

const ALIGN_COLORS = ['text-vermillion', 'text-indigo-jp', 'text-matcha', 'text-gold', 'text-chart-5'];
const JLPT_COLORS: Record<number, string> = {
  5: 'bg-matcha/15 text-matcha',
  4: 'bg-gold/15 text-gold',
  3: 'bg-indigo-jp/15 text-indigo-jp',
  2: 'bg-vermillion/15 text-vermillion',
  1: 'bg-foreground/10 text-foreground',
};

function TextWithRuby({ tokens, onWordClick }: { tokens: Token[]; onWordClick?: (t: Token) => void }) {
  return (
    <p className="font-jp text-xl leading-relaxed tracking-wide">
      {tokens?.map((token, i) => {
        if (token.isContent) {
          const color = ALIGN_COLORS[(token.colorIndex ?? i) % ALIGN_COLORS.length];
          return (
            <ruby
              key={i}
              className={cn('cursor-pointer hover:opacity-70 transition-opacity', color)}
              onClick={() => onWordClick?.(token)}
            >
              {token.surface}
              <rt>{token.reading}</rt>
            </ruby>
          );
        }
        return <span key={i}>{token.surface}</span>;
      })}
    </p>
  );
}

function PitchAccentLine({ reading, accentNucleus, moraCount, accentType, found }: {
  reading: string; accentNucleus: number; moraCount: number; accentType: string; found: boolean;
}) {
  if (!found) {
    return <span className="text-xs text-muted-foreground">未收录</span>;
  }

  const moras = [...reading].slice(0, moraCount);
  const w = moraCount * 24 + 8;
  const points: string[] = [];
  const dots: { x: number; y: number }[] = [];

  for (let i = 0; i < moraCount; i++) {
    let isHigh: boolean;
    if (accentNucleus === 0) isHigh = i > 0;
    else if (accentNucleus === 1) isHigh = i === 0;
    else isHigh = i >= 1 && i < accentNucleus;
    const y = isHigh ? 8 : 28;
    const x = i * 24 + 16;
    points.push(`${x},${y}`);
    if (i === accentNucleus - 1 && accentNucleus > 0) dots.push({ x, y });
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width={w} height={52} className="pitch-line-animate">
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="text-foreground/70"
        />
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={3} className="fill-vermillion" />
        ))}
        {moras.map((m, i) => (
          <text key={i} x={i * 24 + 16} y={46} textAnchor="middle" className="fill-muted-foreground text-[10px] font-jp">
            {m}
          </text>
        ))}
      </svg>
      <span className="text-[10px] text-muted-foreground">{accentType}</span>
    </div>
  );
}

function GrammarAccordion({ grammarPoints }: { grammarPoints: GrammarMatch[] }) {
  if (!grammarPoints?.length) {
    return <p className="text-sm text-muted-foreground">本句未识别到已收录的语法点</p>;
  }

  return (
    <Accordion type="multiple" className="w-full">
      {grammarPoints.map((gp) => (
        <AccordionItem key={gp.pattern} value={gp.pattern}>
          {gp.isRepeat && (
            <div className="reminder-pulse mb-2 rounded-md bg-gold/10 px-3 py-1.5 text-xs text-gold">
              💡 与你 {gp.daysSinceLastSeen ?? '?'} 天前学过的『{gp.pattern}』相似
              {gp.previousExample && <span className="ml-2 text-muted-foreground">「{gp.previousExample}」</span>}
            </div>
          )}
          <AccordionTrigger className="text-sm hover:no-underline">
            <span className="flex items-center gap-2">
              <span className="font-jp font-medium">{gp.pattern}</span>
              <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0', JLPT_COLORS[gp.jlptLevel] || '')}>
                N{gp.jlptLevel}
              </Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">含义：</span>{gp.meaningZh}</p>
            {gp.connection && <p><span className="text-muted-foreground">接续：</span>{gp.connection}</p>}
            {gp.usageNotes && <p><span className="text-muted-foreground">用法：</span>{gp.usageNotes}</p>}
            {gp.examples?.length ? (
              <div className="space-y-1 pt-1">
                {gp.examples.slice(0, 3).map((ex, i) => (
                  <div key={i} className="rounded bg-muted/50 px-2 py-1">
                    <p className="font-jp text-xs">{ex.ja}</p>
                    <p className="text-xs text-muted-foreground">{ex.zh}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function SentenceRenderer({ sentence, onWordClick }: {
  sentence: SentenceAnalysis;
  onWordClick?: (token: Token) => void;
}) {
  const contentTokens = sentence.tokens?.filter(t => t.isContent) ?? [];

  return (
    <div className="animate-fade-slide-up space-y-3 p-4">
      {/* 原文 + 振假名 */}
      <TextWithRuby tokens={sentence.tokens ?? []} onWordClick={onWordClick} />

      <div className="border-b border-border/50" />

      {/* 音調線 */}
      <div className="flex flex-wrap gap-3">
        {contentTokens.map((token, i) => (
          <PitchAccentLine
            key={i}
            reading={token.reading}
            accentNucleus={(token as any).pitch?.accentNucleus ?? 0}
            moraCount={(token as any).pitch?.moraCount ?? token.reading.length}
            accentType={(token as any).pitch?.accentType ?? '未收录'}
            found={(token as any).pitch?.found ?? false}
          />
        ))}
      </div>

      <div className="border-b border-border/50" />

      {/* 中文翻訳 */}
      <p className="text-sm leading-relaxed">
        {sentence.tokens?.map((token, i) => {
          if (token.isContent && token.translation) {
            const color = ALIGN_COLORS[(token.colorIndex ?? i) % ALIGN_COLORS.length];
            return <span key={i} className={color}>{token.translation} </span>;
          }
          return null;
        })}
        <span className="ml-2 text-muted-foreground">— {sentence.translation}</span>
      </p>

      <div className="border-b border-border/50" />

      {/* 語法区 */}
      <GrammarAccordion grammarPoints={sentence.grammarPoints ?? []} />
    </div>
  );
}
