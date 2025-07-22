/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the OllamaProvider before importing the index
const mockProvider = {
  generateContent: vi.fn(),
  generateContentStream: vi.fn(),
  isAvailable: vi.fn().mockResolvedValue(true),
  listModels: vi.fn().mockResolvedValue(['llama3', 'qwen2.5:1.5b']),
};

vi.mock('./ollama.js', () => ({
  OllamaProvider: vi.fn().mockImplementation(() => mockProvider),
}));

// Now import the index functions
import {
  extractProvider,
  isProviderSupported,
  getProvider,
  createProviderFromModel,
  getRegisteredProviders,
} from './index.js';

describe('Provider Index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  describe('getProvider', () => {
    it('should create ollama provider successfully', async () => {
      const provider = await getProvider('ollama');
      expect(provider).toBeDefined();
      expect(provider.generateContent).toBeDefined();
      expect(provider.isAvailable).toBeDefined();
    });

    it('should throw error for unsupported provider', async () => {
      await expect(getProvider('unsupported')).rejects.toThrow(
        'Unsupported provider: unsupported',
      );
    });

    it('should throw error when Ollama is not available', async () => {
      mockProvider.isAvailable.mockResolvedValueOnce(false);
      
      await expect(getProvider('ollama')).rejects.toThrow(
        'Ollama is not running. Please start Ollama with: ollama serve',
      );
    });
  });

  describe('createProviderFromModel', () => {
    it('should create provider for ollama: prefix', async () => {
      const provider = await createProviderFromModel('ollama:llama3');
      expect(provider).toBeDefined();
      expect(provider?.generateContent).toBeDefined();
    });

    it('should return null for models without provider prefix', async () => {
      const provider = await createProviderFromModel('llama3');
      expect(provider).toBeNull();
    });

    it('should return null for unsupported provider', async () => {
      const provider = await createProviderFromModel('unsupported:model');
      expect(provider).toBeNull();
    });

    it('should handle provider creation failures gracefully', async () => {
      // Create a spy to capture console.warn calls
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Make the provider unavailable to trigger an error
      mockProvider.isAvailable.mockRejectedValueOnce(new Error('Connection failed'));
      
      const provider = await createProviderFromModel('ollama:model');
      expect(provider).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
      
      warnSpy.mockRestore();
    });
  });
});