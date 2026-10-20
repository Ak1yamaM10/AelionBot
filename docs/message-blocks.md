# 消息内自定义块（Message Blocks）

Bot 在回复里插入结构化内容：图表、指标、表格、可交互计算器、自定义组件。正文仍然是 Markdown；块是独立的数据，由应用渲染，不把 HTML/JS 直接塞进消息。

设计稿：`.local/design/message-blocks.html`（浅色/深色、静态块、交互块、自定义组件、失败降级）。

**当前实现**：`chart`、`metrics`、`table`、`timeline`、`callout`、`calculator` 已接入；块用 `[[block:id]]` 穿插在段落之间，没有标记的块追加在回答末尾。`form`、`ui`、`app` 和「发回对话」尚未实现。

## 1. 目标与非目标

**目标**

- 模型用一次工具调用就能给出「图 + 结论」，而不是让用户去开附件或预览。
- 交互块（税率换算、贷款对比、单位换算）在本地即时计算，不产生模型调用。
- 块跟随主题、宽度、字号和无障碍设置，和现有消息视觉一致。
- 块可持久化、可复制、可导出、可在群聊里显示；连接器只有文字时自动降级。
- 模型产出的内容永远不获得应用权限：不能读文件、不能发消息、不能联网。

**非目标（v1）**

- 不在消息里执行模型写的任意 JavaScript。
- 不做任意 HTML/CSS 的「网页片段」渲染（现有 `DocumentPreview` 已经用 `sandbox=""` 做过无脚本预览）。
- 不让块替代附件/预览：大文件、完整网页、PPT 仍然走附件和设计任务。
- 不做块内实时协作或多人编辑。

## 2. 现状与约束

几个会直接影响设计的事实：

1. **消息渲染是 react-markdown，没有 `rehype-raw`**。模型输出的 HTML 不会被执行，这是现有安全边界，必须保留。
2. **`RunMessage` 会把最终回答之前的 reasoning、进度文字、工具步骤折叠成一行**（`runSteps`）。所以块不能挂在中间那条 progress 消息上，否则会被折进过程里看不见。块挂在 run 上；最终回答里用 `[[block:id]]` 标记插入位置，没有标记的块追加在末尾。
3. **应用 CSP 很严**：`script-src 'self'`，`frame-src 'self' data: blob:`。`DocumentPreview` 的 iframe 用 `sandbox=""`，脚本完全不跑。自定义组件的沙箱要单独设计，不能直接放宽主窗口 CSP。
4. **群聊和私聊各有自己的渲染路径**：群聊在 `GroupConversation.tsx` 里用 `MentionContent`，Bot 私聊在 `PeerChats.tsx` 里用 `Markdown`。块渲染要抽成组件，三处复用。
5. **连接器只回最终文字**（飞书/企微/微信）。块必须有 `fallback` 文本，连接器发 fallback，不发 JSON。
6. **消息会进模型上下文**。块如果以 JSON 形式留在 `content` 里，会污染后续每一轮请求和 prompt cache。

## 3. 三种块

不要用「一种万能块」解决所有问题。按可信度和能力分三层：

### 3.1 静态块（应用渲染，声明式数据）

| 类型 | 用途 | 关键字段 |
| --- | --- | --- |
| `chart` | 折线、柱状、堆叠、面积、饼/环、迷你趋势 | `chartType`, `series[]`, `categories[]`, `unit` |
| `metrics` | 2–4 个 KPI，带同比/环比 | `items[{label,value,delta,tone}]` |
| `table` | 可排序表格，单元格支持数字、百分比、货币格式 | `columns[]`, `rows[][]`, `align`, `format` |
| `timeline` | 步骤、事件、版本历史 | `items[{time,title,detail,state}]` |
| `callout` | 提示、警告、结论 | `tone`, `title`, `text` |

静态块全部由应用代码画，模型只提供数据。没有脚本，没有网络，没有布局逃逸。

已实现：`chart`、`metrics`、`table`、`timeline`、`callout`；`form`、`ui` 待做。

### 3.2 交互块（应用渲染，本地计算）

| 类型 | 用途 |
| --- | --- |
| `calculator` | 输入 + 公式/税率表 + 结果 + 明细；税率换算、贷款、汇率、单位换算 |
| `form` | 通用输入（number/text/select/switch/slider）+ 按钮；按钮可以「发回对话」或「复制」 |
| `ui` | 自定义组件：由声明式组件树拼出来（stack/grid/text/metric/chart/table/input/button/divider） |

交互只发生在应用代码里，模型给的是 schema，不是可执行代码。输入默认不离开本机；只有用户点「继续问 Bot」时才把结构化结果作为一条用户消息发出去。

