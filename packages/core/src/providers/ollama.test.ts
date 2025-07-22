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

  describe('tool calling support', () => {
    it('should handle function calls in requests', async () => {
      const request = {
        model: 'ollama:llama3',
        contents: [{
          role: 'user',
          parts: [{
            functionCall: {
              name: 'get_weather',
              args: { location: 'San Francisco' },
            },
          }],
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'llama3',
          created_at: '2024-01-01T00:00:00Z',
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{
              id: 'call_123',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location":"San Francisco"}',
              },
            }],
          },
          done: true,
        }),
      });

      const result = await provider.generateContent(request);
      expect(result.candidates[0].content.parts).toContainEqual(
        expect.objectContaining({
          functionCall: {
            name: 'get_weather',
            args: { location: 'San Francisco' },
          },
        })
      );
    });

    it('should handle function responses', async () => {
      const request = {
        model: 'ollama:llama3',
        contents: [{
          role: 'function',
          parts: [{
            functionResponse: {
              name: 'get_weather',
              response: { temperature: 72, condition: 'sunny' },
            },
          }],
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'llama3',
          created_at: '2024-01-01T00:00:00Z',
          message: {
            role: 'assistant',
            content: 'The weather in your location is sunny with a temperature of 72°F.',
          },
          done: true,
        }),
      });

      const result = await provider.generateContent(request);
      expect(result.candidates[0].content.parts[0].text).toContain('sunny');
      expect(result.candidates[0].content.parts[0].text).toContain('72');
      
      // Verify the request was converted properly
      const callArgs = mockFetch.mock.calls[0][1];
      const requestBody = JSON.parse(callArgs.body);
      expect(requestBody.messages[0]).toEqual(
        expect.objectContaining({
          role: 'tool',
          tool_call_id: 'get_weather',
          content: '{"temperature":72,"condition":"sunny"}',
        })
      );
    });

    it('should handle mixed content with text and function calls', async () => {
      const request = {
        model: 'ollama:llama3',
        contents: [{
          role: 'user',
          parts: [
            { text: 'Please check the weather and' },
            {
              functionCall: {
                name: 'get_weather',
                args: { location: 'New York' },
              },
            },
          ],
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'llama3',
          created_at: '2024-01-01T00:00:00Z',
          message: {
            role: 'assistant',
            content: 'I\'ll check the weather for you.',
            tool_calls: [{
              id: 'call_456',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location":"New York"}',
              },
            }],
          },
          done: true,
        }),
      });

      const result = await provider.generateContent(request);
      
      // Should have both text and function call in response
      expect(result.candidates[0].content.parts).toHaveLength(2);
      expect(result.candidates[0].content.parts[0].text).toBe('I\'ll check the weather for you.');
      expect(result.candidates[0].content.parts[1]).toEqual(
        expect.objectContaining({
          functionCall: {
            name: 'get_weather',
            args: { location: 'New York' },
          },
        })
      );
    });
  });

  describe('error handling and retry logic', () => {
    it('should retry on server errors', async () => {
      const request = {
        model: 'llama3',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };

      // First two calls fail, third succeeds
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' })
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            model: 'llama3',
            message: { role: 'assistant', content: 'Hello!' },
            done: true,
          }),
        });

      const result = await provider.generateContent(request);
      expect(result.candidates[0].content.parts[0].text).toBe('Hello!');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on client errors', async () => {
      const request = {
        model: 'llama3',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };

      mockFetch.mockResolvedValueOnce({ 
        ok: false, 
        status: 400, 
        statusText: 'Bad Request',
        text: async () => 'Invalid model'
      });

      await expect(provider.generateContent(request)).rejects.toThrow('HTTP 400: Invalid model');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('environment variable configuration', () => {
    it('should use environment variables for configuration', () => {
      const originalEndpoint = process.env.OLLAMA_ENDPOINT;
      const originalModel = process.env.OLLAMA_MODEL;
      const originalTimeout = process.env.OLLAMA_TIMEOUT;
      
      try {
        process.env.OLLAMA_ENDPOINT = 'http://custom-host:8080';
        process.env.OLLAMA_MODEL = 'custom-model';
        process.env.OLLAMA_TIMEOUT = '60000';
        
        const customProvider = new OllamaProvider();
        
        // Use reflection to check private properties (for testing purposes)
        expect((customProvider as any).endpoint).toBe('http://custom-host:8080');
        expect((customProvider as any).defaultModel).toBe('custom-model');
        expect((customProvider as any).timeout).toBe(60000);
      } finally {
        // Restore original env vars
        if (originalEndpoint !== undefined) {
          process.env.OLLAMA_ENDPOINT = originalEndpoint;
        } else {
          delete process.env.OLLAMA_ENDPOINT;
        }
        if (originalModel !== undefined) {
          process.env.OLLAMA_MODEL = originalModel;
        } else {
          delete process.env.OLLAMA_MODEL;
        }
        if (originalTimeout !== undefined) {
          process.env.OLLAMA_TIMEOUT = originalTimeout;
        } else {
          delete process.env.OLLAMA_TIMEOUT;
        }
      }
    });
  });
});