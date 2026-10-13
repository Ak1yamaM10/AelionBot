import test from 'node:test';
import assert from 'node:assert/strict';
import { tempDir } from './helpers';
import { HostDesktop, blockedApp, hostKeys } from '../electron/core/host/desktop/host-desktop';
import type {
  DesktopCapture,
  DesktopDriver,
  DesktopWindow,
  InputStep,
} from '../electron/core/host/desktop/desktop-helper';
import type { HostComputerSettings } from '../shared/types/permission-types';
import { AppError } from '../shared/errors';

const OWN = 'C:\\Program Files\\AelionBot\\AelionBot.exe';
const windowOf = (id: number, exe: string, extra: Partial<DesktopWindow> = {}): DesktopWindow => ({
  id,
  title: 'Window ' + id,
  className: 'Test',
  pid: id,
  exe,
  name: exe.split('\\').at(-1)!.replace('.exe', ''),
  minimized: false,
  foreground: false,
  elevated: false,
  x: 100,
  y: 50,
  width: 800,
  height: 600,
  ...extra,
});
function setup(t: Parameters<typeof tempDir>[0], options: { platform?: string } = {}) {
  const windows = new Map<number, DesktopWindow>([
    [1, windowOf(1, 'C:\\Apps\\Notes\\Notes.exe')],
    [2, windowOf(2, 'C:\\Program Files\\WindowsApps\\Terminal\\WindowsTerminal.exe')],
    [3, windowOf(3, 'C:\\Apps\\Admin\\Admin.exe', { elevated: true })],
    [4, windowOf(4, OWN)],
  ]);
  const log: Array<{ op: string; window?: number; steps?: InputStep[]; value?: string }> = [],
    asked: string[] = [],
    escapes: number[] = [],
    cue = { begun: 0, ended: 0 };
  let settings: HostComputerSettings = { enabled: true },
    answer: 'allow' | 'deny' | Promise<void> = 'allow',
    failInput = -1,
    front: DesktopWindow | null = null;
  const running = new Set<string>(['run-1', 'run-2', 'run-3']);
  const driver: DesktopDriver = {
    status: async () => ({ elevated: false }),
    listWindows: async () => [...windows.values()],
    listApps: async () => [
      { name: 'Notes', id: 'notes.app' },
      { name: 'Notes Beta', id: 'notes.beta' },
      { name: 'Paint', id: 'paint.app' },
    ],
    launch: async (id) => {
      log.push({ op: 'launch:' + id });
      front = windows.get(1)!;
    },
    window: async (id) => {
      const window = windows.get(id);
      if (!window) throw new AppError('computer.host_window_gone', 'gone');
      return window;
    },
    foreground: async () => front,
    capture: async (id, _file, text): Promise<DesktopCapture> => {
      log.push({ op: 'capture', window: id });
      // An 800-pixel-wide window shown at half size: image pixels are half of screen pixels.
      return {
        ...windows.get(id)!,
        originX: 100,
        originY: 50,
        scale: 0.5,
        imageWidth: 400,
        imageHeight: 300,
        ...(text ? { text: '0 Button "OK" [10,20 40x20]\n', elements: [[10, 20, 40, 20]] } : {}),
      };
    },
    input: async (id, steps) => {
      if (log.filter((item) => item.op === 'input').length === failInput)
        throw new AppError('computer.host_obscured', 'covered');
      log.push({ op: 'input', window: id, steps });
    },
    setValue: async (id, element, value) => void log.push({ op: 'set_value:' + element, window: id, value }),
    dispose: () => {},
  };
  const desktop = new HostDesktop({
    driver,
    imageDir: tempDir(t, 'aelion-host-desktop-'),
    settings: { read: () => settings, write: (next) => void (settings = next) },
    requestAccess: async (_botId, runId) => {
      asked.push(runId);
      if (answer === 'deny') throw new AppError('permission.denied', 'denied');
      if (answer !== 'allow') await answer;
    },
    running: (runId) => running.has(runId),
    changed: () => {},
    presence: {
      begin: () => void cue.begun++,
      end: () => void cue.ended++,
      passEscape: async (work) => {
        escapes.push(log.length);
        return work();
      },
    },
    platform: options.platform ?? 'win32',
    ownExe: OWN,
    sleep: async () => {},
  });
  return {
    desktop,
    log,
    asked,
    escapes,
    cue,
    running,
    signal: new AbortController().signal,
    settings: () => settings,
    set: (value: Partial<{ answer: typeof answer; failInput: number; settings: HostComputerSettings }>) => {
      if (value.answer) answer = value.answer;
      if (value.failInput !== undefined) failInput = value.failInput;
      if (value.settings) settings = value.settings;
    },
  };
}
const inputs = (log: ReturnType<typeof setup>['log']) =>
  log.filter((item) => item.op === 'input').map((item) => item.steps!);

