import type { CSSProperties, ReactNode } from 'react';
import { Mark } from './Mark';
import './illustrations.css';

/**
 * Drawn stand-ins for the product, in place of screenshots: glass panels, text as bars and the
 * Bots as coloured marks, so they sit in the dark page and read the same in every language.
 * Everything inside scales with the illustration's width (cqw units), like an image would.
 */
type Tone = 'blue' | 'violet' | 'mint' | 'amber';

function Bot({ tone, className = '' }: { tone: Tone; className?: string }) {
  return <Mark className={`art-bot is-${tone} ${className}`} />;
}
function Bar({ w, strong, style }: { w: string; strong?: boolean; style?: CSSProperties }) {
  return <i className={`art-bar${strong ? ' is-strong' : ''}`} style={{ width: w, ...style }} />;
}
function Art({ kind, label, children }: { kind: string; label: string; children: ReactNode }) {
  return (
    <div className={`art art-${kind}`} role="img" aria-label={label}>
      {children}
    </div>
  );
}
function WindowDots() {
  return (
    <span className="art-dots">
      <i />
      <i />
      <i />
    </span>
  );
}

const SIDEBAR: Array<{ tone: Tone; w: [string, string] }> = [
  { tone: 'blue', w: ['62%', '84%'] },
  { tone: 'violet', w: ['74%', '58%'] },
  { tone: 'mint', w: ['48%', '76%'] },
  { tone: 'amber', w: ['66%', '50%'] },
  { tone: 'blue', w: ['54%', '70%'] },
  { tone: 'mint', w: ['70%', '44%'] },
  { tone: 'violet', w: ['42%', '66%'] },
];

