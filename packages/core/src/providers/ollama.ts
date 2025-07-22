/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentResponse,
  GenerateContentParameters,
  Part,
  FunctionCall,
  FinishReason,
} from '@google/genai';

export interface OllamaConfig {
  endpoint: string;
  model: string;
  stream?: boolean;
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: 'assistant';
    content: string;
  };
  done: boolean;
}

/**
 * Ollama provider implementing the generateContent interface
 * Handles communication with local Ollama server at http://localhost:11434
 */
export class OllamaProvider {
  private endpoint: string;
  private defaultModel: string;

  constructor(config: Partial<OllamaConfig> = {}) {
    this.endpoint = config.endpoint || 'http://localhost:11434';
    this.defaultModel = config.model || 'qwen2.5:1.5b';
  }

  /**
   * Generate content using Ollama API
   * Converts Gemini format to Ollama format and back
   */
  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const model = this.extractModelName(request.model || this.defaultModel);
    const contents = Array.isArray(request.contents) ? request.contents : [];
    const messages = this.convertToOllamaMessages(contents);

    try {
      const response = await this.callOllamaAPI(model, messages, false);
      return this.convertToGeminiResponse(response);
    } catch (error) {
      throw new Error(`Ollama API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate streaming content using Ollama API
   */
  async *generateContentStream(
    request: GenerateContentParameters,
  ): AsyncGenerator<GenerateContentResponse> {
    const model = this.extractModelName(request.model || this.defaultModel);
    const contents = Array.isArray(request.contents) ? request.contents : [];
    const messages = this.convertToOllamaMessages(contents);

    try {
      const streamResponse = await this.callOllamaAPIStream(model, messages);
      
      for await (const chunk of streamResponse) {
        if (chunk && chunk.message) {
          yield this.convertToGeminiResponse(chunk);
        }
      }
    } catch (error) {
      throw new Error(`Ollama streaming API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract model name from ollama: prefix
   */
  private extractModelName(modelWithPrefix: string): string {
    if (modelWithPrefix.startsWith('ollama:')) {
      return modelWithPrefix.substring(7); // Remove 'ollama:' prefix
    }
    return modelWithPrefix;
  }

  /**
   * Convert Gemini content format to Ollama messages
   */
  private convertToOllamaMessages(contents: any[]): OllamaMessage[] {
    if (!Array.isArray(contents)) {
      return [];
    }
    
    return contents.map(content => ({
      role: content.role === 'model' ? 'assistant' : content.role,
      content: this.extractTextFromParts(content.parts || []),
    }));
  }

  /**
   * Extract text from Gemini parts
   */
  private extractTextFromParts(parts: Part[]): string {
    return parts
      .filter(part => part.text)
      .map(part => part.text)
      .join('\n');
  }

  /**
   * Call Ollama API for non-streaming requests
   */
  private async callOllamaAPI(
    model: string,
    messages: OllamaMessage[],
    stream: boolean,
  ): Promise<OllamaResponse> {
    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Call Ollama API for streaming requests
   */
  private async *callOllamaAPIStream(
    model: string,
    messages: OllamaMessage[],
  ): AsyncGenerator<OllamaResponse> {
    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to get response reader');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const chunk = JSON.parse(line);
              yield chunk;
            } catch (parseError) {
              // Skip invalid JSON lines
              continue;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Convert Ollama response to Gemini format
   */
  private convertToGeminiResponse(ollamaResponse: OllamaResponse): GenerateContentResponse {
    return {
      candidates: [
        {
          content: {
            parts: [{ text: ollamaResponse.message.content }],
            role: 'model',
          },
          finishReason: ollamaResponse.done ? FinishReason.STOP : FinishReason.OTHER,
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: 0, // Ollama doesn't return token counts
        candidatesTokenCount: 0,
        totalTokenCount: 0,
      },
    } as GenerateContentResponse;
  }

  /**
   * Check if Ollama is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/api/version`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models from Ollama
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return data.models?.map((model: any) => model.name) || [];
    } catch {
      return [];
    }
  }
}