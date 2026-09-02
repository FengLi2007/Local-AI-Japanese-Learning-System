// 言の葉 — 共有型定義

export interface Token {
  surface: string;       // 表面形
  reading: string;       // 假名読み
  lemma: string;         // 辞書形
  pos: string;           // 品詞
  posDetail: string;     // 品詞細分類
  isContent: boolean;    // 実詞かどうか
  translation?: string;  // 対応する中国語
  colorIndex?: number;   // アラインメント色
}

export interface PitchData {
  surface: string;
  reading: string;
  accentNucleus: number;  // 0 = 平板型
  moraCount: number;
  accentType: string;     // 平板型/頭高型/中高型/尾高型
  found: boolean;         // DB に存在するか
}

export interface GrammarMatch {
  id: string;
  pattern: string;
  meaningZh: string;
  jlptLevel: number;
  connection: string;
  usageNotes: string;
  examples: { ja: string; zh: string }[];
  isRepeat: boolean;      // 以前学んだことがあるか
  previousExample?: string;
  daysSinceLastSeen?: number;
}

export interface SentenceAnalysis {
  original: string;
  tokens: Token[];
  translation: string;
  alignmentValid: boolean;
  pitchData: PitchData[];
  grammarPoints: GrammarMatch[];
}

export interface AnalysisResult {
  inputText: string;
  sentences: SentenceAnalysis[];
  analyzedAt: string;
  historyId?: string;
}

export interface DictionaryEntry {
  id: string;
  surface: string;
  reading: string;
  meanings: { lang: string; text: string }[];
  pos: string;
  jlptLevel: number | null;
  isCommon: boolean;
}

export interface KnowledgePoint {
  id: string;
  pointType: string;
  name: string;
  contactCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  exampleSentences: string[];
}

export interface HistoryRecord {
  id: string;
  inputText: string;
  sentenceCount: number;
  createdAt: string;
}
