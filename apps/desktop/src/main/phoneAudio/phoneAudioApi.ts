import type { PhoneAudioStatus, TrifoldApi } from '@trifold/api';
import type { AppConfigStore } from '../appConfig';
import { errorMessage, type Logger } from '../log';
import type { PhoneAudioReceiver, ReceiverStatus } from './receiver';

/**
 * The `phoneAudio` namespace (ADR 0007): the receiver's state plus the phones remembered in
 * the app config, so a phone connected once is one click the next time.
 */
export function createPhoneAudioApi(
  receiver: PhoneAudioReceiver,
  config: AppConfigStore,
  logger: Logger,
): Pick<TrifoldApi, 'phoneAudio'> {
  const compose = (status: ReceiverStatus): PhoneAudioStatus => ({
    ...status,
    remembered: config.get().phoneAudioDevices,
    source: config.get().audioSource,
  });
  return {
    phoneAudio: {
      async status() {
        return compose(receiver.status());
      },
      async listDevices() {
        return receiver.listDevices();
      },
      async connect(device) {
        const status = receiver.connect(device);
        if (status.state !== 'connecting') return compose(status);
        // Remembered on the attempt, not on success: the next click should find it even if the
        // phone was out of range this time.
        const others = config.get().phoneAudioDevices.filter((d) => d.id !== device.id);
        await config
          .update({
            phoneAudioDevices: [
              { id: device.id, name: device.name, lastConnectedAt: new Date().toISOString() },
              ...others,
            ],
          })
          .catch((err: unknown) => {
            logger.warn(`could not remember the phone: ${errorMessage(err)}`);
          });
        return compose(status);
      },
      async disconnect() {
        return compose(receiver.disconnect());
      },
      async forget(deviceId) {
        const current = receiver.status();
        if (current.device?.id === deviceId) receiver.disconnect();
        await config.update({
          phoneAudioDevices: config.get().phoneAudioDevices.filter((d) => d.id !== deviceId),
        });
        return compose(receiver.status());
      },
      async setSource(source) {
        await config.update({ audioSource: source });
        return compose(receiver.status());
      },
    },
  };
}