### 3.3 逃生口：`app`（沙箱，后续阶段）

真正需要任意 HTML/JS 的自定义组件，用独立的 `block-sandbox.html` 承载：

- iframe `sandbox="allow-scripts"`（不加 `allow-same-origin`，得到不透明源），`allow-forms`、`allow-popups`、`allow-top-navigation`、`allow-modals` 全部不给。
- 沙箱文档自己的 CSP：`default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval'; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'`。只在沙箱文档里放开 `unsafe-eval`，主窗口不放。
- 高度通过 `postMessage` 上报，父窗口校验 `event.source === iframe.contentWindow` 和每个块独立的 nonce。
- **默认不自动运行**：显示「运行交互组件」按钮，用户点击后才挂载 iframe。模型写的代码不是可信代码，不能让它在消息列表里静默执行。
- 只能通过桥接 API 做两件事：`copy(text)`、`sendMessage(text)`；两者都要用户手势，且父窗口再做一次长度/频率限制。

v1 不实现 `app`；先把 `ui` 组件树做扎实，大多数「自定义组件」不需要任意 JS。

## 4. 数据模型

```ts
// shared/chat/message-blocks.ts
export type BlockType = 'chart' | 'metrics' | 'table' | 'timeline' | 'callout' | 'calculator' | 'form' | 'ui' | 'app';

export interface MessageBlockBase {
  id: string;
  type: BlockType;
  version: 1;
  title?: string;
  caption?: string;
  /** 纯文本摘要：连接器、复制、导出、块渲染失败时使用。 */
  fallback: string;
  createdAt: string;
}

export interface ChartBlock extends MessageBlockBase {
  type: 'chart';
  spec: {
    chartType: 'line' | 'bar' | 'area' | 'stacked-bar' | 'pie' | 'donut' | 'scatter' | 'sparkline';
    categories: string[];
    series: Array<{ name: string; values: Array<number | null>; axis?: 'left' | 'right'; color?: string }>;
    unit?: string;
    yAxis?: { min?: number; max?: number; format?: 'number' | 'percent' | 'currency' };
    highlight?: number; // 高亮某个分类下标
  };
}

export interface CalculatorBlock extends MessageBlockBase {
  type: 'calculator';
  spec: {
    inputs: Array<{
      id: string;
      label: string;
      type: 'number' | 'percent' | 'money';
      value: number;
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
    }>;
    /** 简单公式；与 brackets 二选一。 */
    formula?: string;
    /** 阶梯计算，例如个税：按 upTo 分档，rate + quickDeduction。 */
    brackets?: Array<{ upTo: number | null; rate: number; quickDeduction?: number }>;
    outputs: Array<{ id: string; label: string; formula: string; unit?: string; format?: 'number' | 'money' | 'percent' }>;
    note?: string;
  };
}

export interface UiBlock extends MessageBlockBase {
  type: 'ui';
  spec: { root: UiNode };
}

export type UiNode =
  | { kind: 'stack'; direction?: 'row' | 'column'; gap?: number; children: UiNode[] }
  | { kind: 'grid'; columns: number; children: UiNode[] }
  | { kind: 'text'; text: string; tone?: 'body' | 'muted' | 'strong'; size?: 'sm' | 'md' | 'lg' }
  | { kind: 'metric'; label: string; value: string; delta?: string; tone?: 'up' | 'down' | 'flat' }
  | { kind: 'chart'; spec: ChartBlock['spec'] }
  | { kind: 'table'; spec: TableBlock['spec'] }
  | { kind: 'input'; id: string; label: string; inputType: 'number' | 'range' | 'text' | 'select'; value: string | number; options?: string[] }
  | { kind: 'button'; label: string; action: BlockAction }
  | { kind: 'divider' };
```

消息/运行记录上：

```ts
export interface ChatMessage {
  // ...
  /** 仅最终回答消息持有；中间 progress 会被折叠，不挂块。 */
  blocks?: MessageBlock[];
}

export interface RunRecord {
  /** 本次 run 产出的块，按调用顺序；最终回答渲染后展示。 */
  blocks?: MessageBlock[];
}
```

选择 run 级而不是消息级，是因为 `RunMessage` 只保留最终回答；块挂在 run 上，折叠逻辑不用改，重跑/续跑也不会丢。消息级字段保留给「续跑后把块固定到某条历史回答」的场景。

## 5. 模型接口

新增一个工具，而不是每类块一个工具（否则工具列表膨胀、prompt 变大、模型选择困难）：

