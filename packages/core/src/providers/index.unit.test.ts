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
} from './index.js';

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
});