import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import type { PhoneAudioDevice, PhoneAudioState } from '@trifold/api';
import { errorMessage, type Logger } from '../log';

/** What the helper reports, minus the remembered list the API layer adds. */
export interface ReceiverStatus {
  supported: boolean;
  state: PhoneAudioState;
  device: PhoneAudioDevice | null;
  detail: string | null;
}

/** The subset of `child_process.spawn` the receiver needs, so tests can fake the helper. */
export type SpawnHelper = (
  command: string,
  args: string[],
  options: { windowsHide: boolean; stdio: ['ignore', 'pipe', 'pipe'] },
) => ChildProcess;

interface HelperMessage {
  event?: unknown;
  state?: unknown;
  detail?: unknown;
  devices?: unknown;
}

const STATES = new Set<PhoneAudioState>([
  'off',
  'connecting',
  'connected',
  'reconnecting',
  'failed',
]);

/** The helper runs in Windows PowerShell 5.1 (WinRT projection); PowerShell 7 lacks it. */
const POWERSHELL = 'powershell.exe';

/**
 * Phone audio receiver (ADR 0007). Windows only: runs `helper.ps1` in a hidden PowerShell,
 * once per listing and once, long-lived, per connection. The connection lives exactly as long
 * as that process, so "disconnect" is a kill. State changes go to `onStatus` as they arrive.
 */
export class PhoneAudioReceiver {
  private child: ChildProcess | null = null;
  private current: ReceiverStatus;

  constructor(
    private readonly script: string,
    private readonly logger: Logger,
    private readonly onStatus: (status: ReceiverStatus) => void,
    platform: NodeJS.Platform = process.platform,
    private readonly spawn: SpawnHelper = nodeSpawn as unknown as SpawnHelper,
  ) {
    this.current = {
      supported: platform === 'win32',
      state: 'off',
      device: null,
      detail: platform === 'win32' ? null : 'Only Windows can receive phone audio this way.',
    };
  }

  status(): ReceiverStatus {
    return { ...this.current };
  }

  /** The paired phones Windows can take audio from. Empty where unsupported. */
  async listDevices(): Promise<PhoneAudioDevice[]> {
    if (!this.current.supported) return [];
    return new Promise((resolve, reject) => {
      const child = this.launch('list', '', (message) => {
        if (message.event !== 'devices' || !Array.isArray(message.devices)) return;
        resolve(
          message.devices
            .filter(
              (d): d is PhoneAudioDevice =>
                typeof d === 'object' &&
                d !== null &&
                typeof (d as PhoneAudioDevice).id === 'string' &&
                typeof (d as PhoneAudioDevice).name === 'string',
            )
            .map((d) => ({ id: d.id, name: d.name })),
        );
      });
      child.once('error', (err) => reject(new Error(`could not start PowerShell: ${err.message}`)));
      child.once('exit', (code) => {
        if (code === 0) resolve([]);
        else reject(new Error(this.current.detail ?? `the phone list helper exited with ${code}`));
      });
    });
  }

  /** Connects to one phone; any current connection is dropped first. */
  connect(device: PhoneAudioDevice): ReceiverStatus {
    if (!this.current.supported) return this.status();
    this.disconnect();
    this.update({ state: 'connecting', device, detail: null });
    const child = this.launch('connect', device.id, (message) => {
      if (message.event !== 'status' || !isState(message.state)) return;
      if (this.child !== child) return;
      const detail = typeof message.detail === 'string' ? message.detail : null;
      this.update({ state: message.state, device, detail });
    });
    child.once('error', (err) => {
      if (this.child === child) {
        this.child = null;
        this.update({
          state: 'failed',
          device,
          detail: `could not start PowerShell: ${err.message}`,
        });
      }
    });
    child.once('exit', (code) => {
      if (this.child !== child) return;
      this.child = null;
      if (this.current.state === 'failed') return;
      this.update({
        state: code === 0 ? 'off' : 'failed',
        device: code === 0 ? null : device,
        detail: code === 0 ? null : `the receiver stopped unexpectedly (exit ${code})`,
      });
    });
    this.child = child;
    return this.status();
  }

  disconnect(): ReceiverStatus {
    const child = this.child;
    this.child = null;
    if (child) {
      child.kill();
      this.logger.info('phone audio: connection closed');
    }
    if (this.current.state !== 'off') this.update({ state: 'off', device: null, detail: null });
    return this.status();
  }

  private update(patch: Partial<ReceiverStatus>): void {
    this.current = { ...this.current, ...patch };
    this.onStatus(this.status());
  }

  private launch(
    mode: 'list' | 'connect',
    deviceId: string,
    onMessage: (message: HelperMessage) => void,
  ): ChildProcess {
    const script =
      `$Mode='${mode}'; $DeviceId='${deviceId.replace(/'/g, "''")}'; $ParentPid=${process.pid};\n` +
      this.script;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const child = this.spawn(
      POWERSHELL,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let buffer = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('{')) continue;
        try {
          onMessage(JSON.parse(line) as HelperMessage);
        } catch (err) {
          this.logger.warn(`phone audio helper sent something odd: ${errorMessage(err)}`);
        }
      }
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      const text = chunk.trim();
      if (text && !text.startsWith('#<') && !text.startsWith('<')) {
        this.logger.warn(`phone audio helper: ${text.slice(0, 300)}`);
      }
    });
    return child;
  }
}

function isState(value: unknown): value is PhoneAudioState {
  return typeof value === 'string' && STATES.has(value as PhoneAudioState);
}
