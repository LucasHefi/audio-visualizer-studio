import { ExportValidationError } from './types';

export const ENCODER_QUEUE_HIGH_WATER_MARK = 2;

type EncoderQueue = {
  readonly encodeQueueSize: number;
};

const yieldToEncoder = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export const waitForEncoderCapacity = async (encoder: EncoderQueue, signal?: AbortSignal): Promise<void> => {
  while (encoder.encodeQueueSize > ENCODER_QUEUE_HIGH_WATER_MARK) {
    if (signal?.aborted) throw new ExportValidationError('CANCELLED', 'Export was cancelled.');
    await yieldToEncoder();
  }
};
