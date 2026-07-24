export interface StableAudioFile {
  readonly name: string;
  readonly size: number;
  readonly lastModified: number;
  readonly bytes: ArrayBuffer;
}

export interface ReadableAudioFile {
  readonly name: string;
  readonly size: number;
  readonly lastModified: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

const READ_ERROR_MESSAGE = 'The local audio file could not be read. Re-select the MP3 and keep the source available until it finishes loading.';

/**
 * Copies the selected file while the browser still owns the fresh input
 * reference. Later export stages must never re-read the original File.
 */
export const snapshotAudioFile = async (file: ReadableAudioFile): Promise<StableAudioFile> => {
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
    throw new Error(`${READ_ERROR_MESSAGE}${detail}`);
  }
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) {
    throw new Error(READ_ERROR_MESSAGE);
  }
  return {
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    bytes: bytes.slice(0),
  };
};