```ts
tool(
  'message_block',
  '在回复里插入一个结构化块：图表、指标、表格、时间线、提示或计算器。只放数据，不放 HTML/JS。一次回答最多 4 个；返回 id 后把 [[block:id]] 单独一行放在正文中，块会穿插在段落之间。用户要的是结论时先写结论，再用块补充证据。',
  {
    type: { type: 'string', enum: [...] },
    spec: { type: 'object' },   // 按 type 在服务端校验
    title: { type: 'string', maxLength: 120 },
    fallback: { type: 'string', maxLength: 600 },
  },
  ['type', 'spec', 'fallback'],
);
```

为什么 `spec` 用宽泛的 object 而不是完整 JSON Schema 联合：

- 联合 schema 会非常长，常驻工具列表，影响每一轮请求和 prompt cache。
- 服务端校验可以给出更具体的中文错误（「series[0].values 长度与 categories 不一致」），模型下一轮能改对。
- 工具描述里给 2–3 个最小示例即可，模型不需要看完整 schema。

校验规则（`shared/chat/message-blocks.ts`）：

- `type` 必须是已知类型，`version` 固定 1。
- `fallback` 必填，纯文本，≤ 600 字；没有 fallback 的块拒绝。
- `chart`：categories ≤ 60，series ≤ 6，单序列 ≤ 60 点；数值必须是有限数；`pie` 只允许一个序列且非负。
- `table`：行 ≤ 200，列 ≤ 12，单元格 ≤ 500 字。
- `calculator`：输入 ≤ 8，输出 ≤ 6；公式只允许标识符、数字、`+ - * / ( )`、`min max round floor ceil abs`；不允许属性访问、函数调用以外的语法、字符串。
- `form` / `ui` / `app`：v1 未开放。
- 单条消息/单个 run：块 ≤ 4，总序列化 ≤ 64 KB。

失败时返回 `AppError('block.invalid', ...)`，错误里带路径；工具结果里 `{ saved: false, error }`，模型可以修正后重试。连续两次失败就停止，避免死循环。

**非工具模型**：兼容路径是 fenced block：

````text
```aelion-block
{"type":"chart","spec":{...},"fallback":"..."}
```
````

`MessageMarkdown` 的 `code` 组件识别 `language-aelion-block`，解析成功就渲染，失败就保留代码块并提示。渲染前同样过校验。进入下一轮上下文时，把整段 fence 替换成 `[chart] fallback 文本`，避免 JSON 污染。

## 6. 渲染

```
RunMessage
  ├─ RunProcess（折叠的过程）
  └─ 最终回答 Message
       ├─ 段落（Markdown）
       ├─ MessageBlock（[[block:id]] 的位置）
       ├─ 段落
       └─ 未标记的块（按创建顺序追加）
```

- 新组件 `src/chat/MessageBlocks.tsx`：按 `type` 从 registry 取渲染器；每个块包一层 `BlockErrorBoundary`，单个块崩了不影响消息。
- 块在气泡内，和正文同宽；卡片自身有边框和底色，移动端 100%。
- 主题：只用 CSS 变量/`light-dark()`，不写死颜色；图表颜色从固定的 6 色语义调色板取，深色模式自动换。
- 字号：正文 14px，块标题 14px，标签和数据 12px；只有图表轴标签允许 11px，不用 10px 及以下。能删掉的说明文字就删掉，不靠小字堆信息。
- 无障碍：图表 `role="img"` + 一句 `aria-label` 摘要；输入有 label；键盘可操作。
- 失败：显示 `fallback` + 「组件无法显示」，附一个可复制的原始数据 disclosure；未知 `type`/`version` 同样降级，不白屏。
- 复制：计算器可以复制当前结果；正文复制时去掉 `[[block:id]]` 标记。
- 打印/导出：块渲染为静态图/表；交互块导出当前输入和结果。

## 7. 交互

- **本地动作**（排序、切换序列、拖动滑块、复制）不产生消息、不调用模型。
- **发回对话（待做）**：`BlockAction = { kind: 'send'; label: string; template: string }`，点击后生成一条普通用户消息，正文由模板和当前输入渲染，例如「如果社保降到 18%，税后是多少？」；同时带一个结构化 `blockAction` 字段（`blockId`, `values`），模型能看到精确数值。
- 这条消息走正常 run：可审计、可引用、可重试；不会出现「块自己改了数字但对话里没有记录」。
- 群聊里的块：v1 不开放 `message_block`，避免块在群聊渲染路径里丢失。
- 输入状态默认只存在组件内存；需要跨重启保留时，写到 `message.blockState[blockId]`（debounced），并在 snapshot 里同步。v1 先不做持久化。

## 8. 安全

