// Fictional, read-only example data for the product screenshots. Nothing here comes from a real conversation.
import { BOT_PALETTES, normalizeBotPalette, botIdentity } from '../../../shared/chat/bot-colors';

type Lang = 'en' | 'zh-CN' | 'zh-TW';
const BASE = new Date(2026, 9, 12, 9, 0).getTime();
const iso = (minute: number) => new Date(BASE + minute * 60000).toISOString();

export function buildScene(language: string, shot: string, systems: any[]) {
  const lang: Lang = language === 'en' ? 'en' : language === 'zh-TW' ? 'zh-TW' : 'zh-CN';
  const L = (en: string, cn: string, tw: string) => (lang === 'en' ? en : lang === 'zh-TW' ? tw : cn);
  let counter = 0;
  const uid = (prefix: string) => `${prefix}-${++counter}`;

  // ---- Bots -------------------------------------------------------------------------------------------------
  const names = [
    L('Research assistant', '研究助手', '研究助手'),
    L('Code assistant', '代码助手', '程式助手'),
    L('Writing assistant', '写作助手', '寫作助手'),
    L('Data analyst', '数据分析师', '資料分析師'),
    L('Design assistant', '设计助手', '設計助手'),
  ];
  const souls = [
    L(
      '# Research assistant\n\nI find sources, check them against each other and say how sure I am.\n\n## How I work\n- Read the primary page before quoting a number.\n- Keep every source link next to the claim it supports.\n- Say so when two sources disagree.\n\n## Boundaries\n- I do not guess prices or dates.\n- Anything I could not verify goes in a separate list.',
      '# 研究助手\n\n我负责查找来源、交叉核对，并说明结论有多确定。\n\n## 工作方式\n- 引用数字之前先读原始页面。\n- 每条结论旁边保留对应的来源链接。\n- 两个来源不一致时直接说明。\n\n## 边界\n- 不猜测价格和日期。\n- 无法核实的内容单独列出。',
      '# 研究助手\n\n我負責查找來源、交叉核對，並說明結論有多確定。\n\n## 工作方式\n- 引用數字之前先讀原始頁面。\n- 每條結論旁邊保留對應的來源連結。\n- 兩個來源不一致時直接說明。\n\n## 邊界\n- 不猜測價格和日期。\n- 無法核實的內容單獨列出。',
    ),
    '',
    '',
    '',
    '',
  ];
  const bots = ['research', 'code', 'writing', 'data', 'designer'].map((id, i) => ({
    id,
    name: names[i],
    soul:
      souls[i] ||
      L(
        `# ${names[i]}\n\nClear, direct and careful with details.`,
        `# ${names[i]}\n\n表达清楚、直接，注重细节。`,
        `# ${names[i]}\n\n表達清楚、直接，注重細節。`,
      ),
    ...normalizeBotPalette(BOT_PALETTES[[11, 16, 10, 12, 17][i]]),
    createdAt: iso(-60 * 24 * 30),
    memories: [],
  }));
  const bot = (id: string) => bots.find((item) => item.id === id)!;
  const identity = (id: string) => botIdentity(bot(id) as any);
  const you = { kind: 'user', id: 'user', name: L('You', '你', '你') };

  // ---- Message helpers ---------------------------------------------------------------------------------------
  const userMessage = (botId: string, minute: number, content: string, extra: object = {}) => ({
    id: uid('user'),
    botId,
    role: 'user',
    content,
    time: iso(minute),
    status: 'done',
    audience: 'user',
    ...extra,
  });
  const note = (botId: string, runId: string, minute: number, content: string, extra: object = {}) => ({
    id: uid('note'),
    botId,
    role: 'assistant',
    content,
    time: iso(minute),
    status: 'done',
    runId,
    presentation: 'progress',
    ...extra,
  });
  const step = (
    botId: string,
    runId: string,
    minute: number,
    tool: string,
    label: string,
    detail?: string,
    result: object = { durationMs: 1400 },
    extra: object = {},
  ) => ({
    id: uid('step'),
    botId,
    role: 'tool',
    tool,
    runId,
    time: iso(minute),
    status: 'done',
    content: JSON.stringify({ result }),
    activity: { label, ...(detail ? { detail } : {}) },
    ...extra,
  });
  const answer = (
    botId: string,
    runId: string,
    minute: number,
    content: string,
    attachments?: object[],
    extra = {},
  ) => ({
    id: uid('answer'),
    botId,
    role: 'assistant',
    content,
    time: iso(minute),
    status: 'done',
    runId,
    presentation: 'answer',
    audience: 'user',
    ...(attachments ? { attachments } : {}),
    ...extra,
  });
  const run = (id: string, botId: string, start: number, end: number, toolCalls: number, extra: object = {}) => ({
    id,
    botId,
    status: 'completed',
    startedAt: iso(start),
    endedAt: iso(end),
    modelCalls: toolCalls + 1,
    toolCalls,
    ...extra,
  });
  const diffOf = (path: string, kind: 'add' | 'update', lines: string[], removed: string[] = []) => ({
    files: [
      {
        path,
        kind,
        added: lines.length,
        removed: removed.length,
        lines: [
          ...removed.map((text) => ({ op: '-' as const, text })),
          ...lines.map((text) => ({ op: '+' as const, text })),
        ],
      },
    ],
  });
  const file = (name: string, size: number, mime: string) => ({ id: 'file-' + name, name, size, mime });
  const researchFile = file('research.md', 3412, 'text/markdown');
  const tableFile = file('comparison.csv', 612, 'text/csv');
  const draftFile = file('announcement.md', 884, 'text/markdown');
  const pageFile = file('index.html', 18240, 'text/html');

  // ---- Research assistant: the main task ----------------------------------------------------------------------
  const research = {
    ask: L(
      'Compare three team note-taking apps: monthly cost for 8 people, export formats and offline use. Put the sources in research.md and give me a table I can paste into the report.',
      '比较三款团队笔记应用：8 个人的月费用、导出格式和离线能力。来源整理进 research.md，再给我一张能直接贴进报告的表格。',
      '比較三款團隊筆記應用：8 個人的月費用、匯出格式和離線能力。來源整理進 research.md，再給我一張能直接貼進報告的表格。',
    ),
    reply: L(
      '## Recommendation: Fieldnote\n\nFor an 8-person team it is the cheapest and exports to the most formats.\n\n| | Fieldnote | Lumen Notes | Paperplane |\n| --- | --- | --- | --- |\n| Cost, 8 seats | **$64** | $66 | $96 |\n| Export | MD, PDF, HTML | MD, DOCX | MD only |\n| Offline | Yes | Desktop | No |\n| SSO | Business | Team | Enterprise |\n\nLumen Notes is within $2 and includes SSO on the team plan, so it is worth a second look if SSO matters. Paperplane only exports Markdown, which makes leaving it later harder.\n\nSources and notes are in `research.md`. `comparison.csv` is the same table, ready to paste.',
      '## 建议：Fieldnote\n\n对 8 人团队来说，它月费最低，支持的导出格式也最多。\n\n| | Fieldnote | Lumen Notes | Paperplane |\n| --- | --- | --- | --- |\n| 8 席位月费 | **$64** | $66 | $96 |\n| 导出 | MD、PDF、HTML | MD、DOCX | 仅 MD |\n| 离线 | 支持 | 仅桌面端 | 不支持 |\n| SSO | 商业版 | 团队版 | 企业版 |\n\nLumen Notes 只贵 $2，而且团队版就带 SSO，如果 SSO 很重要，值得再看一眼。Paperplane 只能导出 Markdown，以后想迁走会比较麻烦。\n\n来源和备注在 `research.md` 里，`comparison.csv` 是同一张表，可以直接粘贴。',
      '## 建議：Fieldnote\n\n對 8 人團隊來說，它月費最低，支援的匯出格式也最多。\n\n| | Fieldnote | Lumen Notes | Paperplane |\n| --- | --- | --- | --- |\n| 8 席位月費 | **$64** | $66 | $96 |\n| 匯出 | MD、PDF、HTML | MD、DOCX | 僅 MD |\n| 離線 | 支援 | 僅桌面端 | 不支援 |\n| SSO | 商業版 | 團隊版 | 企業版 |\n\nLumen Notes 只貴 $2，而且團隊版就附 SSO，如果 SSO 很重要，值得再看一眼。Paperplane 只能匯出 Markdown，以後想遷走會比較麻煩。\n\n來源與備註在 `research.md` 裡，`comparison.csv` 是同一張表，可以直接貼上。',
    ),
    askMore: L(
      'Ask the Writing assistant to turn this into a one-page summary for Thursday’s review.',
      '请写作助手把这份结论整理成一页纸的摘要，周四评审会上用。',
      '請寫作助手把這份結論整理成一頁紙的摘要，週四評審會上用。',
    ),
    replyMore: L(
      'Sent. The Writing assistant has `research.md` and `comparison.csv`, the Thursday deadline and your “one page” limit. The summary will appear in the **Product launch** group when it is ready.',
      '已发出。写作助手拿到了 `research.md`、`comparison.csv`、周四的截止时间和“一页纸”的限制。摘要完成后会发到 **产品发布** 群里。',
      '已送出。寫作助手拿到了 `research.md`、`comparison.csv`、週四的截止時間和「一頁紙」的限制。摘要完成後會發到 **產品發布** 群裡。',
    ),
  };
  const researchPlan = {
    revision: 3,
    goal: L('Prepare the Thursday review pack', '准备周四评审材料', '準備週四評審材料'),
    steps: [
      [L('Compare three note-taking apps', '比较三款笔记应用', '比較三款筆記應用'), 'done'],
      [
        L('Hand the one-pager to the Writing assistant', '把一页纸摘要交给写作助手', '把一頁紙摘要交給寫作助手'),
        'done',
      ],
      [L('Check prices against the vendor pages', '用厂商页面复核价格', '用廠商頁面複核價格'), 'working'],
      [L('Add the comparison to the review deck', '把对比表放进评审幻灯片', '把對比表放進評審投影片'), 'pending'],
    ].map(([title, status], index) => ({
      id: 'step-' + index,
      title,
      acceptance: L('Reviewed by you before it is shared', '分享前由你过目', '分享前由你過目'),
      status,
      evidenceIds: [],
    })),
  };

  const messages: any[] = [
    userMessage('research', 2, research.ask),
    step('research', 'run-research-1', 3, 'web_search', '搜索网页', 'team note-taking apps pricing 2026', {
      durationMs: 2100,
    }),
    step('research', 'run-research-1', 3.5, 'web_read', '阅读网页', 'fieldnote.example/pricing', { durationMs: 1600 }),
    step('research', 'run-research-1', 4, 'web_read', '阅读网页', 'lumen-notes.example/plans', { durationMs: 1300 }),
    step('research', 'run-research-1', 4.5, 'web_read', '阅读网页', 'paperplane.example/docs/export', {
      durationMs: 1800,
    }),
    note(
      'research',
      'run-research-1',
      5,
      L(
        'All three pricing pages loaded. Prices are per seat per month, billed yearly. Writing the sources down now.',
        '三个价格页都读到了。价格按席位每月计算，按年付费。现在把来源记下来。',
        '三個價格頁都讀到了。價格按席位每月計算，按年付費。現在把來源記下來。',
      ),
    ),
    step(
      'research',
      'run-research-1',
      6,
      'file_write',
      '保存文件',
      'research.md',
      { durationMs: 320 },
      {
        diff: diffOf('research.md', 'add', [
          '# Team note-taking apps',
          '',
          '| | Fieldnote | Lumen Notes | Paperplane |',
          '| --- | --- | --- | --- |',
          '| 8 seats | $64 | $66 | $96 |',
        ]),
      },
    ),
    step(
      'research',
      'run-research-1',
      6.5,
      'exec_command',
      '执行命令',
      'python3 build_table.py --seats 8 --out comparison.csv',
      {
        exitCode: 0,
        durationMs: 3200,
      },
    ),
    step(
      'research',
      'run-research-1',
      7,
      'file_write',
      '保存文件',
      'comparison.csv',
      { durationMs: 280 },
      {
        diff: diffOf('comparison.csv', 'add', ['item,Fieldnote,Lumen Notes,Paperplane', 'monthly_8_seats,64,66,96']),
      },
    ),
    step('research', 'run-research-1', 7.5, 'task_update', '更新计划', undefined, { durationMs: 20 }),
    answer('research', 'run-research-1', 8, research.reply, [researchFile, tableFile]),
    userMessage('research', 14, research.askMore),
    step('research', 'run-research-2', 14.5, 'bots_list', '查找协作伙伴', undefined, { durationMs: 80 }),
    step('research', 'run-research-2', 15, 'bot_delegate_task', '委托协作任务', names[2], { durationMs: 420 }),
    answer('research', 'run-research-2', 15.5, research.replyMore),
    ...(shot === 'research'
      ? []
      : [
          step('research', 'run-research-live', 17, 'web_read', '阅读网页', 'fieldnote.example/pricing', {
            durationMs: 1500,
          }),
          step('research', 'run-research-live', 17.5, 'web_read', '阅读网页', 'lumen-notes.example/plans', {
            durationMs: 1200,
          }),
          step(
            'research',
            'run-research-live',
            18,
            'web_read',
            '阅读网页',
            'paperplane.example/pricing',
            {},
            { status: 'running' },
          ),
        ]),
  ];

  // ---- Writing assistant ---------------------------------------------------------------------------------------
  const announce = {
    ask: L(
      'Draft a short note to the team about the new note-taking app. Friendly, under 120 words, and include the migration date.',
      '给团队写一段关于新笔记应用的通知。语气友好，不超过 120 字，并写上迁移日期。',
      '給團隊寫一段關於新筆記應用的通知。語氣友善，不超過 120 字，並寫上遷移日期。',
    ),
    first: L(
      'Here is a draft at 96 words:\n\n> **We are moving our notes to Fieldnote**\n>\n> From **Monday 20 October** the team will use Fieldnote for meeting notes, specs and the weekly digest. It works offline, exports to PDF and HTML, and costs less than the tools we compared.\n>\n> What to do: accept your invite this week and import your notes with the built-in importer. Questions go to #notes.\n\nI kept the date in bold so it survives skimming. Want it warmer or shorter?',
      '初稿共 96 字：\n\n> **我们的笔记要搬到 Fieldnote 了**\n>\n> 从 **10 月 20 日（周一）** 起，团队的会议记录、方案文档和每周简报都使用 Fieldnote。它支持离线，可导出 PDF 和 HTML，价格也比我们对比过的几款更低。\n>\n> 需要你做的：本周内接受邀请，用内置导入工具迁移自己的笔记。有问题请到 #notes 群里问。\n\n日期加粗，方便快速浏览时看到。要更亲切一点，还是再短一点？',
      '初稿共 96 字：\n\n> **我們的筆記要搬到 Fieldnote 了**\n>\n> 從 **10 月 20 日（週一）** 起，團隊的會議記錄、方案文件和每週簡報都使用 Fieldnote。它支援離線，可匯出 PDF 和 HTML，價格也比我們比較過的幾款更低。\n>\n> 需要你做的：本週內接受邀請，用內建匯入工具遷移自己的筆記。有問題請到 #notes 群組問。\n\n日期加粗，方便快速瀏覽時看到。要更親切一點，還是再短一點？',
    ),
    follow: L(
      'Shorter, and say the old workspace stays read-only until the end of the month.',
      '再短一点，并说明旧空间到月底前保持只读。',
      '再短一點，並說明舊空間到月底前保持唯讀。',
    ),
    second: L(
      'Cut to 61 words and saved over `announcement.md`:\n\n> **Notes are moving to Fieldnote on Monday 20 October.** Accept your invite this week and import your notes with the built-in importer. The old workspace stays read-only until 31 October, so nothing is lost. Questions go to #notes.',
      '压缩到 61 字，已覆盖保存到 `announcement.md`：\n\n> **笔记将在 10 月 20 日（周一）迁移到 Fieldnote。** 请本周内接受邀请，并用内置导入工具迁移你的笔记。旧空间到 10 月 31 日前保持只读，不会丢失内容。有问题请到 #notes 群里问。',
      '壓縮到 61 字，已覆蓋儲存到 `announcement.md`：\n\n> **筆記將在 10 月 20 日（週一）遷移到 Fieldnote。** 請本週內接受邀請，並用內建匯入工具遷移你的筆記。舊空間到 10 月 31 日前保持唯讀，不會遺失內容。有問題請到 #notes 群組問。',
    ),
  };
  messages.push(
    userMessage('writing', 20, announce.ask),
    step('writing', 'run-writing-1', 20.5, 'file_read', '读取文件', 'research.md', { durationMs: 30 }),
    step(
      'writing',
      'run-writing-1',
      21,
      'file_write',
      '保存文件',
      'announcement.md',
      { durationMs: 28 },
      {
        diff: diffOf('announcement.md', 'add', [
          '# We are moving our notes to Fieldnote',
          '',
          'From Monday 20 October…',
        ]),
      },
    ),
    answer('writing', 'run-writing-1', 21.5, announce.first, [draftFile]),
    userMessage('writing', 24, announce.follow),
    step(
      'writing',
      'run-writing-2',
      24.5,
      'file_patch',
      '修改文件',
      'announcement.md',
      { durationMs: 33 },
      {
        diff: diffOf(
          'announcement.md',
          'update',
          [
            'Notes are moving to Fieldnote on Monday 20 October.',
            'The old workspace stays read-only until 31 October.',
          ],
          ['From Monday 20 October the team will use Fieldnote for meeting notes, specs and the weekly digest.'],
        ),
      },
    ),
    answer('writing', 'run-writing-2', 25, announce.second, [draftFile]),
  );

  // ---- Code assistant ------------------------------------------------------------------------------------------
  const code = {
    ask: L(
      'tests/export.test.ts passes on my machine but fails on CI. Can you find out why?',
      'tests/export.test.ts 在我电脑上能过，CI 上却失败。帮我查一下原因。',
      'tests/export.test.ts 在我電腦上能過，CI 上卻失敗。幫我查一下原因。',
    ),
    reply: L(
      'The test builds a date with `new Date(2026, 9, 12)` and compares it with a UTC string, so it only passes in time zones east of UTC. CI runs in UTC.\n\nI changed the fixture to `Date.UTC(2026, 9, 12)` and set `TZ=UTC` in the test script. `pnpm test export` now passes with `TZ=America/Los_Angeles` and `TZ=Asia/Tokyo` as well.',
      '这个测试用 `new Date(2026, 9, 12)` 构造日期，再和 UTC 字符串比较，所以只在 UTC 以东的时区能通过，而 CI 跑在 UTC 上。\n\n我把测试数据改成 `Date.UTC(2026, 9, 12)`，并在测试脚本里固定 `TZ=UTC`。现在 `pnpm test export` 在 `TZ=America/Los_Angeles` 和 `TZ=Asia/Tokyo` 下也都能通过。',
      '這個測試用 `new Date(2026, 9, 12)` 建立日期，再和 UTC 字串比較，所以只在 UTC 以東的時區能通過，而 CI 跑在 UTC 上。\n\n我把測試資料改成 `Date.UTC(2026, 9, 12)`，並在測試腳本裡固定 `TZ=UTC`。現在 `pnpm test export` 在 `TZ=America/Los_Angeles` 和 `TZ=Asia/Tokyo` 下也都能通過。',
    ),
  };
  messages.push(
    userMessage('code', 30, code.ask),
    step('code', 'run-code-1', 30.5, 'search_files', '搜索本机文件', 'new Date(2026', {
      matches: [1, 2, 3],
      durationMs: 120,
    }),
    step('code', 'run-code-1', 31, 'file_read', '读取文件', 'export.test.ts', { durationMs: 25 }),
    step('code', 'run-code-1', 32, 'exec_command', '执行命令', 'TZ=America/Los_Angeles pnpm test export', {
      exitCode: 1,
      durationMs: 4200,
    }),
    step(
      'code',
      'run-code-1',
      33,
      'file_patch',
      '修改文件',
      'export.test.ts',
      { durationMs: 31 },
      {
        diff: diffOf(
          'export.test.ts',
          'update',
          ['const day = Date.UTC(2026, 9, 12);'],
          ['const day = new Date(2026, 9, 12);'],
        ),
      },
    ),
    step('code', 'run-code-1', 34, 'exec_command', '执行命令', 'TZ=Asia/Tokyo pnpm test export', {
      exitCode: 0,
      durationMs: 3900,
    }),
    answer('code', 'run-code-1', 35, code.reply),
  );

  // ---- Data analyst --------------------------------------------------------------------------------------------
  messages.push(
    userMessage(
      'data',
      40,
      L(
        'How did weekly sign-ups change in September? Use signups.csv.',
        '9 月每周的注册量有什么变化？用 signups.csv。',
        '9 月每週的註冊量有什麼變化？用 signups.csv。',
      ),
    ),
    step('data', 'run-data-1', 40.5, 'exec_command', '执行命令', 'python3 weekly.py signups.csv', {
      exitCode: 0,
      durationMs: 2600,
    }),
    answer(
      'data',
      'run-data-1',
      41,
      L(
        'Sign-ups grew **18%** over September, from 412 in week 1 to 486 in week 4.\n\n| Week | Sign-ups | Change |\n| --- | --- | --- |\n| 1 | 412 | n/a |\n| 2 | 431 | +4.6% |\n| 3 | 458 | +6.3% |\n| 4 | 486 | +6.1% |\n\nThe jump in week 3 follows the pricing email on 15 September.',
        '9 月注册量增长了 **18%**，从第 1 周的 412 增加到第 4 周的 486。\n\n| 周 | 注册量 | 环比 |\n| --- | --- | --- |\n| 1 | 412 | — |\n| 2 | 431 | +4.6% |\n| 3 | 458 | +6.3% |\n| 4 | 486 | +6.1% |\n\n第 3 周的上升出现在 9 月 15 日发出价格邮件之后。',
        '9 月註冊量成長了 **18%**，從第 1 週的 412 增加到第 4 週的 486。\n\n| 週 | 註冊量 | 環比 |\n| --- | --- | --- |\n| 1 | 412 | — |\n| 2 | 431 | +4.6% |\n| 3 | 458 | +6.3% |\n| 4 | 486 | +6.1% |\n\n第 3 週的上升出現在 9 月 15 日發出價格郵件之後。',
      ),
      [file('weekly-signups.png', 48210, 'image/png')],
    ),
  );

  // ---- Design assistant ----------------------------------------------------------------------------------------
  const systemId = (systems.find((s) => s.id === 'notion') || systems.find((s) => s.id === 'linear') || systems[0]).id;
  const design = {
    title: L('Fieldnote landing page', 'Fieldnote 落地页', 'Fieldnote 落地頁'),
    ask: L(
      'Make a landing page for the Fieldnote team plan: pricing, three feature blocks and a sign-up form. Calm and editorial, please.',
      '给 Fieldnote 团队版做一个落地页：价格、三个功能板块和注册表单。风格安静、偏编辑排版。',
      '給 Fieldnote 團隊版做一個落地頁：價格、三個功能板塊和註冊表單。風格安靜、偏編輯排版。',
    ),
    reply: L(
      'The landing page is ready in the canvas card on the right.\n\n- **Design system:** a quiet, editorial one with a serif display face\n- **Sections:** hero with pricing, three feature blocks, sign-up form\n- **Files:** `index.html` and `styles.css`, plain HTML and CSS\n\nSelect any element in the preview to change its text or style, or mark a region and tell me what to adjust.',
      '落地页已经做好，在右侧的画布卡片里。\n\n- **设计系统：** 安静的编辑风格，标题用衬线体\n- **板块：** 带价格的首屏、三个功能板块、注册表单\n- **文件：** `index.html` 和 `styles.css`，纯 HTML 和 CSS\n\n在预览里选中任意元素就能改文字和样式，也可以框选一块区域告诉我要怎么调整。',
      '落地頁已經做好，在右側的畫布卡片裡。\n\n- **設計系統：** 安靜的編輯風格，標題用襯線體\n- **板塊：** 帶價格的首屏、三個功能板塊、註冊表單\n- **檔案：** `index.html` 和 `styles.css`，純 HTML 和 CSS\n\n在預覽裡選取任意元素就能改文字和樣式，也可以框選一塊區域告訴我要怎麼調整。',
    ),
  };
  messages.push(
    userMessage('designer', 50, design.ask),
    step('designer', 'run-design-1', 50.5, 'skill_read', '阅读技能', 'web-ui-design', { durationMs: 60 }),
    step(
      'designer',
      'run-design-1',
      51,
      'file_write',
      '保存文件',
      'index.html',
      { durationMs: 45 },
      {
        diff: diffOf('index.html', 'add', ['<!doctype html>', '<main class="page">', '  <section class="hero">…']),
      },
    ),
    step(
      'designer',
      'run-design-1',
      52,
      'file_write',
      '保存文件',
      'styles.css',
      { durationMs: 40 },
      {
        diff: diffOf('styles.css', 'add', [':root { --paper: #faf7f1; --ink: #1c1b19; }']),
      },
    ),
    step('designer', 'run-design-1', 53, 'view_image', '查看图片', 'preview.png', { durationMs: 900 }),
    answer('designer', 'run-design-1', 54, design.reply, [pageFile]),
  );

  // ---- Work sessions -------------------------------------------------------------------------------------------
  const sessions = [
    {
      id: 'session-pricing',
      botId: 'research',
      name: L('Q4 pricing review', 'Q4 价格复核', 'Q4 價格複核'),
      createdAt: iso(-300),
      updatedAt: iso(60),
    },
    {
      id: 'session-landing',
      botId: 'research',
      name: L('Competitor landing pages', '竞品落地页', '競品落地頁'),
      createdAt: iso(-200),
      updatedAt: iso(55),
    },
    {
      id: 'session-flaky',
      botId: 'code',
      name: L('Flaky export test', '导出测试不稳定', '匯出測試不穩定'),
      createdAt: iso(-100),
      updatedAt: iso(36),
    },
  ];
  messages.push(
    userMessage(
      'research',
      56,
      L(
        'Check the Q4 price changes for the three vendors.',
        '核对三家厂商 Q4 的价格变动。',
        '核對三家廠商 Q4 的價格變動。',
      ),
      {
        sessionId: 'session-pricing',
      },
    ),
    answer(
      'research',
      'run-session-1',
      57,
      L(
        'Only Paperplane changed prices: +$1 per seat from 1 November.',
        '只有 Paperplane 调价：11 月 1 日起每席位 +$1。',
        '只有 Paperplane 調價：11 月 1 日起每席位 +$1。',
      ),
      undefined,
      { sessionId: 'session-pricing' },
    ),
  );
  const runs: any[] = [
    run('run-research-1', 'research', 2, 8, 8),
    run('run-research-2', 'research', 14, 16, 2),
    ...(shot === 'research'
      ? []
      : [
          {
            id: 'run-research-live',
            botId: 'research',
            status: 'running',
            startedAt: iso(16.5),
            modelCalls: 4,
            toolCalls: 3,
            workItemId: 'plan-1',
          },
        ]),
    run('run-writing-1', 'writing', 20, 22, 2),
    run('run-writing-2', 'writing', 24, 24.9, 1),
    run('run-code-1', 'code', 30, 35, 5),
    run('run-data-1', 'data', 40, 41, 1),
    run('run-design-1', 'designer', 50, 54, 4, { designSessionId: 'design-landing' }),
    run('run-session-1', 'research', 56, 57, 1, { sessionId: 'session-pricing' }),
  ];

  // ---- Design task ---------------------------------------------------------------------------------------------
  const designSession = {
    id: 'design-landing',
    botId: 'designer',
    origin: { kind: 'bot', id: 'designer' },
    title: design.title,
    kind: 'prototype',
    brief: design.ask,
    engineVersion: 'designer-v1',
    systemId,
    systemVersion: null,
    status: 'review',
    stage: 'delivery',
    revision: 3,
    createdAt: iso(50),
    updatedAt: iso(54),
    designSpec: '',
    constraints: [],
    artifacts: [
      { path: 'index.html', name: 'index.html', kind: 'html', revision: 'r3', bytes: 18240, verifiedAt: iso(54) },
    ],
    userEdits: [],
    checks: [],
    runIds: ['run-design-1'],
    workspacePath: 'designers/designer/landing',
  };
  const designFiles = [
    { name: 'index.html', path: 'designers/designer/landing/index.html', size: 18240, modifiedAt: iso(54) },
    { name: 'styles.css', path: 'designers/designer/landing/styles.css', size: 6120, modifiedAt: iso(53) },
  ];

  // ---- Plan, schedules, approval ---------------------------------------------------------------------------------
  const showWork = shot !== 'research';
  const workItems = !showWork
    ? []
    : [
        {
          id: 'plan-1',
          botId: 'research',
          scope: { kind: 'bot', id: 'research' },
          kind: 'plan',
          objective: researchPlan.goal,
          status: 'running',
          createdBy: 'user',
          createdAt: iso(1),
          updatedAt: iso(16),
          runIds: ['run-research-2', 'run-research-live'],
          activeRunId: 'run-research-live',
          approvedAt: iso(1),
          plan: researchPlan,
        },
      ];
  const zone = 'Europe/Amsterdam';
  const scheduledTasks = [
    {
      id: 'task-digest',
      target: { kind: 'bot', id: 'research' },
      title: L('Monday digest', '周一简报', '週一簡報'),
      prompt: 'Summarize pricing and release changes from the three vendors.',
      schedule: { kind: 'weekly', time: '09:00', weekdays: [1], timeZone: zone },
      status: 'enabled',
      nextRunAt: iso(60 * 24 * 6),
      createdAt: iso(-1000),
      updatedAt: iso(-1000),
      createdBy: { kind: 'user', id: 'user', name: you.name },
    },
    {
      id: 'task-signups',
      target: { kind: 'bot', id: 'data' },
      title: L('Daily sign-up report', '每日注册报表', '每日註冊報表'),
      prompt: 'Post yesterday’s sign-ups to the Product launch group.',
      schedule: { kind: 'daily', time: '08:30', timeZone: zone },
      status: 'enabled',
      nextRunAt: iso(60 * 23),
      createdAt: iso(-900),
      updatedAt: iso(-900),
      createdBy: { kind: 'user', id: 'user', name: you.name },
    },
  ];
  const interactions =
    shot === 'approval'
      ? [
          {
            id: 'ask-1',
            botId: 'code',
            runId: 'run-code-approval',
            createdAt: iso(60),
            kind: 'host_permission',
            details: {
              operation: 'command',
              reason: L(
                'Run the export tests again with the fixed time zone.',
                '用固定后的时区重新运行导出测试。',
                '用固定後的時區重新執行匯出測試。',
              ),
              command: 'pnpm test export',
              cwd: 'C:\\work\\fieldnote-site',
              commandPattern: { kind: 'prefix', pattern: 'pnpm test' },
            },
          },
        ]
      : [];
  if (shot === 'approval') {
    runs.push({
      id: 'run-code-approval',
      botId: 'code',
      status: 'running',
      startedAt: iso(58),
      modelCalls: 3,
      toolCalls: 2,
    });
    messages.push(
      userMessage('code', 58, L('Run the export tests again.', '再跑一遍导出测试。', '再跑一遍匯出測試。')),
      step('code', 'run-code-approval', 59, 'file_read', '读取文件', 'package.json', { durationMs: 20 }),
      step(
        'code',
        'run-code-approval',
        59.5,
        'exec_command',
        '执行命令',
        'pnpm test export',
        { durationMs: 1 },
        { status: 'running' },
      ),
    );
  }

  // ---- Group chat -------------------------------------------------------------------------------------------------
  const roomMembers = ['research', 'data', 'writing', 'designer'];
  const rooms = [
    {
      id: 'launch',
      name: L('Product launch', '产品发布', '產品發布'),
      members: roomMembers.map((id) => ({ ...identity(id), joinedAt: iso(0) })),
      createdBy: you,
      updatedAt: iso(48),
      preview: L('Draft is in the group. Thursday works.', '初稿已发到群里，周四可以。', '初稿已發到群組，週四可以。'),
      unread: 0,
      lastSeq: 5,
      pending: 0,
    },
    {
      id: 'digest',
      name: L('Weekly digest', '每周简报', '每週簡報'),
      members: ['research', 'writing'].map((id) => ({ ...identity(id), joinedAt: iso(0) })),
      createdBy: you,
      updatedAt: iso(-120),
      preview: L('Monday’s digest is posted.', '周一的简报已发出。', '週一的簡報已發出。'),
      unread: 0,
      lastSeq: 2,
      pending: 0,
    },
  ];
  const groupText = [
    [
      'user',
      L(
        'Team, we pick a note-taking app by Thursday. @Research assistant compare the options, @Data analyst check the numbers, @Writing assistant draft the one-pager.',
        '各位，周四之前要选定笔记应用。@研究助手 对比候选，@数据分析师 核对数字，@写作助手 起草一页纸摘要。',
        '各位，週四之前要選定筆記應用。@研究助手 比較候選，@資料分析師 核對數字，@寫作助手 起草一頁紙摘要。',
      ),
      undefined,
    ],
    [
      'research',
      L(
        'Three candidates shortlisted: Fieldnote, Lumen Notes, Paperplane. Pricing pages and export docs are in `research.md`; for 8 seats Fieldnote is $64, Lumen $66, Paperplane $96 a month.',
        '入围三款：Fieldnote、Lumen Notes、Paperplane。价格页和导出文档都整理在 `research.md` 里，8 个席位每月分别是 $64、$66、$96。',
        '入圍三款：Fieldnote、Lumen Notes、Paperplane。價格頁和匯出文件都整理在 `research.md` 裡，8 個席位每月分別是 $64、$66、$96。',
      ),
      [researchFile],
    ],
    [
      'data',
      L(
        'Checked every figure against the vendor pages. One fix: Lumen’s price is $39 for the first 5 seats, then $9 each, which makes it $66 and not $63. Corrected table attached.',
        '所有数字都对照厂商页面核对过了。有一处要改：Lumen 前 5 个席位 $39，之后每席位 $9，所以是 $66，不是 $63。已附上更正后的表格。',
        '所有數字都對照廠商頁面核對過了。有一處要改：Lumen 前 5 個席位 $39，之後每席位 $9，所以是 $66，不是 $63。已附上更正後的表格。',
      ),
      [tableFile],
    ],
    [
      'writing',
      L(
        '**One-pager draft:** recommend Fieldnote. Lowest cost at 8 seats, widest export, works offline. Lumen Notes is a close second if SSO is required.',
        '**一页纸初稿：** 建议选 Fieldnote。8 个席位费用最低，导出格式最全，支持离线；如果必须有 SSO，Lumen Notes 是接近的第二选择。',
        '**一頁紙初稿：** 建議選 Fieldnote。8 個席位費用最低，匯出格式最全，支援離線；如果必須有 SSO，Lumen Notes 是接近的第二選擇。',
      ),
      [file('one-pager.md', 1180, 'text/markdown')],
    ],
    [
      'designer',
      L(
        'I put the comparison on one slide for the review. The table is a real, editable table.',
        '我把对比表做成了一页评审用的幻灯片，表格是真正可编辑的表格。',
        '我把對比表做成了一頁評審用的投影片，表格是真正可編輯的表格。',
      ),
      [
        file(
          'comparison-slide.pptx',
          61440,
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ),
      ],
    ],
  ];
  const groupMessages = groupText.map(([who, content, attachments], index) => ({
    id: 'group-' + index,
    seq: index + 1,
    groupId: 'launch',
    kind: 'message',
    time: iso(40 + index * 1.5),
    sender: who === 'user' ? you : { kind: 'bot', ...identity(who as string) },
    content,
    ...(attachments ? { attachments } : {}),
  }));
  const groupThreads: Record<string, any> = {
    launch: { group: rooms[0], messages: groupMessages, deliveries: [] },
    digest: { group: rooms[1], messages: [], deliveries: [] },
  };

  // ---- Private messages between Bots ---------------------------------------------------------------------------------
  const threads = [
    {
      id: 'peer-demo',
      members: [identity('research'), identity('data')],
      updatedAt: iso(47),
      preview: L(
        'Table checked. Corrected CSV attached.',
        '表格已核对，更正后的 CSV 在附件里。',
        '表格已核對，更正後的 CSV 在附件裡。',
      ),
      messageCount: 4,
      pending: 0,
    },
  ];
  const exchanges = [
    {
      id: 'exchange-demo',
      threadId: 'peer-demo',
      fromBotId: 'research',
      toBotId: 'data',
      status: 'completed',
      createdAt: iso(44),
      updatedAt: iso(47),
    },
  ];
  const privateTexts: Array<[string, string, string, object[] | undefined]> = [
    [
      'research',
      'request',
      L(
        'Can you check the prices in `research.md` against the vendor pages and tell me which ones are off? I need a clean table for the group.',
        '能帮我把 `research.md` 里的价格对照厂商页面核一遍，告诉我哪些不对吗？我需要一张干净的表格发到群里。',
        '能幫我把 `research.md` 裡的價格對照廠商頁面核一遍，告訴我哪些不對嗎？我需要一張乾淨的表格發到群組。',
      ),
      [researchFile],
    ],
    [
      'data',
      'reply',
      L(
        'On it. I will also recompute the 8-seat totals instead of trusting the rounded figures.',
        '收到。8 席位的总价我也会重新算一遍，不直接用四舍五入后的数字。',
        '收到。8 席位的總價我也會重新算一遍，不直接用四捨五入後的數字。',
      ),
      undefined,
    ],
    [
      'data',
      'reply',
      L(
        'Table checked. One price was off: Lumen is $39 for the first 5 seats and $9 for each extra seat, so 8 seats cost $66 (not $63). Corrected CSV attached.',
        '表格核对完了。有一个价格不对：Lumen 前 5 个席位 $39，每增加一席 $9，所以 8 席位是 $66（不是 $63）。更正后的 CSV 已附上。',
        '表格核對完了。有一個價格不對：Lumen 前 5 個席位 $39，每增加一席 $9，所以 8 席位是 $66（不是 $63）。更正後的 CSV 已附上。',
      ),
      [tableFile],
    ],
    [
      'research',
      'request',
      L(
        'Thanks. I will use that in the group summary.',
        '谢谢，我会把它用在群里的总结里。',
        '謝謝，我會把它用在群組的總結裡。',
      ),
      undefined,
    ],
  ];
  const privateChat = {
    thread: threads[0],
    exchanges,
    messages: privateTexts.map(([who, kind, content, attachments], index) => ({
      id: 'peer-' + index,
      exchangeId: 'exchange-demo',
      sender: identity(who),
      content,
      kind,
      time: iso(44 + index),
      ...(attachments ? { attachments } : {}),
    })),
  };
  if (shot === 'handoff')
    messages.push({
      id: 'notice',
      botId: 'research',
      role: 'event',
      content: '',
      time: iso(44),
      peer: { exchangeId: 'exchange-demo', direction: 'sent' },
    });

  // ---- File previews ----------------------------------------------------------------------------------------------------
  const researchDoc = L(
    '# Team note-taking apps\n\nCompiled 12 October from vendor pricing and documentation pages. Prices are per seat per month, billed yearly.\n\n| | Fieldnote | Lumen Notes | Paperplane |\n| --- | --- | --- | --- |\n| Plan used | Business | Team | Pro |\n| Price | $8 per seat | $39 for 5 seats, then $9 | $12 per seat |\n| **8 seats** | **$64** | **$66** | **$96** |\n| Free tier | 3 members | 1 member | none |\n| Export | Markdown, PDF, HTML | Markdown, DOCX | Markdown only |\n| Offline | Desktop and mobile | Desktop | No |\n| Search | Full text and tags | Full text | Titles only |\n| SSO | Business plan | Team plan | Enterprise only |\n\n## Notes\n\n- Lumen Notes is the cheapest up to 5 seats; Fieldnote is cheaper from 6 seats on.\n- Paperplane exports Markdown only, so leaving it later needs a script.\n- Paperplane raises prices by $1 per seat on 1 November.\n\n## Sources\n\n1. fieldnote.example/pricing, checked 12 Oct\n2. lumen-notes.example/plans, checked 12 Oct\n3. paperplane.example/docs/export, checked 12 Oct',
    '# 团队笔记应用对比\n\n10 月 12 日根据厂商价格页和文档整理。价格按席位每月计算，按年付费。\n\n| | Fieldnote | Lumen Notes | Paperplane |\n| --- | --- | --- | --- |\n| 对比的套餐 | 商业版 | 团队版 | 专业版 |\n| 价格 | 每席位 $8 | 5 席位 $39，之后每席位 $9 | 每席位 $12 |\n| **8 席位** | **$64** | **$66** | **$96** |\n| 免费版 | 3 名成员 | 1 名成员 | 无 |\n| 导出 | Markdown、PDF、HTML | Markdown、DOCX | 仅 Markdown |\n| 离线 | 桌面端和手机端 | 桌面端 | 不支持 |\n| 搜索 | 全文和标签 | 全文 | 仅标题 |\n| SSO | 商业版 | 团队版 | 仅企业版 |\n\n## 备注\n\n- 5 个席位以内 Lumen Notes 最便宜，从 6 个席位起 Fieldnote 更便宜。\n- Paperplane 只能导出 Markdown，以后迁走需要写脚本。\n- Paperplane 将在 11 月 1 日起每席位涨价 $1。\n\n## 来源\n\n1. fieldnote.example/pricing，10 月 12 日查看\n2. lumen-notes.example/plans，10 月 12 日查看\n3. paperplane.example/docs/export，10 月 12 日查看',
    '# 團隊筆記應用比較\n\n10 月 12 日根據廠商價格頁和文件整理。價格按席位每月計算，按年付費。\n\n| | Fieldnote | Lumen Notes | Paperplane |\n| --- | --- | --- | --- |\n| 比較的方案 | 商業版 | 團隊版 | 專業版 |\n| 價格 | 每席位 $8 | 5 席位 $39，之後每席位 $9 | 每席位 $12 |\n| **8 席位** | **$64** | **$66** | **$96** |\n| 免費版 | 3 名成員 | 1 名成員 | 無 |\n| 匯出 | Markdown、PDF、HTML | Markdown、DOCX | 僅 Markdown |\n| 離線 | 桌面端與手機端 | 桌面端 | 不支援 |\n| 搜尋 | 全文與標籤 | 全文 | 僅標題 |\n| SSO | 商業版 | 團隊版 | 僅企業版 |\n\n## 備註\n\n- 5 個席位以內 Lumen Notes 最便宜，從 6 個席位起 Fieldnote 更便宜。\n- Paperplane 只能匯出 Markdown，以後遷走需要寫腳本。\n- Paperplane 將在 11 月 1 日起每席位漲價 $1。\n\n## 來源\n\n1. fieldnote.example/pricing，10 月 12 日查看\n2. lumen-notes.example/plans，10 月 12 日查看\n3. paperplane.example/docs/export，10 月 12 日查看',
  );
  const previews: Record<string, any> = {
    default: { kind: 'markdown', content: researchDoc },
  };

  // ---- Skills, providers -----------------------------------------------------------------------------------------------
  const skillSource = { label: 'AelionBot', path: '', scope: 'builtin', readonly: true };
  const skillRows: Array<[string, string, string, string]> = [
    ['web-research', '网页调研与信息核验', 'Web research and fact checking', '網頁調研與資訊核驗'],
    ['data-analysis', '数据分析与可视化', 'Data analysis and charts', '資料分析與視覺化'],
    ['document-writing', '文档与报告', 'Documents and reports', '文件與報告'],
    ['spreadsheet-workbench', '表格与数据整理', 'Spreadsheets', '表格與資料整理'],
    ['presentation-design', '演示文稿设计', 'Presentation design', '簡報設計'],
    ['pdf-workbench', 'PDF 制作与处理', 'PDF tools', 'PDF 製作與處理'],
    ['web-ui-design', '网页与界面设计', 'Web and interface design', '網頁與介面設計'],
    ['code-development', '代码开发与问题排查', 'Code development and debugging', '程式開發與問題排查'],
  ];
  const skills = skillRows.map(([id, cn, en, tw]) => ({
    id: 'aelion-' + id,
    name: id,
    description: L(en, cn, tw),
    body: '',
    enabled: true,
    source: skillSource,
  }));
  const providers = [
    {
      id: 'prov-cloud',
      name: L('Cloud service', '云端服务', '雲端服務'),
      baseUrl: 'https://api.example.invalid/v1',
      hasKey: true,
      models: [
        { id: 'large-reasoning', contextTokens: 400000, reasoningEffort: 'high', supportsImages: true },
        { id: 'fast-chat', contextTokens: 200000, supportsImages: true },
      ],
    },
    {
      id: 'prov-local',
      name: L('Local model', '本地模型', '本機模型'),
      baseUrl: 'http://127.0.0.1:11434/v1',
      hasKey: false,
      models: [{ id: 'local-8b', contextTokens: 64000 }],
    },
  ];

  // ---- A Werewolf match for the AI games window ----------------------------------------------------------------------------
  const guests = ['Mina', 'Theo', 'Iris', 'Jun', 'Nora', 'Otto', 'Pia'];
  const seatNames = ['Rowan', names[0], names[3], names[2], names[4], ...guests];
  const seatColors = seatNames.map(
    (_, i) => normalizeBotPalette(BOT_PALETTES[(i * 3 + 2) % BOT_PALETTES.length]).color,
  );
  const seats = seatNames.map((name, i) => ({
    id: 'seat-' + (i + 1),
    name,
    color: seatColors[i],
    human: i === 0,
    alive: ![6, 9].includes(i),
    ...(i === 0 ? { role: 'seer', revealed: true } : {}),
    ...(i >= 1 && i <= 4 ? { botId: roomMembers[i - 1] } : {}),
  }));
  const say = (day: number, phase: string, seat: number | undefined, text: string, id: number) => ({
    id,
    day,
    phase,
    scope: 'shared',
    ...(seat ? { seatId: 'seat-' + seat } : {}),
    text,
    time: BASE + id * 20000,
  });
  const game =
    shot === 'game'
      ? {
          id: 'game-1',
          groupId: 'launch',
          board: 'standard12',
          revision: 14,
          day: 2,
          phase: 'speech',
          status: 'running',
          sheriffId: 'seat-3',
          humanId: 'seat-1',
          seats,
          pending: [],
          clock: { seatId: 'seat-4', remainingMs: 42000, deadlineAt: Date.now() + 42000 },
          notes: [],
          logs: [
            say(
              1,
              'night',
              undefined,
              L(
                'Night 1 begins. The wolves choose a target.',
                '第 1 夜开始，狼人正在选择目标。',
                '第 1 夜開始，狼人正在選擇目標。',
              ),
              1,
            ),
            say(
              1,
              'night',
              undefined,
              L('You inspected Pia: a villager.', '你查验了 Pia：好人。', '你查驗了 Pia：好人。'),
              2,
            ),
            say(
              2,
              'resolution',
              undefined,
              L(
                'Day 2 begins. Jun died during the night.',
                '第 2 天开始，Jun 在夜里死亡。',
                '第 2 天開始，Jun 在夜裡死亡。',
              ),
              3,
            ),
            say(
              2,
              'speech',
              3,
              L(
                'I trust Pia. She spoke first yesterday and her vote matched mine. I would look at whoever pushed Jun’s name.',
                '我相信 Pia。她昨天第一个发言，投票和我一致。我会看昨天推 Jun 的人。',
                '我相信 Pia。她昨天第一個發言，投票和我一致。我會看昨天推 Jun 的人。',
              ),
              4,
            ),
            say(
              2,
              'speech',
              2,
              L(
                'Agreed on Pia, and I would add that Otto stayed quiet on every vote so far. I am voting him today.',
                '同意 Pia 没问题，另外 Otto 到现在每轮投票都没表态，我今天投他。',
                '同意 Pia 沒問題，另外 Otto 到現在每輪投票都沒表態，我今天投他。',
              ),
              5,
            ),
            say(
              2,
              'speech',
              8,
              L(
                'I only said nothing because I had no information. Check who defended Nora yesterday.',
                '我没说话是因为没有信息。看看昨天是谁在替 Nora 说话。',
                '我沒說話是因為沒有資訊。看看昨天是誰在替 Nora 說話。',
              ),
              6,
            ),
          ],
        }
      : null;

  // ---- Fonts ----------------------------------------------------------------------------------------------------------------
  const fonts: any[] = [];

  const text = {
    vmStopped: L('Work computer is stopped', '工作电脑尚未启动', '工作電腦尚未啟動'),
    designTitle: design.title,
  };
  const state = {
    bots,
    messages,
    runs,
    workItems,
    workSessions: sessions,
    scheduledTasks,
    interactions,
    providers,
    defaultModel: { providerId: 'prov-cloud', model: 'large-reasoning', contextTokens: 400000 },
    designer: { systems, sessions: [designSession] },
  };
  return {
    state,
    text,
    skills,
    game,
    rooms,
    threads,
    exchanges,
    groupThreads,
    privateChat,
    previews,
    designFiles,
    fonts,
  };
}

/** A small stand-in for the page thumbnail the main process normally renders. */
export function designThumbnail(title: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#faf7f1"/><rect x="40" y="36" width="560" height="14" rx="3" fill="#1c1b19" opacity=".12"/><text x="40" y="136" font-family="Georgia, serif" font-size="46" fill="#1c1b19">${title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text><rect x="40" y="168" width="360" height="10" rx="3" fill="#1c1b19" opacity=".25"/><rect x="40" y="190" width="300" height="10" rx="3" fill="#1c1b19" opacity=".18"/><rect x="40" y="232" width="150" height="40" rx="20" fill="#3b5b4a"/><g fill="#fff" stroke="#1c1b19" stroke-opacity=".12"><rect x="40" y="304" width="170" height="70" rx="8"/><rect x="235" y="304" width="170" height="70" rx="8"/><rect x="430" y="304" width="170" height="70" rx="8"/></g></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
