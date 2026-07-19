import '@testing-library/jest-dom/vitest';

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: () => null,
});
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(HTMLMediaElement.prototype, 'load', {
  configurable: true,
  value: () => undefined,
});
