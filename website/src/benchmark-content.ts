import type { SiteLanguage } from './site-i18n';

interface BenchmarkRow {
  label: string;
  value: number;
  margin?: number;
  note: string;
}
interface BenchmarkCopy {
  kicker: string;
  title: string;
  description: string;
  rows: BenchmarkRow[];
  scale: string;
  points: string[];
  link: string;
}
export const benchmarkCopy: Record<SiteLanguage, BenchmarkCopy> = {
  'zh-CN': {
    kicker: '评测',
    title: 'Terminal-Bench 2.1 成绩 82.4%',
    description:
      '同一套引擎也能在命令行里运行。在 Terminal-Bench 2.1 的 89 道高难度终端任务上，AelionBot 搭配 Grok 4.5（high）通过了 82.4% 的试验，高于榜单上同一模型搭配 Cursor CLI 的 79.3%。',
    rows: [
      { label: 'AelionBot + Grok 4.5（high）', value: 82.4, note: '我们自己的运行 · 267 次试验通过 220 次' },
      { label: 'Cursor CLI + Grok 4.5（high）', value: 79.3, margin: 1.5, note: '官方榜单' },
    ],
    scale: '通过率',
    points: [
      '这是我们自己的一次运行，每题 3 次，不是榜单条目。',
      '我们的 95% 置信区间是 75.6–89.2%，与官方数字有重叠，更准确的理解是“不低于官方成绩”。',
      '方法、逐题结果和复现脚本都已公开。',
    ],
    link: '查看评测方法',
  },
  'zh-TW': {
    kicker: '評測',
    title: 'Terminal-Bench 2.1 成績 82.4%',
    description:
      '同一套引擎也能在命令列裡執行。在 Terminal-Bench 2.1 的 89 道高難度終端任務上，AelionBot 搭配 Grok 4.5（high）通過了 82.4% 的試驗，高於榜單上同一模型搭配 Cursor CLI 的 79.3%。',
    rows: [
      { label: 'AelionBot + Grok 4.5（high）', value: 82.4, note: '我們自己的執行 · 267 次試驗通過 220 次' },
      { label: 'Cursor CLI + Grok 4.5（high）', value: 79.3, margin: 1.5, note: '官方榜單' },
    ],
    scale: '通過率',
    points: [
      '這是我們自己的一次執行，每題 3 次，不是榜單條目。',
      '我們的 95% 信賴區間是 75.6–89.2%，與官方數字有重疊，更準確的理解是「不低於官方成績」。',
      '方法、逐題結果和重現腳本都已公開。',
    ],
    link: '查看評測方法',
  },
  en: {
    kicker: 'BENCHMARK',
    title: '82.4% on Terminal-Bench 2.1',
    description:
      'The same engine also runs from the command line. On Terminal-Bench 2.1, 89 hard terminal tasks, AelionBot with Grok 4.5 (high) passed 82.4% of trials, above the 79.3% listed for the same model in Cursor CLI.',
    rows: [
      { label: 'AelionBot + Grok 4.5 (high)', value: 82.4, note: 'Our run · 220 of 267 trials passed' },
      { label: 'Cursor CLI + Grok 4.5 (high)', value: 79.3, margin: 1.5, note: 'Official leaderboard' },
    ],
    scale: 'Pass rate',
    points: [
      'This is our own run with 3 attempts per task, not a leaderboard entry.',
      'Our 95% confidence interval, 75.6–89.2%, overlaps the official figure, so read it as on par or better.',
      'The method, per-task results and reproduction scripts are public.',
    ],
    link: 'Read the method',
  },
};