/** The three-column workspace: Bots and groups, the conversation, the work computer and schedules. */
export function WorkspaceArt({ label }: { label: string }) {
  return (
    <Art kind="workspace" label={label}>
      <div className="art-frame">
        <div className="art-titlebar">
          <WindowDots />
        </div>
        <div className="ws-grid">
          <div className="ws-sidebar">
            <i className="ws-search" />
            {SIDEBAR.map((row, index) => (
              <div className={`ws-row${index === 1 ? ' is-active' : ''}`} key={index}>
                <Bot tone={row.tone} />
                <div>
                  <Bar w={row.w[0]} strong={index === 1} />
                  <Bar w={row.w[1]} />
                </div>
              </div>
            ))}
          </div>
          <div className="ws-chat">
            <div className="art-bubble is-user">
              <Bar w="88%" strong />
              <Bar w="56%" strong />
            </div>
            <div className="ws-steps">
              <i className="art-check" />
              <Bar w="22%" />
            </div>
            <div className="art-message">
              <Bot tone="violet" />
              <div className="art-bubble">
                <Bar w="92%" />
                <Bar w="78%" />
                <Bar w="84%" />
                <div className="art-file">
                  <i className="art-file-type">HTML</i>
                  <div>
                    <Bar w="64%" strong />
                    <Bar w="36%" />
                  </div>
                </div>
              </div>
            </div>
            <div className="art-bubble is-user">
              <Bar w="64%" strong />
            </div>
            <div className="art-message">
              <Bot tone="violet" />
              <div className="art-bubble art-typing">
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className="ws-composer">
              <Bar w="34%" />
              <i className="ws-send" />
            </div>
          </div>
          <div className="ws-side">
            <div className="ws-card">
              <div className="ws-screen">
                <div className="ws-screen-window">
                  <Bar w="70%" />
                  <Bar w="46%" />
                  <Bar w="58%" />
                  <i className="art-caret" />
                </div>
              </div>
              <div className="ws-card-row">
                <i className="art-live" />
                <Bar w="52%" strong />
              </div>
            </div>
            <div className="ws-card">
              <Bar w="46%" strong />
              {['64%', '48%'].map((w) => (
                <div className="ws-card-row" key={w}>
                  <i className="art-clock" />
                  <Bar w={w} />
                </div>
              ))}
            </div>
            <div className="ws-card">
              <Bar w="38%" strong />
              {['56%', '70%', '44%'].map((w) => (
                <div className="ws-card-row" key={w}>
                  <i className="ws-file" />
                  <Bar w={w} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Art>
  );
}

/** A group with four partners: you mention one, another shares a file, a third is writing. */
export function GroupChatArt({ label }: { label: string }) {
  return (
    <Art kind="group" label={label}>
      <div className="art-frame">
        <div className="group-head">
          <span className="group-avatars">
            <Bot tone="blue" />
            <Bot tone="violet" />
            <Bot tone="mint" />
            <Bot tone="amber" />
          </span>
          <div>
            <Bar w="46%" strong />
            <Bar w="28%" />
          </div>
        </div>
        <div className="group-body">
          <div className="art-bubble is-user">
            <span className="art-mention">
              <Bot tone="mint" />@
            </span>
            <Bar w="90%" strong />
            <Bar w="62%" strong />
          </div>
          <div className="art-message">
            <Bot tone="mint" />
            <div className="art-bubble">
              <Bar w="86%" />
              <Bar w="70%" />
              <div className="art-file">
                <i className="art-file-type is-mint">XLSX</i>
                <div>
                  <Bar w="58%" strong />
                  <Bar w="34%" />
                </div>
              </div>
            </div>
          </div>
          <div className="art-message">
            <Bot tone="blue" />
            <div className="art-bubble">
              <Bar w="94%" />
              <Bar w="52%" />
            </div>
          </div>
          <div className="art-message">
            <Bot tone="amber" />
            <div className="art-bubble art-typing">
              <i />
              <i />
              <i />
            </div>
          </div>
        </div>
      </div>
    </Art>
  );
}

const TERMINAL = [
  ['$', 'python3 analyze.py sales.csv'],
  ['', '12,480 rows · 6 regions'],
  ['✓', 'chart.png'],
  ['✓', 'report.xlsx'],
];

/** The Linux work computer: a browser and a terminal in use, a Bot's cursor, and the pause control. */
export function ComputerArt({ label }: { label: string }) {
  return (
    <Art kind="computer" label={label}>
      <div className="art-frame">
        <div className="vm-panel">
          <span>
            <i className="art-live" />
            <Bar w="9cqw" />
          </span>
          <span>09:41</span>
        </div>
        <div className="vm-window vm-browser">
          <div className="art-titlebar">
            <WindowDots />
            <span className="vm-address">
              <Bar w="46%" />
            </span>
          </div>
          <div className="vm-page">
            <div>
              <Bar w="80%" strong />
              <Bar w="94%" />
              <Bar w="70%" />
              <Bar w="86%" />
            </div>
            <svg viewBox="0 0 100 64" preserveAspectRatio="none" aria-hidden="true">
              {[30, 44, 38, 56, 50, 62].map((height, index) => (
                <rect key={index} x={4 + index * 16} y={64 - height} width="10" height={height} rx="1.5" />
              ))}
              <polyline points="9,40 25,28 41,33 57,16 73,21 89,8" />
            </svg>
          </div>
        </div>
        <div className="vm-window vm-terminal">
          <div className="art-titlebar">
            <WindowDots />
          </div>
          <div className="vm-shell">
            {TERMINAL.map(([sign, text]) => (
              <p key={text}>
                <b>{sign}</b>
                {text}
              </p>
            ))}
            <p>
              <b>$</b>
              <i className="art-caret" />
            </p>
          </div>
        </div>
        <span className="vm-cursor">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 3l14 8-6 1.6L10 19z" />
          </svg>
          <Bot tone="violet" />
        </span>
        <div className="vm-control">
          <Bot tone="violet" />
          <i className="art-live" />
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 6v12M16 6v12" />
          </svg>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5" />
          </svg>
        </div>
      </div>
    </Art>
  );
}

const SYSTEMS = [
  { name: 'paper', swatches: ['#1d1b18', '#b5532c', '#d9cbb3', '#f1ece2'] },
  { name: 'night', swatches: ['#e8eaf0', '#5fd3b0', '#3a4256', '#11141c'] },
  { name: 'bold', swatches: ['#ffffff', '#f2a46b', '#8b6bea', '#2a1f4d'] },
];

/** Design systems as specimen cards, and the canvas where a Bot's page is selected and annotated. */
export function DesignArt({ label }: { label: string }) {
  return (
    <Art kind="design" label={label}>
      {SYSTEMS.map((system) => (
        <div className={`spec spec-${system.name}`} key={system.name}>
          <span className="spec-swatches">
            {system.swatches.map((color) => (
              <i key={color} style={{ background: color }} />
            ))}
          </span>
          <b>Aa</b>
          <Bar w="78%" />
          <Bar w="56%" />
          <i className="spec-button" />
        </div>
      ))}
      <div className="art-frame canvas">
        <div className="art-titlebar">
          <WindowDots />
          <span className="canvas-tabs">
            <i className="is-on" />
            <i />
          </span>
        </div>
        <div className="canvas-page">
          <div className="canvas-hero">
            <Bar w="62%" strong />
            <Bar w="40%" strong />
            <Bar w="74%" />
            <span className="canvas-select">
              <i className="spec-button" />
              <em />
              <em />
              <em />
              <em />
            </span>
          </div>
          <div className="canvas-image" />
          <div className="canvas-features">
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>
      <div className="canvas-note">
        <Bot tone="violet" />
        <Bar w="70%" />
      </div>
    </Art>
  );
}
