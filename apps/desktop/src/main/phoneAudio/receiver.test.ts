import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../log';
import { PhoneAudioReceiver, type ReceiverStatus, type SpawnHelper } from './receiver';

const logger: Logger = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const phone = { id: String.raw`\\?\BTHENUM#{0000110a}\SNK`, name: "Ian's iPhone" };

/** A fake PowerShell: scripts land in `launched`, output is pushed by the test. */
class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;
  kill = vi.fn(() => {
    this.killed = true;
    this.emit('exit', null);
    return true;
  });
  say(line: object | string) {
    this.stdout.write(`${typeof line === 'string' ? line : JSON.stringify(line)}\n`);
  }
}

function harness(platform: NodeJS.Platform = 'win32') {
  const launched: Array<{ child: FakeChild; script: string; args: string[] }> = [];
  const spawn: SpawnHelper = (_command, args) => {
    const child = new FakeChild();
    const encoded = args[args.indexOf('-EncodedCommand') + 1]!;
    launched.push({ child, script: Buffer.from(encoded, 'base64').toString('utf16le'), args });
    return child as unknown as ChildProcess;
  };
  const statuses: ReceiverStatus[] = [];
  const receiver = new PhoneAudioReceiver(
    '# helper body',
    logger,
    (s) => statuses.push(s),
    platform,
    spawn,
  );
  return { receiver, launched, statuses };
}

async function tick() {
  await new Promise((r) => setTimeout(r, 0));
}

describe('PhoneAudioReceiver', () => {
  it('is unsupported off Windows and does nothing there', async () => {
    const { receiver, launched } = harness('darwin');
    expect(receiver.status().supported).toBe(false);
    expect(await receiver.listDevices()).toEqual([]);
    expect(receiver.connect(phone).state).toBe('off');
    expect(launched).toHaveLength(0);
  });

  it('lists phones from a one-shot helper run, hidden and in Windows PowerShell', async () => {
    const { receiver, launched } = harness();
    const listing = receiver.listDevices();
    await tick();
    const run = launched[0]!;
    expect(run.args).toContain('-NoProfile');
    expect(run.script).toMatch(/^\$Mode='list'; \$DeviceId=''; \$ParentPid=\d+;\n# helper body/);
    run.child.say('#< CLIXML noise');
    run.child.say({ event: 'devices', devices: [phone, { junk: true }] });
    run.child.emit('exit', 0);
    expect(await listing).toEqual([phone]);
  });

  it('connects through a long-lived helper, relays its states, and kills it to disconnect', async () => {
    const { receiver, launched, statuses } = harness();
    expect(receiver.connect(phone)).toMatchObject({ state: 'connecting', device: phone });
    await tick();
    const run = launched[0]!;
    expect(run.script).toContain(`$Mode='connect'; $DeviceId='${phone.id}';`);
    run.child.say({ event: 'status', state: 'connected' });
    await tick();
    expect(receiver.status()).toMatchObject({ state: 'connected', device: phone, detail: null });
    run.child.say({ event: 'status', state: 'reconnecting', detail: 'The phone went away' });
    run.child.say({ event: 'status', state: 'bogus' });
    await tick();
    expect(receiver.status()).toMatchObject({
      state: 'reconnecting',
      detail: 'The phone went away',
    });

    expect(receiver.disconnect()).toMatchObject({ state: 'off', device: null });
    expect(run.child.kill).toHaveBeenCalled();
    expect(statuses.map((s) => s.state)).toEqual([
      'connecting',
      'connected',
      'reconnecting',
      'off',
    ]);
  });

  it('escapes quotes in the device id and drops the old helper when switching phones', async () => {
    const { receiver, launched } = harness();
    receiver.connect({ id: "it's", name: 'Odd' });
    receiver.connect(phone);
    await tick();
    expect(launched[0]!.script).toContain("$DeviceId='it''s'");
    expect(launched[0]!.child.kill).toHaveBeenCalled();
    expect(launched[1]!.child.kill).not.toHaveBeenCalled();
    expect(receiver.status().device).toEqual(phone);
  });

  it('reports a helper that fails or dies, and a PowerShell that will not start', async () => {
    const { receiver, launched } = harness();
    receiver.connect(phone);
    await tick();
    launched[0]!.child.say({
      event: 'status',
      state: 'failed',
      detail: 'The phone did not answer.',
    });
    await tick();
    expect(receiver.status()).toMatchObject({
      state: 'failed',
      detail: 'The phone did not answer.',
    });

    receiver.connect(phone);
    await tick();
    launched[1]!.child.say({ event: 'status', state: 'connected' });
    launched[1]!.child.emit('exit', 1);
    await tick();
    expect(receiver.status()).toMatchObject({
      state: 'failed',
      detail: expect.stringContaining('exit 1'),
    });

    receiver.connect(phone);
    await tick();
    launched[2]!.child.emit('error', new Error('ENOENT'));
    expect(receiver.status()).toMatchObject({
      state: 'failed',
      detail: expect.stringContaining('ENOENT'),
    });
  });
});
