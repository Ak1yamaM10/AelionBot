import type { SiteLanguage } from './site-i18n';

/** Copy that only the redesigned homepage uses. Shared strings stay in site-i18n.ts and the content files. */
interface HomeCopy {
  benchmarkNav: string;
  heroMeta: string;
  heroLead: string;
  heroMore: string;
  workspace: { kicker: string; title: string; description: string };
  scrollCue: string;
  statementKicker: string;
  statementTitle: string;
  statementBody: string;
  facts: Array<{ value: string; label: string }>;
  faqKicker: string;
  downloadKicker: string;
  downloadLead: string;
  steps: string[];
  trust: string[];
  footerProduct: string;
  footerResources: string;
  backToTop: string;
}

export const homeCopy: Record<SiteLanguage, HomeCopy> = {
  en: {
    benchmarkNav: 'Benchmark',
    heroMeta: 'Windows · macOS · Free app, bring your own model',
    heroLead: 'A desktop workspace for a team of AI agents.',
    heroMore: 'See what it does',
    workspace: {
      kicker: 'WORKSPACE',
      title: 'One window for every partner',
      description:
        'Pick a Bot or group on the left, work in the conversation, and keep the work computer and schedules in view on the right.',
    },
    scrollCue: 'Scroll',
    statementKicker: 'WHAT IT IS',
    statementTitle: 'A team of Bots, each with its own role, model and tools.',
    statementBody: 'Give research, code, writing and design one partner each, working alone or together in a group.',
    facts: [
      { value: '152', label: 'design systems built in' },
      { value: '82.4%', label: 'on Terminal-Bench 2.1' },
      { value: '3', label: 'interface languages' },
    ],
    faqKicker: 'FAQ',
    downloadKicker: 'GET STARTED',
    downloadLead: 'The app is free. Connect the model service you already use, or a local model.',
    steps: ['Download', 'Connect a model', 'Hand it a task'],
    trust: ['Files and chats stay on your computer', 'Windows 10+ (64-bit) · macOS on Apple silicon and Intel'],
    footerProduct: 'Product',
    footerResources: 'Resources',
    backToTop: 'Back to top',
  },
  'zh-CN': {
    benchmarkNav: '评测',
    heroMeta: 'Windows · macOS · 应用免费，模型自选',
    heroLead: '一个让多个 AI Agent 协同工作的桌面空间。',
    heroMore: '了解功能',
    workspace: {
      kicker: '工作台',
      title: '一个窗口，管理所有伙伴',
      description: '左侧选择 Bot 或群聊，中间处理任务，右侧查看工作电脑和定时任务。',
    },
    scrollCue: '向下',
    statementKicker: '这是什么',
    statementTitle: '一组 Bot，各有职责、模型和工具。',
    statementBody: '调研、代码、写作和设计各交给一位伙伴，单独工作，或在群聊里分工。',
    facts: [
      { value: '152', label: '套设计系统预装' },
      { value: '82.4%', label: 'Terminal-Bench 2.1 成绩' },
      { value: '3', label: '种界面语言' },
    ],
    faqKicker: '问答',
    downloadKicker: '开始使用',
    downloadLead: '应用免费。接入你正在用的模型服务，或本地模型即可开始。',
    steps: ['下载', '接入模型', '交给它一项任务'],
    trust: ['文件和对话保存在你的电脑上', 'Windows 10 及以上（64 位）· macOS（Apple 芯片与 Intel）'],
    footerProduct: '产品',
    footerResources: '资源',
    backToTop: '回到顶部',
  },
  'zh-TW': {
    benchmarkNav: '評測',
    heroMeta: 'Windows · macOS · 應用程式免費，模型自選',
    heroLead: '一個讓多個 AI Agent 協同工作的桌面空間。',
    heroMore: '了解功能',
    workspace: {
      kicker: '工作台',
      title: '一個視窗，管理所有夥伴',
      description: '左側選擇 Bot 或群組，中間處理工作，右側查看工作電腦和排程。',
    },
    scrollCue: '向下',
    statementKicker: '這是什麼',
    statementTitle: '一組 Bot，各有職責、模型和工具。',
    statementBody: '調研、程式、寫作和設計各交給一位夥伴，單獨工作，或在群組裡分工。',
    facts: [
      { value: '152', label: '套設計系統預裝' },
      { value: '82.4%', label: 'Terminal-Bench 2.1 成績' },
      { value: '3', label: '種介面語言' },
    ],
    faqKicker: '問答',
    downloadKicker: '開始使用',
    downloadLead: '應用程式免費。接上你正在用的模型服務，或本機模型即可開始。',
    steps: ['下載', '接上模型', '交給它一項工作'],
    trust: ['檔案和對話保存在你的電腦上', 'Windows 10 以上（64 位元）· macOS（Apple 晶片與 Intel）'],
    footerProduct: '產品',
    footerResources: '資源',
    backToTop: '回到頂部',
  },
};
