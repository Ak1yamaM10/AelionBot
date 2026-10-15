import type { SiteLanguage } from './site-i18n';
interface Feature {
  kicker: string;
  title: string;
  description: string;
  points: string[];
  /** Only where something must be said, such as where bundled material comes from. */
  note?: string;
}
interface CapabilityCopy {
  nav: string[];
  design: Feature;
  vm: Feature;
  group: Feature;
}
export const capabilityCopy: Record<SiteLanguage, CapabilityCopy> = {
  'zh-CN': {
    nav: ['多 Agent 协作', '工作电脑', '内置设计'],
    design: {
      kicker: '03 / 设计 · 每个 Bot',
      title: '内置设计系统',
      description: '任何 Bot 都能做网页原型、可编辑 PPT 和网站复刻。',
      points: [
        '152 套设计系统和字体库随应用预装',
        '画布就在对话旁，可以框选、标注、直接修改',
        '不用启动 VM，也不用换 Bot',
      ],
      note: '设计系统参考来自 OpenDesign，保留来源与许可；品牌风格不代表官方合作。',
    },
    vm: {
      kicker: '02 / Linux VM',
      title: 'Linux 工作电脑',
      description: '通用 Bot 在受管理的 Linux VM 里工作，你可以随时查看、暂停或接管。',
      points: ['每个 Bot 有自己的工作目录和桌面', '浏览器、终端和办公应用都能用', '本机文件和命令仍按你的权限执行'],
    },
    group: {
      kicker: '01 / 多 AGENT 协作',
      title: '多 Agent 群聊',
      description: '把职责不同的 Bot 拉进一个群，共享文件，@ 谁就由谁接手。',
      points: ['每个 Bot 有自己的职责、模型和工具', '群成员共享材料和产出文件', '群聊只用群内上下文，不混入私聊'],
    },
  },
  'zh-TW': {
    nav: ['多 Agent 協作', '工作電腦', '內建設計'],
    design: {
      kicker: '03 / 設計 · 每個 Bot',
      title: '內建設計系統',
      description: '任何 Bot 都能做網頁原型、可編輯 PPT 與網站複刻。',
      points: [
        '152 套設計系統與字型庫隨應用預裝',
        '畫布就在對話旁，可以框選、標註、直接修改',
        '不用啟動 VM，也不用換 Bot',
      ],
      note: '設計系統參考來自 OpenDesign，保留來源與授權；品牌風格不代表官方合作。',
    },
    vm: {
      kicker: '02 / Linux VM',
      title: 'Linux 工作電腦',
      description: '通用 Bot 在受管理的 Linux VM 裡工作，你可以隨時查看、暫停或接管。',
      points: [
        '每個 Bot 有自己的工作目錄和桌面',
        '瀏覽器、終端機和辦公應用程式都能用',
        '本機檔案和命令仍依你的權限執行',
      ],
    },
    group: {
      kicker: '01 / 多 AGENT 協作',
      title: '多 Agent 群組',
      description: '把職責不同的 Bot 拉進一個群組，共享檔案，@ 誰就由誰接手。',
      points: ['每個 Bot 有自己的職責、模型與工具', '群組成員共享資料與產出檔案', '群組只用群內上下文，不混入私訊'],
    },
  },
  en: {
    nav: ['Multi-agent teamwork', 'Work computer', 'Built-in design'],
    design: {
      kicker: '03 / DESIGN · EVERY BOT',
      title: 'Built-in design systems',
      description: 'Any Bot can build web prototypes, editable presentations and website clones.',
      points: [
        '152 design systems and a font library built in',
        'A canvas beside the chat to select, annotate and edit',
        'No VM needed, no switching Bots',
      ],
      note: 'Design systems come from OpenDesign with sources and licenses retained; brand-inspired styles do not imply endorsement.',
    },
    vm: {
      kicker: '02 / LINUX VM',
      title: 'Linux work computer',
      description: 'General Bots work in a managed Linux VM. Watch, pause or take over at any time.',
      points: [
        'Each Bot has its own workspace and desktop',
        'Browser, terminal and office apps included',
        'Host files and commands still follow your permissions',
      ],
    },
    group: {
      kicker: '01 / MULTI-AGENT COLLABORATION',
      title: 'Multi-agent group chat',
      description: 'Put Bots with different roles in one group, share files, and @ whoever should take the next step.',
      points: [
        'Each Bot has its own role, model and tools',
        'Members share materials and output files',
        'Group context stays apart from private chats',
      ],
    },
  },
};
