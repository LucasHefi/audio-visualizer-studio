import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('studio shell', () => {
  it('renders the editor shell and local-first status', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Audio Visualizer Studio' })).toBeInTheDocument();
    expect(screen.getByText('Local-first')).toBeInTheDocument();
    expect(screen.getByLabelText('Audio file')).toBeInTheDocument();
  });
});
