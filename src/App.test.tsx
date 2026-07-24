import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { normalizeProjectState, useProjectStore } from './core/projectStore';
import { RendererRuntime } from './visualizer/RendererRuntime';

describe('App', () => {
  it('renders one visualizer-first control surface and one in-canvas transport', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Audio Visualizer Studio' })).toBeInTheDocument();
    expect(screen.queryByText('Local-first')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Audio file')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('data-overlay-mode', 'edit');
    expect(screen.getByRole('button', { name: 'Present' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Visual quick controls' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(document.querySelector('.preview-empty-card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Visual' })).toBeInTheDocument();
    expect(document.querySelectorAll('.transport')).toHaveLength(1);
    expect(document.querySelector('.transport')?.closest('.stage')).not.toBeNull();
    expect(document.querySelector('.left-sidebar')).toBeNull();
    expect(document.querySelector('.right-sidebar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open project menu' })).not.toBeInTheDocument();
  });

  it('re-syncs the renderer after browser history and viewport restoration events', () => {
    const resizeSpy = vi.spyOn(RendererRuntime.prototype, 'resize');
    const { unmount } = render(<App />);
    const callsBeforeRestore = resizeSpy.mock.calls.length;

    window.dispatchEvent(new Event('pageshow'));
    window.dispatchEvent(new Event('orientationchange'));
    window.dispatchEvent(new Event('resize'));

    expect(resizeSpy.mock.calls.length).toBeGreaterThan(callsBeforeRestore);
    unmount();
    resizeSpy.mockRestore();
  });
  it('opens and closes an overlay quick-control panel', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Style' }));
    expect(screen.getByRole('dialog', { name: 'Style settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Style settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Style settings' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Close Style settings' }));
    expect(screen.queryByRole('dialog', { name: 'Style settings' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Style' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Style' }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog', { name: 'Style settings' })).not.toBeInTheDocument();
  });

  it('changes the selected layer palette from Style and updates the preview label', () => {
    useProjectStore.setState(normalizeProjectState({}));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Style' }));

    const emerald = screen.getByRole('button', { name: /Emerald/ });
    expect(emerald).toHaveAttribute('data-palette-id', 'emerald');
    expect(emerald).toHaveAttribute('data-selected-layer-id', 'layer-1');
    fireEvent.click(emerald);

    expect(emerald).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.preview-corner.bottom-right')?.textContent).toContain('Emerald');
    expect(useProjectStore.getState().visualLayers[0].paletteId).toBe('emerald');
  });

  it('renders recognizable floating control icons with accessible panel references', () => {
    useProjectStore.setState(normalizeProjectState({}));
    render(<App />);
    expect(document.querySelectorAll('.dock-icon-svg')).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Visual' })).toHaveAttribute('aria-controls', 'visualizer-overlay-panel');
    expect(screen.getByRole('button', { name: 'Style' })).toHaveAttribute('aria-controls', 'visualizer-overlay-panel');
  });

  it('exposes Cosmic Kaleidoscope with selection separate from activation', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Visual' }));
    expect(screen.getByRole('button', { name: 'Původní' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Původní' })).toHaveClass('text-button');
    expect(screen.getByRole('button', { name: 'Náhodně' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Náhodně' })).toHaveClass('text-button');
    expect(screen.queryByRole('button', { name: /3D Spectrum/ })).not.toBeInTheDocument();
    const cosmic = screen.getAllByRole('button', { name: /Cosmic Kaleidoscope/ }).find((button) => button.classList.contains('overlay-option'));
    expect(cosmic).toBeDefined();
    expect(cosmic).toHaveAttribute('aria-pressed', 'false');
    const canvasBeforeSwitch = document.querySelector('canvas');
    fireEvent.click(cosmic!);
    expect(cosmic).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('canvas')).toBe(canvasBeforeSwitch);
    const cosmicToggle = screen.getByRole('button', { name: 'Activate Cosmic Kaleidoscope' });
    fireEvent.click(cosmicToggle);
    expect(cosmicToggle).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelectorAll('.canvas-frame')).toHaveLength(2);
    expect(screen.getByText('webgl2 · kaleidoscope · cosmic · audio-reactive')).toBeInTheDocument();
  });

  it('offers platform groups and applies a portrait preset without replacing the runtime surface', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Layout' }));
    expect(screen.getByRole('heading', { name: 'YouTube' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'TikTok' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Instagram' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /TikTok Portrait.*Portrait · 9:16/ })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: /TikTok Portrait.*Portrait · 9:16/ }));
    expect(screen.getByRole('button', { name: /TikTok Portrait.*Portrait · 9:16/ })).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.canvas-frame')).toHaveAttribute('data-profile-id', 'tiktok-portrait');
    expect(document.querySelector('.profile-selection')?.textContent).toContain('Active: TikTok Portrait · 9:16 · 1080 × 1920');
  });

  it('enters presentation mode, reveals a touch exit affordance and exits without changing the shell owner', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Present' }));
    expect(screen.getByRole('main')).toHaveAttribute('data-overlay-mode', 'presentation');
    expect(screen.getByRole('main')).toHaveAttribute('data-controls-visible', 'false');
    expect(screen.getByRole('button', { name: 'Show controls' })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('region', { name: 'Visualizer stage' }));
    expect(screen.getByRole('main')).toHaveAttribute('data-controls-visible', 'true');
    expect(screen.getByRole('button', { name: 'Exit presentation mode' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Exit presentation mode' }));
    expect(screen.getByRole('main')).toHaveAttribute('data-overlay-mode', 'edit');
    expect(screen.getByRole('main')).toHaveAttribute('data-controls-visible', 'true');
  });

  it('keeps Escape precedence for an open panel before presentation exit', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Visual' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Visual settings' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Present' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('main')).toHaveAttribute('data-overlay-mode', 'edit');
  });
});
