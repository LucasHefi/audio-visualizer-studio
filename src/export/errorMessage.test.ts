import { describe, expect, it } from 'vitest';
import { formatExportError } from './errorMessage';

describe('formatExportError', () => {
  it('adds an actionable WebM hint when AAC is unavailable', () => {
    expect(formatExportError(new Error('Export unavailable: AAC audio configuration is unsupported.'))).toContain('Přepni formát exportu na WebM (Opus)');
  });

  it('explains the mobile fastStart failure and suggests WebM', () => {
    const message = formatExportError(new Error("Uncaught Error: Cannot add more audio chunks than specified in 'fastStart' (12171)"));

    expect(message).toContain('Přepni formát exportu na WebM (Opus)');
    expect(message).toContain('fastStart');
  });

  it('adds an actionable hint when the selected local file becomes unreadable', () => {
    const message = formatExportError(new Error('Export unavailable: The requested file could not be read, typically due to permission problems that have occurred after a reference to a file was acquired.'));

    expect(message).toContain('Vyber MP3 znovu');
  });

  it('preserves unrelated export errors', () => {
    expect(formatExportError(new Error('Export was cancelled.'))).toBe('Export was cancelled.');
  });
});
