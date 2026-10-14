// Personal WeChat through the ClawBot plugin's iLink bot API (experimental): HTTP JSON with a 35-second long poll for
// messages. Replies must carry the context token of the user's latest message, and the bot cannot start a chat.
// The protocol is not formally documented; it follows Tencent's MIT-licensed @tencent-weixin/openclaw-weixin.
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AdapterHandlers, ConnectorAdapter, InboundMessage, InboundResource } from '../connector-adapter';
import { plainText, splitText } from '../format';

const WEIXIN_BASE_URL = 'https://ilinkai.weixin.qq.com';
const CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c';
const LONG_POLL_MS = 35_000;
const TEXT_CHARS = 2000;
const STALE_TOKEN = -14;
const ITEM = { text: 1, image: 2, voice: 3, file: 4, video: 5 } as const;

export interface WeixinCredentials {
  token: string;
  baseUrl: string;
  /** ilink_bot_id */
  accountId: string;
  /** ilink_user_id: the WeChat user who scanned and owns this bot. */
  userId: string;
}
type Fetch = typeof fetch;

/** Common headers; `bot_agent` names this client the way a User-Agent does. */
function headers(token?: string) {
  return {
    'Content-Type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    'X-WECHAT-UIN': Buffer.from(String(randomBytes(4).readUInt32BE(0))).toString('base64'),
    'iLink-App-Id': 'bot',
    'iLink-App-ClientVersion': String((2 << 16) | (4 << 8) | 10),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
const baseInfo = (version: string) => ({ channel_version: '2.4.10', bot_agent: `AelionBot/${version}` });
/** Message IDs are uint64; quote them before parsing so they survive as strings. */
const parse = (text: string) => JSON.parse(text.replace(/"(message_id|msg_id|svr_id)"\s*:\s*(-?\d+)/g, '"$1":"$2"'));

async function post(
  fetcher: Fetch,
  baseUrl: string,
  endpoint: string,
  body: unknown,
  token?: string,
  signal?: AbortSignal,
) {
  const response = await fetcher(new URL(endpoint, baseUrl.replace(/\/?$/, '/')), {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(body),
    signal,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`微信接口错误 ${response.status}`);
  return parse(text || '{}');
}

/** Starts a ClawBot login: the QR code page to scan and the key to poll with. */
export async function weixinQrCode(fetcher: Fetch = fetch, baseUrl = WEIXIN_BASE_URL) {
  const result = await post(fetcher, baseUrl, 'ilink/bot/get_bot_qrcode?bot_type=3', { local_token_list: [] });
  if (!result?.qrcode || !result?.qrcode_img_content) throw new Error('微信没有返回登录二维码');
  return { key: String(result.qrcode), url: String(result.qrcode_img_content) };
}
export type WeixinLoginState =
  | { status: 'wait' | 'scaned' | 'expired' | 'need_verifycode' | 'verify_code_blocked' | 'binded_redirect' }
  | { status: 'redirect'; baseUrl: string }
  | { status: 'confirmed'; credentials: WeixinCredentials };
/** One long poll of a login: returns when its state changes or after about 35 seconds. */
export async function weixinLoginStatus(
  key: string,
  options: { baseUrl?: string; verifyCode?: string; signal?: AbortSignal; fetch?: Fetch } = {},
): Promise<WeixinLoginState> {
  const baseUrl = options.baseUrl || WEIXIN_BASE_URL;
  let endpoint = `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(key)}`;
  if (options.verifyCode) endpoint += `&verify_code=${encodeURIComponent(options.verifyCode)}`;
  const timeout = AbortSignal.timeout(LONG_POLL_MS + 5000),
    signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let result: any;
  try {
    const response = await (options.fetch || fetch)(new URL(endpoint, baseUrl.replace(/\/?$/, '/')), {
      headers: { 'iLink-App-Id': 'bot', 'iLink-App-ClientVersion': String((2 << 16) | (4 << 8) | 10) },
      signal,
    });
    result = response.ok ? JSON.parse(await response.text()) : { status: 'wait' };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { status: 'wait' };
  }
  if (result.status === 'scaned_but_redirect' && result.redirect_host)
    return { status: 'redirect', baseUrl: `https://${result.redirect_host}` };
  if (result.status === 'confirmed') {
    if (!result.bot_token || !result.ilink_bot_id) throw new Error('微信登录没有返回凭证');
    return {
      status: 'confirmed',
      credentials: {
        token: String(result.bot_token),
        baseUrl: String(result.baseurl || baseUrl),
        accountId: String(result.ilink_bot_id),
        userId: String(result.ilink_user_id || ''),
      },
    };
  }
  return ['scaned', 'expired', 'need_verifycode', 'verify_code_blocked', 'binded_redirect'].includes(result.status)
    ? { status: result.status }
    : { status: 'wait' };
}

/** An AES-128 key as WeChat sends it: 16 raw bytes, or 32 hex characters, base64-encoded. */
function mediaKey(value: string) {
  if (/^[0-9a-f]{32}$/i.test(value)) return Buffer.from(value, 'hex');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length === 16) return decoded;
  if (/^[0-9a-f]{32}$/i.test(decoded.toString('ascii'))) return Buffer.from(decoded.toString('ascii'), 'hex');
  throw new Error('微信媒体密钥无效');
}

export class WeixinAdapter implements ConnectorAdapter {
  readonly platform = 'weixin' as const;
  private stopped = true;
  private poll?: AbortController;
  /** The latest context token per user; every reply must carry one. */
  private contexts = new Map<string, string>();
  private tickets = new Map<string, string>();
  constructor(
    private credentials: WeixinCredentials,
    private cursor: string,
    private version: string,
    private fetcher: Fetch = fetch,
    private retryMs = 5000,
    contexts: Record<string, string> = {},
  ) {
    for (const [chat, token] of Object.entries(contexts)) this.contexts.set(chat, token);
  }
  start(handlers: AdapterHandlers) {
    this.stopped = false;
    void this.loop(handlers);
  }
  private async loop(handlers: AdapterHandlers) {
    handlers.status('connecting');
    let failures = 0;
    while (!this.stopped) {
      this.poll = new AbortController();
      try {
        const result = await post(
          this.fetcher,
          this.credentials.baseUrl,
          'ilink/bot/getupdates',
          { get_updates_buf: this.cursor, base_info: baseInfo(this.version) },
          this.credentials.token,
          AbortSignal.any([this.poll.signal, AbortSignal.timeout(LONG_POLL_MS + 10_000)]),
        );
        if (result.errcode === STALE_TOKEN || result.ret === STALE_TOKEN) {
          handlers.status('needs-config', '微信登录已失效，请删除后重新扫码连接');
          return;
        }
        if (result.ret && result.ret !== 0) throw new Error(result.errmsg || `微信返回错误 ${result.ret}`);
        failures = 0;
        handlers.status('connected');
        if (typeof result.get_updates_buf === 'string' && result.get_updates_buf !== this.cursor) {
          this.cursor = result.get_updates_buf;
          handlers.state?.({ cursor: this.cursor });
        }
        for (const message of result.msgs || []) {
          const inbound = this.inbound(message);
          if (!inbound) continue;
          // Replies after a restart still need the latest token, so it is kept with the cursor.
          handlers.state?.({ contexts: JSON.stringify(Object.fromEntries(this.contexts)) });
          handlers.message(inbound);
        }
      } catch (error) {
        if (this.stopped) return;
        if ((error as Error).name === 'TimeoutError') continue;
        failures++;
        handlers.status(failures > 2 ? 'error' : 'connecting', (error as Error).message);
        await new Promise((resolve) => setTimeout(resolve, Math.min(60_000, this.retryMs * failures)));
      }
    }
  }
  private inbound(message: any): InboundMessage | undefined {
    // message_type 1 is a user's message; the bot's own messages come back as 2.
    if (message?.message_type !== 1 || !message.from_user_id) return;
    const chatId = String(message.from_user_id);
    if (message.context_token) this.contexts.set(chatId, String(message.context_token));
    const texts: string[] = [],
      resources: InboundResource[] = [];
    let quoted: string | undefined;
    for (const item of message.item_list || []) {
      if (item.type === ITEM.text && item.text_item?.text) texts.push(item.text_item.text);
      else if (item.type === ITEM.voice && item.voice_item?.text) texts.push(item.voice_item.text);
      else if (item.type === ITEM.image) this.media(resources, 'image', item.image_item, item.image_item?.aeskey);
      else if (item.type === ITEM.file)
        this.media(resources, 'file', item.file_item, undefined, item.file_item?.file_name);
      else if (item.type === ITEM.video) this.media(resources, 'video', item.video_item);
      if (item.ref_msg?.message_item?.text_item?.text) quoted = item.ref_msg.message_item.text_item.text;
      else if (item.ref_msg?.title) quoted = item.ref_msg.title;
    }
    return {
      messageId: String(message.message_id || message.client_id || randomUUID()),
      chatId,
      isGroup: Boolean(message.group_id),
      sender: { id: chatId },
      text: texts.join('\n').trim(),
      ...(quoted ? { quoted } : {}),
      resources,
      sentAt: Number(message.create_time_ms) || Date.now(),
    };
  }
  private media(
    resources: InboundResource[],
    kind: 'image' | 'file' | 'video',
    item: any,
    hexKey?: string,
    name?: string,
  ) {
    const media = item?.media;
    if (!media?.full_url && !media?.encrypt_query_param) return;
    resources.push({
      kind,
      name,
      fetch: async (signal) => {
        const url =
          media.full_url ||
          `${CDN_BASE_URL}/download?encrypted_query_param=${encodeURIComponent(media.encrypt_query_param)}`;
        const response = await this.fetcher(url, { signal });
        if (!response.ok) throw new Error(`微信文件下载失败（${response.status}）`);
        const data = Buffer.from(await response.arrayBuffer()),
          key = hexKey || media.aes_key,
          bytes = key ? decipher(data, mediaKey(key)) : data;
        const fallback = `${kind}-${Date.now().toString(36)}${kind === 'image' ? '.jpg' : kind === 'video' ? '.mp4' : ''}`;
        return { name: name || fallback, bytes };
      },
    });
  }
  async stop() {
    this.stopped = true;
    this.poll?.abort();
  }
  private async send(chatId: string, item: Record<string, unknown>) {
    const context = this.contexts.get(chatId);
    if (!context) throw new Error('微信只能回复对方发来的消息，请先在微信里给 Bot 发一条消息');
    const result = await post(
      this.fetcher,
      this.credentials.baseUrl,
      'ilink/bot/sendmessage',
      {
        msg: {
          from_user_id: '',
          to_user_id: chatId,
          client_id: 'aelion-' + randomUUID(),
          message_type: 2,
          message_state: 2,
          item_list: [item],
          context_token: context,
        },
        base_info: baseInfo(this.version),
      },
      this.credentials.token,
      AbortSignal.timeout(15_000),
    );
    if (result.ret && result.ret !== 0) throw new Error(result.errmsg || `微信发送失败（${result.ret}）`);
  }
  async sendText(chatId: string, text: string) {
    for (const part of splitText(plainText(text), TEXT_CHARS))
      await this.send(chatId, { type: ITEM.text, text_item: { text: part } });
  }
  async sendFile(chatId: string, file: { name: string; bytes: Buffer }) {
    const image = /\.(png|jpe?g|gif|webp)$/i.test(file.name),
      key = randomBytes(16),
      filekey = randomBytes(16).toString('hex'),
      encrypted = cipher(file.bytes, key);
    const upload = await post(
      this.fetcher,
      this.credentials.baseUrl,
      'ilink/bot/getuploadurl',
      {
        filekey,
        media_type: image ? 1 : 3,
        to_user_id: chatId,
        rawsize: file.bytes.length,
        rawfilemd5: createHash('md5').update(file.bytes).digest('hex'),
        filesize: encrypted.length,
        no_need_thumb: true,
        aeskey: key.toString('hex'),
        base_info: baseInfo(this.version),
      },
      this.credentials.token,
      AbortSignal.timeout(15_000),
    );
    const url =
      upload.upload_full_url ||
      (upload.upload_param
        ? `${CDN_BASE_URL}/upload?encrypted_query_param=${encodeURIComponent(upload.upload_param)}&filekey=${filekey}`
        : '');
    if (!url) throw new Error('微信没有返回上传地址');
    const response = await this.fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(encrypted),
      signal: AbortSignal.timeout(120_000),
    });
    const param = response.headers.get('x-encrypted-param');
    if (!response.ok || !param) throw new Error('微信文件上传失败');
    const media = {
      encrypt_query_param: param,
      aes_key: Buffer.from(key.toString('hex')).toString('base64'),
      encrypt_type: 1,
    };
    await this.send(
      chatId,
      image
        ? { type: ITEM.image, image_item: { media, mid_size: encrypted.length } }
        : { type: ITEM.file, file_item: { media, file_name: file.name, len: String(file.bytes.length) } },
    );
  }
  async typing(chatId: string, active: boolean) {
    const context = this.contexts.get(chatId);
    if (!context) return;
    let ticket = this.tickets.get(chatId);
    if (!ticket) {
      const config = await post(
        this.fetcher,
        this.credentials.baseUrl,
        'ilink/bot/getconfig',
        { ilink_user_id: chatId, context_token: context, base_info: baseInfo(this.version) },
        this.credentials.token,
        AbortSignal.timeout(10_000),
      );
      ticket = typeof config.typing_ticket === 'string' ? config.typing_ticket : '';
      if (!ticket) return;
      this.tickets.set(chatId, ticket);
    }
    await post(
      this.fetcher,
      this.credentials.baseUrl,
      'ilink/bot/sendtyping',
      { ilink_user_id: chatId, typing_ticket: ticket, status: active ? 1 : 2, base_info: baseInfo(this.version) },
      this.credentials.token,
      AbortSignal.timeout(10_000),
    );
  }
}

function cipher(data: Buffer, key: Buffer) {
  const value = createCipheriv('aes-128-ecb', key, null);
  return Buffer.concat([value.update(data), value.final()]);
}
function decipher(data: Buffer, key: Buffer) {
  const value = createDecipheriv('aes-128-ecb', key, null);
  return Buffer.concat([value.update(data), value.final()]);
}
