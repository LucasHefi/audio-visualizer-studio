const AAC_UNSUPPORTED_MESSAGE = 'AAC audio configuration is unsupported.';
const AAC_UNSUPPORTED_HINT = 'Přepni formát exportu na WebM (Opus), pokud je tato volba dostupná. Jinak použij Chromium s podporou WebCodecs AAC.';
const FAST_START_AUDIO_MESSAGE = 'Cannot add more audio chunks than specified in';
const FAST_START_AUDIO_HINT = 'Mobilní AAC enkodér vytvořil více chunků, než dovoloval MP4 fastStart. Přepni formát exportu na WebM (Opus), pokud je tato volba dostupná, nebo aktualizuj aplikaci na verzi s opravou mobilního MP4 exportu.';
const FILE_READ_MESSAGE = 'The local audio file could not be read.';
const FILE_READ_HINT = 'Soubor se nepodařilo udržet čitelný. Vyber MP3 znovu a nech ji načíst před spuštěním exportu.';

export const formatExportError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'Export se nezdařil.';
  if (message.includes(FAST_START_AUDIO_MESSAGE)) return `${message} ${FAST_START_AUDIO_HINT}`;
  if (message.includes(FILE_READ_MESSAGE) || message.includes('requested file could not be read')) return `${message} ${FILE_READ_HINT}`;
  return message.includes(AAC_UNSUPPORTED_MESSAGE) ? `${message} ${AAC_UNSUPPORTED_HINT}` : message;
};
