import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders one visualizer-first control surface and one in-canvas transport', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Audio Visualizer Studio' })).toBeInTheDocument();
    expect(screen.getByText('Local-first')).toBeInTheDocument();
    expect(screen.getByLabelText('Audio file')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('data-overlay-mode', 'edit');
    expect(screen.getByRole('button', { name: 'Present' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Visualizer quick controls' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Visual' })).toBeInTheDocument();
    expect(document.querySelectorAll('.transport')).toHaveLength(1);
    expect(document.querySelector('.transport')?.closest('.stage')).not.toBeNull();
    expect(document.querySelector('.left-sidebar')).toBeNull();
    expect(document.querySelector('.right-sidebar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open project menu' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Show presentation controls' })).toBeInTheDocument();

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
