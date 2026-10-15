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
      '在 Terminal-Bench 2.1 的 89 道终端任务上，AelionBot 搭配 Grok 4.5（high）通过 82.4%，高于同一模型搭配 Cursor CLI 的 79.3%。',
    rows: [
      { label: 'AelionBot + Grok 4.5（high）', value: 82.4, note: '我们自己的运行 · 267 次试验通过 220 次' },
      { label: 'Cursor CLI + Grok 4.5（high）', value: 79.3, margin: 1.5, note: '官方榜单' },
    ],
    scale: '通过率',
    points: ['我们自己的运行，每题 3 次，不是榜单条目。', '95% 置信区间 75.6–89.2%，可以理解为不低于官方成绩。'],
    link: '查看评测方法',
  },
  'zh-TW': {
    kicker: '評測',
    title: 'Terminal-Bench 2.1 成績 82.4%',
    description:
      '在 Terminal-Bench 2.1 的 89 道終端任務上，AelionBot 搭配 Grok 4.5（high）通過 82.4%，高於同一模型搭配 Cursor CLI 的 79.3%。',
    rows: [
      { label: 'AelionBot + Grok 4.5（high）', value: 82.4, note: '我們自己的執行 · 267 次試驗通過 220 次' },
      { label: 'Cursor CLI + Grok 4.5（high）', value: 79.3, margin: 1.5, note: '官方榜單' },
    ],
    scale: '通過率',
    points: ['我們自己的執行，每題 3 次，不是榜單條目。', '95% 信賴區間 75.6–89.2%，可以理解為不低於官方成績。'],
    link: '查看評測方法',
  },
  en: {
    kicker: 'BENCHMARK',
    title: '82.4% on Terminal-Bench 2.1',
    description:
      'On the 89 tasks of Terminal-Bench 2.1, AelionBot with Grok 4.5 (high) passed 82.4%, above the 79.3% for the same model in Cursor CLI.',
    rows: [
      { label: 'AelionBot + Grok 4.5 (high)', value: 82.4, note: 'Our run · 220 of 267 trials passed' },
      { label: 'Cursor CLI + Grok 4.5 (high)', value: 79.3, margin: 1.5, note: 'Official leaderboard' },
    ],
    scale: 'Pass rate',
    points: [
      'Our own run, 3 attempts per task, not a leaderboard entry.',
      '95% confidence interval 75.6–89.2%: on par or better.',
    ],
    link: 'Read the method',
  },
};
