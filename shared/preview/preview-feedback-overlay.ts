/** A pin's bubble over a web page, drawn by a trusted view above the page so typing never reaches the page. */
export interface FeedbackOverlayState {
  /** The pin's ID. */
  id: string;
  editVersion: number;
  text: string;
  /** The pin's number. */
  number: string;
  /** What the pin points at: "按钮 · 免费试用 14 天". */
  title: string;
  /** For a Bot's pin: what it wrote. */
  botNote?: string;
  /** What the Bot's reply said about this pin, and whether it changed it. */
  reply?: string;
  replyBy?: string;
  status?: 'sent' | 'working' | 'done' | 'kept';
  /** Element pins can open the style panel. */
  tunable: boolean;
  language: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  dark: boolean;
}
export interface FeedbackOverlayLayout {
  state: FeedbackOverlayState;
  /** Where the bubble goes, in window CSS pixels. */
  rect: { x: number; y: number; width: number; height: number };
  visible: boolean;
}
export type FeedbackOverlayKind = 'change' | 'done' | 'escape' | 'delete' | 'tune' | 'size';
export const FEEDBACK_OVERLAY_KINDS: FeedbackOverlayKind[] = ['change', 'done', 'escape', 'delete', 'tune', 'size'];
export interface FeedbackOverlayInput {
  id: string;
  editVersion: number;
  kind: FeedbackOverlayKind;
  /** The text for `change` and `done`; the bubble's height for `size`. */
  text: string;
}
