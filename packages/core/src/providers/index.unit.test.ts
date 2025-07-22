/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractProvider,
  isProviderSupported,
  getRegisteredProviders,
  getProvider,
} from './index.js';

// Mock the Ollama provider
vi.mock('./ollama.js', () => ({
  OllamaProvider: vi.fn().mockImplementation(() => ({
    isAvailable: vi.fn().mockResolvedValue(true),
    generateContent: vi.fn(),
    generateContentStream: vi.fn(),
  })),
}));

describe('Provider Index (Unit Tests)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractProvider', () => {
    it('should extract provider and model from valid format', () => {
      const result = extractProvider('ollama:llama3');
      expect(result).toEqual({
        provider: 'ollama',
        modelName: 'llama3',
      });
    });

    it('should handle model without provider prefix', () => {
      const result = extractProvider('llama3');
      expect(result).toEqual({
        provider: 'default',
        modelName: 'llama3',
      });
    });

    it('should handle empty or invalid input', () => {
      expect(extractProvider('')).toEqual({
        provider: 'default',
        modelName: '',
      });

      expect(extractProvider(null as any)).toEqual({
        provider: 'default',
        modelName: '',
      });

      expect(extractProvider(undefined as any)).toEqual({
        provider: 'default',
        modelName: '',
      });
    });

    it('should handle multiple colons correctly', () => {
      const result = extractProvider('ollama:model:with:colons');
      expect(result).toEqual({
        provider: 'ollama',
        modelName: 'model:with:colons',
      });
    });
  });

  describe('isProviderSupported', () => {
    it('should return true for ollama provider', () => {
      expect(isProviderSupported('ollama')).toBe(true);
    });

    it('should return false for unsupported provider', () => {
      expect(isProviderSupported('unsupported')).toBe(false);
    });
  });

  describe('getRegisteredProviders', () => {
    it('should include ollama in registered providers', () => {
      const providers = getRegisteredProviders();
      expect(providers).toContain('ollama');
    });
  });

  describe('provider functionality', () => {
    it('should provide token counting estimation', async () => {
      const provider = await getProvider('ollama');
      
      const result = await provider.countTokens({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'This is a test message with several words' }],
          },
        ],
      });
      
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(typeof result.totalTokens).toBe('number');
    });

    it('should throw error for embedding requests', async () => {
      const provider = await getProvider('ollama');
      
      await expect(provider.embedContent({})).rejects.toThrow(
        'Embedding is not supported by the Ollama provider'
      );
    });
  });
});