import test from 'node:test';
import assert from 'node:assert/strict';
import { until, tempDir } from './helpers';
import { ComputerController, absolutePoint, keyCodes } from '../electron/core/vm/computer';
import { imageContext } from '../electron/core/model/model';
import { artifactPath } from '../electron/core/attachments/artifacts';
import type { VmController } from '../electron/core/vm/vm';
import type { WireMessage } from '../shared/types/core';
import { EventEmitter } from 'node:events';

test('desktop coordinates and key chords stay inside the guest input protocol', () => {
  assert.deepEqual(
    absolutePoint(1279, 799, 1280, 800).map((event) => event.data.value),
    [32767, 32767],
  );
  assert.deepEqual(
    absolutePoint(0, 0, 1280, 800).map((event) => event.data.value),
    [0, 0],
  );
  assert.throws(() => absolutePoint(1280, 799, 1280, 800));
  assert.throws(() => absolutePoint(NaN, 0, 1280, 800));
  assert.deepEqual(keyCodes('CTRL+SHIFT+V'), ['ctrl', 'shift', 'v']);
  assert.deepEqual(keyCodes('ENTER'), ['ret']);
  assert.throws(() => keyCodes('ctrl+$(malicious)'));
  assert.throws(() => keyCodes('CTRL+CTRL+A'));
});
test('independent desktops retain their own observations, input routing and manual takeover', async (t) => {
  const dir = tempDir(t, 'aelion-computer-test-');
  const events: Array<{ botId: string; command: string }> = [];
  const vm = {
    state: { status: 'ready', desktopReady: true, appsReady: true },
    ensureBotDesktop: async (botId: string) => ({ vncUrl: 'ws://local/' + botId }),
    executeDesktop: async (command: string, botId: string) => {
      events.push({ botId, command });
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    desktopScreenshot: async (botId: string) => {
      events.push({ botId, command: 'screenshot' });
      const png = Buffer.alloc(32);
      Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
      png.writeUInt32BE(1280, 16);
      png.writeUInt32BE(800, 20);
      return png;
    },
  } as unknown as VmController;
  const computer = new ComputerController(vm, dir, () => {}),
    signal = new AbortController().signal;
  await assert.rejects(() => computer.execute('a', { action: 'click', x: 1, y: 2 }, signal), {
    code: 'computer.observation_stale',
  });
  const [first, second] = await Promise.all(
    ['a', 'b'].map((botId) => computer.execute(botId, { action: 'screenshot' }, signal)),
  );
  assert.notEqual(computer.stateFor('a').vncUrl, computer.stateFor('b').vncUrl);
  await assert.rejects(
    () => computer.execute('b', { action: 'click', observationId: first.screenshot.id, x: 1, y: 2 }, signal),
    { code: 'computer.observation_stale' },
  );
  await assert.rejects(() => computer.execute('a', { action: 'click', observationId: 'old', x: 1, y: 2 }, signal), {
    code: 'computer.observation_stale',
  });
  await Promise.all([
    computer.execute('a', { action: 'click', observationId: first.screenshot.id, x: 10, y: 20 }, signal),
    computer.execute('b', { action: 'click', observationId: second.screenshot.id, x: 500, y: 600 }, signal),
  ]);
  assert.ok(events.some((item) => item.botId === 'a' && item.command === 'xdotool mousemove 10 20'));
  assert.ok(events.some((item) => item.botId === 'b' && item.command === 'xdotool mousemove 500 600'));
  await assert.rejects(
    () => computer.execute('a', { action: 'key', key: 'ENTER', observationId: first.screenshot.id }, signal),
    { code: 'computer.observation_stale' },
  );
  computer.release('a');
  computer.setManual('a', true);
  await assert.rejects(() => computer.execute('a', { action: 'screenshot' }, signal), {
    code: 'computer.user_in_control',
  });
  await computer.execute('b', { action: 'screenshot' }, signal);
  assert.equal(computer.stateFor('b').ownerBotId, 'b');
  computer.setManual('a', false);
  await assert.rejects(
    () => computer.execute('a', { action: 'key', key: 'ENTER', observationId: first.screenshot.id }, signal),
    { code: 'computer.observation_stale' },
  );
});
test('protocol conversion preserves earlier observations when another image is appended', () => {
  const messages: WireMessage[] = ['one', 'two', 'three'].map((id) => ({
    role: 'user',
    content: 'observation',
    images: [{ id, width: 1280, height: 800 }],
  }));
  const before = JSON.stringify(messages);
  const loaded: string[] = [];
  const request = imageContext(messages, (id) => {
    loaded.push(id);
    return `data:image/png;base64,${id}`;
  });
  assert.deepEqual(loaded, ['one', 'two', 'three']);
  assert.match(JSON.stringify(request[0]), /image_url/);
  assert.match(JSON.stringify(request[2]), /image_url/);
  assert.equal(JSON.stringify(messages), before);
});

test('only the same desktop is locked by an in-flight action and a VM restart invalidates observations', async (t) => {
  const dir = tempDir(t, 'aelion-desktop-lock-');
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let capturing = false;
  const vm = Object.assign(new EventEmitter(), {
    state: { status: 'ready', pid: 10, desktopReady: true, appsReady: true },
    ensureBotDesktop: async (botId: string) => ({ vncUrl: 'ws://local/' + botId }),
    desktopScreenshot: async (botId: string) => {
      if (botId === 'first') {
        capturing = true;
        await blocked;
      }
      const png = Buffer.alloc(32);
      Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
      png.writeUInt32BE(1280, 16);
      png.writeUInt32BE(800, 20);
      return png;
    },
  }) as unknown as VmController;
  const computer = new ComputerController(vm, dir, () => {}),
    signal = new AbortController().signal;
  const first = computer.execute('first', { action: 'screenshot' }, signal);
  await until(() => capturing);
  await assert.rejects(() => computer.execute('first', { action: 'screenshot' }, signal), { code: 'computer.busy' });
  assert.throws(() => computer.setManual('first', true), { code: 'computer.busy' });
  const second = await computer.execute('second', { action: 'screenshot' }, signal);
  release();
  await first;
  vm.emit('state', { status: 'stopped' });
  assert.equal(Object.keys(computer.state.desktops).length, 0);
  await assert.rejects(
    () => computer.execute('second', { action: 'key', key: 'ENTER', observationId: second.screenshot.id }, signal),
    { code: 'computer.observation_stale' },
  );
});
test('open_app can launch Impress as well as Writer and Calc', async (t) => {
  const dir = tempDir(t, 'aelion-computer-office-');
  const events: string[] = [];
  const vm = {
    state: { status: 'ready', desktopReady: true, appsReady: true },
    ensureBotDesktop: async () => ({ vncUrl: 'ws://local/bot' }),
    executeDesktop: async (command: string) => {
      events.push(command);
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    desktopScreenshot: async () => {
      const png = Buffer.alloc(32);
      Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
      png.writeUInt32BE(1280, 16);
      png.writeUInt32BE(800, 20);
      return png;
    },
  } as unknown as VmController;
  const computer = new ComputerController(vm, dir, () => {}),
    signal = new AbortController().signal;
  await computer.execute('bot', { action: 'open_app', app: 'impress' }, signal);
  await computer.execute('bot', { action: 'open_app', app: 'writer' }, signal);
  await computer.execute('bot', { action: 'open_app', app: 'calc' }, signal);
  await computer.execute('bot', { action: 'open_app', app: 'impress', path: 'human_ai_beautiful.pptx' }, signal);
  await assert.rejects(
    () => computer.execute('bot', { action: 'open_app', app: 'impress', path: '../secret.pptx' }, signal),
    { code: 'computer.path_outside_workspace' },
  );
  await assert.rejects(
    () => computer.execute('bot', { action: 'open_app', app: 'browser', path: 'notes.txt' }, signal),
    { code: 'computer.app_not_allowed' },
  );
  assert.ok(
    events.some((command) => command.includes("libreoffice' '--impress'") || command.includes('libreoffice --impress')),
  );
  assert.ok(events.some((command) => command.includes('human_ai_beautiful.pptx')));
  assert.ok(events.some((command) => command.includes('--writer')));
  assert.ok(events.some((command) => command.includes('--calc')));
});
test('artifact preview/export reject host paths and traversal', () => {
  assert.equal(artifactPath('Downloads/report.pdf'), 'Downloads/report.pdf');
  for (const value of ['/etc/passwd', '../secret', 'a/../../secret', 'C:\\data', 'file:///etc/passwd', 'a\0b'])
    assert.throws(() => artifactPath(value));
});
test('a batch runs its steps in order against one observation and returns a single screenshot', async (t) => {
  const dir = tempDir(t, 'aelion-computer-test-');
  const events: string[] = [];
  let fail = '';
  const vm = {
    state: { status: 'ready', desktopReady: true, appsReady: true },
    ensureBotDesktop: async () => ({ vncUrl: 'ws://local/a' }),
    executeDesktop: async (command: string) => {
      events.push(command);
      return fail && command.includes(fail)
        ? { exitCode: 1, stdout: '', stderr: 'boom' }
        : { exitCode: 0, stdout: '', stderr: '' };
    },
    desktopScreenshot: async () => {
      events.push('screenshot');
      const png = Buffer.alloc(32);
      Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
      png.writeUInt32BE(1280, 16);
      png.writeUInt32BE(800, 20);
      return png;
    },
  } as unknown as VmController;
  const computer = new ComputerController(vm, dir, () => {}),
    signal = new AbortController().signal;
  const first = await computer.execute('a', { action: 'screenshot' }, signal);
  events.length = 0;
  const result = await computer.execute(
    'a',
    {
      action: 'batch',
      observationId: first.screenshot.id,
      actions: [
        { action: 'click', x: 100, y: 200 },
        { action: 'type', text: 'hello' },
        { action: 'key', key: 'ENTER' },
      ],
    },
    signal,
  );
  assert.equal(result.action, 'batch');
  assert.notEqual(result.screenshot.id, first.screenshot.id);
  assert.equal(events.filter((event) => event === 'screenshot').length, 1);
  assert.equal(events.at(-1), 'screenshot');
  const order = ['xdotool mousemove 100 200', 'xclip', 'Control_L+v', 'Return'].map((needle) =>
    events.findIndex((event) => event.includes(needle)),
  );
  assert.ok(order.every((index, i) => index >= 0 && (i === 0 || index > order[i - 1])));
  // Nothing moves when any step is out of range, observes, or nests another batch.
  events.length = 0;
  const batch = (actions: Parameters<ComputerController['execute']>[1]['actions']) =>
    computer.execute('a', { action: 'batch', observationId: result.screenshot.id, actions }, signal);
  await assert.rejects(() =>
    batch([
      { action: 'click', x: 1, y: 1 },
      { action: 'click', x: 5000, y: 1 },
    ]),
  );
  await assert.rejects(() => batch([{ action: 'screenshot' }]));
  await assert.rejects(() => batch([{ action: 'batch', actions: [{ action: 'wait' }] }]));
  await assert.rejects(() => batch([]));
  assert.equal(events.length, 0);
  // A step that fails names itself and stops the rest.
  fail = 'mousemove 30 40';
  await assert.rejects(
    () =>
      batch([
        { action: 'click', x: 10, y: 20 },
        { action: 'click', x: 30, y: 40 },
        { action: 'key', key: 'ENTER' },
      ]),
    (error: Error & { code?: string }) => error.code === 'computer.batch_failed' && error.message.includes('第 2 步'),
  );
  assert.ok(!events.some((event) => event.includes('Return')));
});