| 威胁 | 处理 |
| --- | --- |
| 模型输出 `<script>` / 事件属性 | 不走 `dangerouslySetInnerHTML`；Markdown 不启用 `rehype-raw`；`app` 块在无 same-origin 的 sandbox iframe 里 |
| 块里偷读应用数据 | 块渲染器只拿到自己的 `spec`，不注入 store、IPC、`window.aelion` |
| 块里发网络请求 | 静态/交互块没有网络能力；`app` 沙箱 CSP `connect-src 'none'`，图片只允许 data/blob |
| 块伪造应用 UI 骗密钥 | 块有明确边框和「由 Bot 生成」标识；`app` 块点击后才运行；输入框不接受密码类型 |
| 公式注入 | 自写表达式解析器，白名单 AST；不用 `eval`/`new Function` |
| 超大 spec 拖垮渲染 | 服务端和客户端双重上限；图表点数、表格行列、UI 节点数都有上限 |
| 模型借块绕过审批 | 块工具不执行任何系统操作；「发回对话」只是普通用户消息，仍走权限 |
| 连接器泄露内部数据 | 只发 `fallback`；`fallback` 由模型写、服务端截断，不含 spec |

## 9. 上下文与成本

- 块的 spec **不进** 后续模型上下文；只放一行摘要：`[block chart] 季度营收与毛利率：Q1 1,240 …`，或直接用 `fallback`。
- 工具结果本身很短：`{ saved: true, blockId, type }`，不重复 spec。
- 同一 run 内重复调用相同 `type + spec` 去重，返回已有 `blockId`。
- 块不改变系统提示和工具列表的顺序；`message_block` 放在工具列表固定位置，避免破坏 prompt cache。
- 如果模型反复生成块但不写结论，continuation 里提示「先给结论，块是补充」，最多纠正两次。

## 10. 各界面

| 界面 | 行为 |
| --- | --- |
| Bot 主对话 / 工作会话 | 完整渲染，交互可用 |
| 群聊 | v1 不开放 `message_block`；后续接入 `GroupConversation` 后再渲染 |
| Bot 私聊（peer） | v1 不开放；块只在主对话和工作会话显示 |
| 连接器（飞书/企微/微信） | 正文去掉 `[[block:id]]`，追加各块的 `fallback` |
| 复制/引用 | 复制 `fallback`；引用时带块标题 |
| 导出/诊断 | 导出 `fallback` + spec（诊断包默认不含 spec，避免泄露业务数据） |

## 11. 版本与兼容

- 每个块有 `version`；渲染器按 `type@version` 注册，未知版本降级为 fallback。
- 新增字段向后兼容；删除/改语义要升 `version`。
- 旧版本应用收到新块：显示 fallback 卡片 + 「需要更新应用」。
- 状态库只存 JSON，不需要迁移；`blocks` 是可缺省字段。

## 12. 分阶段

**Phase 1（已完成）**

- `chart`、`metrics`、`table`、`timeline`、`callout` 五种静态块。
- `message_block` 工具 + 服务端校验 + run 级存储 + `[[block:id]]` 穿插渲染 + fallback。
- 主对话、工作会话；连接器降级为 fallback；群聊/私聊/headless 隐藏该工具。
- 测试：校验、公式、marker 分段、工具落库。

**Phase 2（部分完成）**

- `calculator` 已完成：表达式解析、税率表、本地计算、复制结果。
- 待做：`form`、发回对话、块状态持久化、块内数据表/CSV、fenced block 兼容路径。

**Phase 3**

- `ui` 组件树。
- `app` 沙箱（点击运行、postMessage 桥、独立 CSP）。
- 块更新（同一 `blockId` 原地更新，而不是追加）。

## 13. 测试

- `tests/message-blocks.test.ts`：合法/非法 spec、图表长度、表格行列、fallback 必填、税率计算、公式注入（`constructor`/`__proto__`/除零）、marker 分段、工具落库。
- 尚未覆盖：渲染快照、单块错误边界、深色主题、群聊/连接器、上下文摘要、发回对话。

## 14. 待定

1. `chart` 是否要支持双 Y 轴（设计稿里的营收 + 毛利率就是双轴）；如果不要，毛利率应改成单独的指标块。
2. 自定义组件先做 `ui` 声明式树，还是直接上 `app` 沙箱？前者安全、可主题化；后者自由度高但需要点击运行和更重的安全评审。
3. 交互块的「发回对话」是否要自动发送，还是先填到输入框让用户确认？自动发送更顺，但可能产生意外模型调用。
4. 块内是否需要「查看数据表/CSV」和单块复制？目前只有计算器复制结果。
