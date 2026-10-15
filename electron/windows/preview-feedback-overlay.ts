import { WebContentsView, ipcMain, type BrowserWindow, type IpcMainEvent } from 'electron';
import {
  FEEDBACK_OVERLAY_KINDS,
  type FeedbackOverlayLayout,
  type FeedbackOverlayInput,
} from '../../shared/preview/preview-feedback-overlay';

/**
 * A pin's bubble over a web page: a trusted transparent view above the untrusted page, with a text-only bridge, so
 * what the person types never passes through the page. It sizes itself to its content.
 */
export class PreviewFeedbackOverlay {
  private view?: WebContentsView;
  private ready = false;
  private layout?: FeedbackOverlayLayout;
  /** The bubble's own height, reported by its page, used instead of the requested height. */
  private height?: number;
  constructor(
    private window: BrowserWindow,
    private preload: string,
  ) {
    ipcMain.on('preview-feedback-overlay:input', this.input);
    window.once('closed', () => {
      this.close();
      ipcMain.removeListener('preview-feedback-overlay:input', this.input);
    });
  }
  private input = (event: IpcMainEvent, value: FeedbackOverlayInput) => {
    const wc = this.view?.webContents,
      state = this.layout?.state;
    if (
      !wc ||
      event.sender !== wc ||
      event.senderFrame !== wc.mainFrame ||
      !state ||
      !this.layout?.visible ||
      value?.id !== state.id ||
      !Number.isSafeInteger(value.editVersion) ||
      value.editVersion < state.editVersion ||
      !FEEDBACK_OVERLAY_KINDS.includes(value.kind) ||
      typeof value.text !== 'string' ||
      value.text.length > 12000
    )
      return;
    if (value.kind === 'size') {
      const height = Number(value.text);
      if (Number.isFinite(height) && height > 0 && height < 2000 && Math.abs((this.height || 0) - height) > 0.5) {
        this.height = height;
        this.place();
      }
      return;
    }
    if (value.kind === 'escape' || value.kind === 'done') this.window.webContents.focus();
    this.window.webContents.send('preview-feedback:input', value);
  };
  update(layout: FeedbackOverlayLayout | null) {
    if (!layout || !layout.visible) {
      this.layout = layout || undefined;
      this.view?.setVisible(false);
      return false;
    }
    const { rect, state } = layout;
    if (
      ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
      rect.width < 1 ||
      rect.height < 1 ||
      typeof state?.id !== 'string' ||
      typeof state.text !== 'string' ||
      state.text.length > 12000
    )
      throw Error('无效评论气泡');
    const opened = this.layout?.state.id !== state.id || !this.layout?.visible;
    if (this.layout?.state.id !== state.id) this.height = undefined;
    this.layout = layout;
    if (!this.view) {
      const view = new WebContentsView({
        webPreferences: {
          preload: this.preload,
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          webSecurity: true,
        },
      });
      this.view = view;
      this.ready = false;
      view.setBackgroundColor('#00000000');
      view.setVisible(false);
      this.window.contentView.addChildView(view);
      view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      view.webContents.on('will-navigate', (event) => event.preventDefault());
      view.webContents.on('before-input-event', (event, key) => {
        if ((key.control || key.meta) && key.key.toLowerCase() === 's') event.preventDefault();
      });
      view.webContents.once('did-finish-load', () => {
        if (this.view !== view) return;
        this.ready = true;
        if (this.layout) this.update(this.layout);
      });
      void view.webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(OVERLAY_HTML)).catch(() => {
        if (this.view === view) this.close();
      });
    }
    this.place();
    if (this.ready) {
      this.view.webContents.send('preview-feedback-overlay:state', state);
      // A newly opened bubble takes the keyboard, so the person can type straight away.
      if (opened) this.view.webContents.focus();
    }
    return true;
  }
  /** Keeps the bubble above the page, within the window, with room for its shadow. */
  private place() {
    const view = this.view,
      layout = this.layout;
    if (!view || !layout) return;
    const zoom = this.window.webContents.getZoomFactor(),
      [w, h] = this.window.getContentSize(),
      pad = 16,
      rect = { ...layout.rect, height: this.height ?? layout.rect.height };
    const x = Math.max(0, Math.round((rect.x - pad) * zoom)),
      y = Math.max(0, Math.round((rect.y - pad) * zoom));
    view.setBounds({
      x,
      y,
      width: Math.max(1, Math.min(w - x, Math.round((rect.width + pad * 2) * zoom))),
      height: Math.max(1, Math.min(h - y, Math.round((rect.height + pad * 2) * zoom))),
    });
    if (view.webContents.getZoomFactor() !== zoom) view.webContents.setZoomFactor(zoom);
    view.setVisible(this.ready && layout.visible);
  }
  close() {
    const view = this.view;
    this.view = undefined;
    this.layout = undefined;
    this.height = undefined;
    this.ready = false;
    if (!view) return;
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(view);
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }
}
const OVERLAY_HTML = `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-feedback'; style-src 'unsafe-inline'"><title>Comment</title><style>
*{box-sizing:border-box}
html,body{margin:0;background:transparent!important;overflow:hidden}
body{padding:16px;font:13px/1.6 system-ui,'Segoe UI','Microsoft YaHei',sans-serif;color-scheme:light;
  --ink:#29282c;--ink2:#4a4850;--muted:#86838d;--faint:#aeabb5;--line:#e8e7ec;--surface:#fff;--fill:#f3f2f5;--violet:#8b6bea;--green:#3f9a6e;--amber:#b9822f;--grey:#9c99a3}
body.dark{color-scheme:dark;--ink:#e3e0e6;--ink2:#c9c5cf;--muted:#9d99a5;--faint:#75717d;--line:#3a3641;--surface:#29262f;--fill:#36323d}
.card{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:12px;box-shadow:0 1px 2px #0000000a,0 16px 36px -14px #1f1a4552}
header{display:flex;align-items:center;gap:8px;padding:10px 12px 0;font-size:12px;color:var(--muted);min-width:0}
.dot{flex:none;width:18px;height:18px;border-radius:50%;background:var(--ink);color:#fff;display:grid;place-items:center;font-size:10px;font-weight:600}
body.dark .dot{color:#202024;background:var(--ink)}
.dot.bot{background:var(--violet);color:#fff}.dot.done{background:var(--green);color:#fff}.dot.kept{background:var(--amber);color:#fff}.dot.sent,.dot.working{background:var(--grey);color:#fff}
.title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.state{flex:none;font-size:11px;font-weight:600}.state.done{color:var(--green)}.state.kept{color:var(--amber)}.state.sent,.state.working{color:var(--muted)}
.note{margin:8px 12px 0;padding:8px 10px;border-radius:9px;background:var(--fill);color:var(--ink2);font-size:13px}
textarea{display:block;width:100%;min-height:44px;max-height:132px;margin:0;padding:6px 12px 10px;border:0;resize:none;outline:0;background:transparent;color:var(--ink);font:inherit;font-size:13.5px;line-height:1.6;scrollbar-width:thin}
textarea::placeholder{color:var(--faint)}
.reply{display:flex;gap:8px;margin:0 12px 10px;padding-top:10px;border-top:1px solid var(--line);color:var(--ink2);font-size:13px;line-height:1.55}
.reply b{display:block;color:var(--ink);font-size:12px;font-weight:600}
.reply i{flex:none;width:18px;height:18px;border-radius:50%;background:var(--violet);margin-top:2px}
footer{display:flex;align-items:center;gap:2px;padding:6px 8px 8px;border-top:1px solid var(--line)}
footer button.icon{width:26px;height:26px;display:grid;place-items:center;border:0;border-radius:7px;background:transparent;color:var(--muted);padding:0;cursor:pointer}
footer button.icon:hover{background:var(--fill);color:var(--ink)}
footer button.icon[hidden]{display:none}
.hint{margin-left:auto;margin-right:8px;font-size:11.5px;color:var(--faint)}
.done-btn{height:26px;padding:0 12px;border:0;border-radius:7px;background:var(--ink);color:var(--surface);font:inherit;font-size:12px;font-weight:600;cursor:pointer}
button:focus-visible{outline:2px solid var(--violet);outline-offset:1px}
</style></head><body><div class="card"><header><span class="dot" id="dot"></span><span class="title" id="title"></span><span class="state" id="state"></span></header><div class="note" id="note" hidden></div><textarea rows="2" maxlength="1000"></textarea><div class="reply" id="reply" hidden><i></i><div><b id="replyBy"></b><span id="replyText"></span></div></div><footer><button type="button" class="icon" id="delete"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button><button type="button" class="icon" id="tune"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg></button><span class="hint" id="hint"></span><button type="button" class="done-btn" id="done"></button></footer></div><script nonce="feedback">
const $=id=>document.getElementById(id),input=document.querySelector('textarea');let composing=false,localVersion=0,currentId='';
function size(){input.style.height='0px';input.style.height=Math.min(132,Math.max(44,input.scrollHeight))+'px';window.feedbackOverlay.act('size',String(document.querySelector('.card').getBoundingClientRect().height));}
input.addEventListener('input',()=>{size();localVersion=window.feedbackOverlay.act('change',input.value);});
input.addEventListener('compositionstart',()=>composing=true);input.addEventListener('compositionend',()=>composing=false);
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!composing&&e.keyCode!==229){e.preventDefault();window.feedbackOverlay.act('done',input.value);}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();window.feedbackOverlay.act('escape',input.value);}});
$('done').addEventListener('click',()=>window.feedbackOverlay.act('done',input.value));
$('delete').addEventListener('click',()=>window.feedbackOverlay.act('delete',''));
$('tune').addEventListener('click',()=>window.feedbackOverlay.act('tune',''));
window.feedbackOverlay.onState(s=>{const fresh=currentId!==s.id;if(fresh){currentId=s.id;localVersion=0;}if(s.editVersion<localVersion)return;
const en=s.language==='en',tw=s.language==='zh-TW',L=(cn,t,e)=>en?e:tw?t:cn;
document.body.classList.toggle('dark',Boolean(s.dark));document.body.style.fontFamily=s.fontFamily;
const dot=$('dot');dot.textContent=s.number;dot.className='dot'+(s.botNote!==undefined?' bot':s.status?' '+s.status:'');
$('title').textContent=s.title;
const st=$('state');st.className='state '+(s.status||'');st.textContent=s.status==='done'?L('已改','已改','Changed'):s.status==='kept'?L('没改','沒改','Unchanged'):s.status==='working'?L('正在改','正在改','In progress'):s.status==='sent'?L('已发送','已傳送','Sent'):'';
const note=$('note');note.hidden=!s.botNote;note.textContent=s.botNote||'';
if(input.value!==s.text)input.value=s.text;
input.placeholder=s.botNote?L('回复这条说明…','回覆這則說明…','Reply…'):s.status?L('继续说…','繼續說…','Add more…'):L('这里要怎么改？','這裡要怎麼改？','What should change here?');
input.setAttribute('aria-label',L('评论','評論','Comment'));
const reply=$('reply');reply.hidden=!s.reply;$('replyBy').textContent=s.replyBy||'Bot';$('replyText').textContent=s.reply||'';
$('tune').hidden=!s.tunable;$('delete').setAttribute('aria-label',L('删除评论','刪除評論','Delete comment'));$('delete').title=$('delete').getAttribute('aria-label');
$('tune').setAttribute('aria-label',L('调整样式','調整樣式','Adjust style'));$('tune').title=$('tune').getAttribute('aria-label');
$('hint').textContent=L('Enter 完成','Enter 完成','Enter to finish');$('done').textContent=L('好了','好了','Done');
size();if(fresh)input.focus();});
</script></body></html>`;