test('terminals and the app itself are never operable, and system-wide shortcuts are refused', () => {
  assert.ok(blockedApp('C:\\Windows\\System32\\cmd.exe', OWN));
  assert.ok(blockedApp('C:\\Program Files\\PowerShell\\7\\PWSH.EXE', OWN));
  assert.ok(blockedApp('C:\\X\\WindowsTerminal.exe', OWN));
  assert.ok(blockedApp(OWN.toUpperCase(), OWN));
  assert.equal(blockedApp('C:\\Windows\\notepad.exe', OWN), undefined);
  assert.deepEqual(hostKeys('ctrl+shift+s'), [0x11, 0x10, 0x53]);
  assert.deepEqual(hostKeys('F5'), [0x74]);
  assert.deepEqual(hostKeys('ALT+F4'), [0x12, 0x73]);
  for (const chord of ['WIN+R', 'ALT+TAB', 'CTRL+ESC', 'CTRL+ALT+DELETE'])
    assert.throws(() => hostKeys(chord), { code: 'computer.key_blocked' });
  assert.throws(() => hostKeys('CTRL+CTRL'));
  assert.throws(() => hostKeys('CTRL+$(x)'));
});
test('a task asks once before its first action, whatever it does afterwards', async (t) => {
  const { desktop, log, asked, cue, signal } = setup(t);
  const run = (input: Parameters<HostDesktop['execute']>[2]) => desktop.execute('bot', 'run-1', input, signal);
  // Listing windows already shows the Bot what is open, so it counts as entering.
  await run({ action: 'list_windows' });
  assert.deepEqual(asked, ['run-1']);
  await run({ action: 'list_apps' });
  const seen = await run({ action: 'get_window_state', window: 1 });
  await run({ action: 'click', window: 1, observationId: seen.screenshot!.id, x: 10, y: 10 });
  await run({ action: 'launch_app', app: 'paint' });
  assert.deepEqual(asked, ['run-1']);
  assert.ok(log.some((item) => item.op === 'launch:paint.app'));
  // The next task asks again.
  desktop.release('run-1');
  assert.equal(cue.ended, 1);
  await desktop.execute('bot', 'run-2', { action: 'list_apps' }, signal);
  assert.deepEqual(asked, ['run-1', 'run-2']);
});
test('the computer is held while the user decides, and the cue appears only once they allow it', async (t) => {
  const { desktop, log, cue, signal, set } = setup(t);
  let allow!: () => void;
  set({ answer: new Promise<void>((resolve) => (allow = resolve)) });
  const waiting = desktop.execute('bot', 'run-1', { action: 'get_window_state', window: 1 }, signal);
  await Promise.resolve();
  assert.deepEqual(desktop.current, { botId: 'bot', runId: 'run-1' });
  assert.equal(cue.begun, 0);
  assert.equal(log.length, 0);
  await assert.rejects(() => desktop.execute('other', 'run-2', { action: 'list_apps' }, signal), {
    code: 'computer.in_use_elsewhere',
  });
  allow();
  await waiting;
  assert.equal(cue.begun, 1);
  assert.deepEqual(
    log.map((item) => item.op),
    ['capture'],
  );
});
test('a refusal holds for the whole task and frees the computer for others', async (t) => {
  const { desktop, log, asked, cue, signal, set } = setup(t);
  const observe = (runId: string) => desktop.execute('bot', runId, { action: 'get_window_state', window: 1 }, signal);
  set({ answer: 'deny' });
  await assert.rejects(() => observe('run-1'), { code: 'permission.denied' });
  await assert.rejects(() => observe('run-1'), { code: 'permission.denied' });
  await assert.rejects(() => desktop.execute('bot', 'run-1', { action: 'list_windows' }, signal), {
    code: 'permission.denied',
  });
  assert.deepEqual(asked, ['run-1']);
  assert.equal(log.length, 0);
  assert.equal(cue.begun, 0);
  assert.equal(desktop.current, undefined);
  set({ answer: 'allow' });
  await observe('run-2');
  assert.deepEqual(asked, ['run-1', 'run-2']);
  // Once the refused task has ended, a later one with the same id would be asked afresh.
  desktop.release('run-1');
  desktop.release('run-2');
  await observe('run-1');
  assert.deepEqual(asked, ['run-1', 'run-2', 'run-1']);
});
test('actions are bound to the latest observation of their window', async (t) => {
  const { desktop, log, signal } = setup(t);
  const click = (observationId: string | undefined, x: number, y: number) =>
    desktop.execute('bot', 'run-1', { action: 'click', window: 1, observationId, x, y, button: 'right' }, signal);
  await assert.rejects(() => click(undefined, 1, 1), { code: 'computer.observation_stale' });
  const seen = await desktop.execute('bot', 'run-1', { action: 'get_window_state', window: 1 }, signal);
  assert.deepEqual(seen.screenshot && [seen.screenshot.width, seen.screenshot.height], [400, 300]);
  await assert.rejects(() => click('old', 1, 1), { code: 'computer.observation_stale' });
  await assert.rejects(() => click(seen.screenshot!.id, 400, 1));
  assert.equal(inputs(log).length, 0);
  const clicked = await click(seen.screenshot!.id, 200, 100);
  // Image (200, 100) at half scale from origin (100, 50) is screen (500, 250).
  assert.deepEqual(inputs(log)[0].slice(0, 3), [
    { t: 'move', x: 500, y: 250 },
    { t: 'down', button: 2 },
    { t: 'sleep', ms: 40 },
  ]);
  assert.notEqual(clicked.screenshot!.id, seen.screenshot!.id);
  await assert.rejects(() => click(seen.screenshot!.id, 1, 1), { code: 'computer.observation_stale' });
});
test('terminal, own and elevated windows stay out of reach after the task was allowed', async (t) => {
  const { desktop, log, asked, signal } = setup(t);
  const observe = (window: number) => desktop.execute('bot', 'run-1', { action: 'get_window_state', window }, signal);
  await assert.rejects(() => observe(2), { code: 'computer.app_blocked' });
  await assert.rejects(() => observe(4), { code: 'computer.app_blocked' });
  await assert.rejects(() => observe(3), { code: 'computer.app_elevated' });
  assert.equal(log.length, 0);
  assert.deepEqual(asked, ['run-1']);
  const listed = await desktop.execute('bot', 'run-1', { action: 'list_windows' }, signal);
  assert.deepEqual(
    listed.windows!.map((window) => [window.window, Boolean(window.unavailable)]),
    [
      [1, false],
      [2, true],
      [3, false],
    ],
  );
});
test('one task holds the computer at a time, and nothing runs while the feature is off', async (t) => {
  const { desktop, asked, signal, running, set } = setup(t);
  const observe = (botId: string, runId: string) =>
    desktop.execute(botId, runId, { action: 'get_window_state', window: 1 }, signal);
  await observe('bot', 'run-1');
  assert.deepEqual(desktop.current, { botId: 'bot', runId: 'run-1' });
  await assert.rejects(() => observe('other', 'run-2'), { code: 'computer.in_use_elsewhere' });
  assert.deepEqual(asked, ['run-1']);
  // A holder that is no longer running gives the computer up.
  running.delete('run-1');
  await observe('other', 'run-2');
  assert.equal(desktop.current?.runId, 'run-2');
  desktop.release('run-2');
  assert.equal(desktop.current, undefined);
  set({ settings: { enabled: false } });
  assert.equal(desktop.enabled, false);
  await assert.rejects(() => desktop.execute('bot', 'run-3', { action: 'list_windows' }, signal), {
    code: 'computer.host_disabled',
  });
  assert.deepEqual(asked, ['run-1', 'run-2']);
  assert.equal(setup(t, { platform: 'linux' }).desktop.enabled, false);
});
test('a batch plans every step first, runs them in order with one screenshot, and names the step that failed', async (t) => {
  const { desktop, log, escapes, signal, set } = setup(t);
  const seen = await desktop.execute(
    'bot',
    'run-1',
    { action: 'get_window_state', window: 1, includeText: true },
    signal,
  );
  assert.match(seen.text!, /Button "OK"/);
  const batch = (actions: NonNullable<Parameters<HostDesktop['execute']>[2]['actions']>, observationId: string) =>
    desktop.execute('bot', 'run-1', { action: 'batch', window: 1, observationId, actions }, signal);
  log.length = 0;
  const done = await batch(
    [
      { action: 'click', element: 0 },
      { action: 'type_text', text: '你好' },
      { action: 'set_value', element: 0, value: 'v' },
      { action: 'press_key', key: 'ESC' },
    ],
    seen.screenshot!.id,
  );
  assert.deepEqual(
    log.map((item) => item.op),
    ['input', 'input', 'set_value:0', 'input', 'capture'],
  );
  // Element 0 is centred at image (30, 30): screen (160, 110).
  assert.deepEqual(inputs(log)[0][0], { t: 'move', x: 160, y: 110 });
  assert.deepEqual(inputs(log)[1], [{ t: 'text', text: '你好' }]);
  assert.deepEqual(inputs(log)[2], [{ t: 'key', keys: [0x1b] }]);
  // Only the step that presses Escape is let past the cancel key.
  assert.deepEqual(escapes, [3]);
  log.length = 0;
  await assert.rejects(() =>
    batch(
      [
        { action: 'click', x: 1, y: 1 },
        { action: 'press_key', key: 'WIN+R' },
      ],
      done.screenshot!.id,
    ),
  );
  await assert.rejects(() => batch([{ action: 'get_window_state' }], done.screenshot!.id));
  assert.equal(log.length, 0);
  set({ failInput: 1 });
  await assert.rejects(
    () =>
      batch(
        [
          { action: 'click', x: 1, y: 1 },
          { action: 'click', x: 2, y: 2 },
          { action: 'type_text', text: 'never' },
        ],
        done.screenshot!.id,
      ),
    (error: AppError) => error.code === 'computer.host_obscured' && error.message.includes('第 2 步'),
  );
  assert.equal(inputs(log).length, 1);
});
test('launching works with the window that came to the front', async (t) => {
  const { desktop, log, asked, signal } = setup(t);
  const launch = (app: string) => desktop.execute('bot', 'run-1', { action: 'launch_app', app }, signal);
  await assert.rejects(() => launch('nope'), { code: 'computer.app_not_found' });
  await assert.rejects(() => launch('not'), { code: 'computer.app_ambiguous' });
  const opened = await launch('notes');
  assert.deepEqual(
    log.map((item) => item.op),
    ['launch:notes.app', 'capture'],
  );
  assert.equal(opened.window?.window, 1);
  assert.deepEqual(asked, ['run-1']);
});
