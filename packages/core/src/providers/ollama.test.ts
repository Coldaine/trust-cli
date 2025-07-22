/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider } from './ollama.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    provider = new OllamaProvider();
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractModelName', () => {
    it('should extract model name from ollama: prefix', async () => {
      const request = {
        model: 'ollama:llama3',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }],
          },
        ],
      };

      // Mock successful Ollama API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'llama3',
          created_at: '2024-01-01T00:00:00Z',
          message: {
            role: 'assistant',
            content: 'Hello there!',
          },
          done: true,
        }),
      });

      await provider.generateContent(request);

      // Verify the API was called with the correct model name (without prefix)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining('"model":"llama3"'),
        }),
      );
    });

    it('should use model name as-is when no ollama: prefix', async () => {
      const request = {
        model: 'llama3',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }],
          },
        ],
      };

      // Mock successful Ollama API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'llama3',
          created_at: '2024-01-01T00:00:00Z',
          message: {
            role: 'assistant',
            content: 'Hello there!',
          },
          done: true,
        }),
      });

      await provider.generateContent(request);

      // Verify the API was called with the original model name
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
        expect.objectContaining({
          body: expect.stringContaining('"model":"llama3"'),
        }),
      );
    });
  });

  describe('generateContent', () => {
    it('should generate content successfully', async () => {
      const request = {
        model: 'llama3',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }],
          },
        ],
      };

      const mockResponse = {
        model: 'llama3',
        created_at: '2024-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          content: 'Hello there!',
        },
        done: true,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await provider.generateContent(request);

      expect(result).toEqual({
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello there!' }],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
          },
        ],
        usageMetadata: {
          promptTokenCount: 0,
          candidatesTokenCount: 0,
          totalTokenCount: 0,
        },
      });
    });

    it('should handle API errors gracefully', async () => {
      const request = {
        model: 'llama3',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(provider.generateContent(request)).rejects.toThrow(
        'Ollama API error: HTTP 500: Internal Server Error',
      );
    });
  });

  describe('isAvailable', () => {
    it('should return true when Ollama is available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const result = await provider.isAvailable();
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/version',
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });

    it('should return false when Ollama is not available', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await provider.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe('listModels', () => {
    it('should return list of models when successful', async () => {
      const mockModels = {
        models: [
          { name: 'llama3' },
          { name: 'qwen2.5:1.5b' },
          { name: 'phi3:3.8b' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockModels,
      });

      const result = await provider.listModels();
      expect(result).toEqual(['llama3', 'qwen2.5:1.5b', 'phi3:3.8b']);
    });

    it('should return empty array when API fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await provider.listModels();
      expect(result).toEqual([]);
    });
  });
});