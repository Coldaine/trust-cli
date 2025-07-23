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
import { getModelConfig, modelSupportsTools } from './ollama-model-configs.js';

export interface OllamaConfig {
  endpoint?: string;
  model?: string;
  stream?: boolean;
  timeout?: number;
}

export interface OllamaToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_call_id?: string;
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: 'assistant';
    content: string;
    tool_calls?: OllamaToolCall[];
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
  private timeout: number;

  constructor(config: Partial<OllamaConfig> = {}) {
    this.endpoint = config.endpoint || 
      process.env.OLLAMA_ENDPOINT || 
      process.env.OLLAMA_HOST || 
      'http://localhost:11434';
    
    this.defaultModel = config.model || 
      process.env.OLLAMA_MODEL || 
      'qwen2.5:1.5b';
    
    this.timeout = config.timeout || 
      parseInt(process.env.OLLAMA_TIMEOUT || '30000', 10);
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
    
    // Check if request contains tool calls
    const hasToolCalls = this.checkForToolCalls(contents);
    if (hasToolCalls) {
      this.validateModelToolSupport(model);
    }
    
    const messages = this.convertToOllamaMessages(contents);

    try {
      const response = await this.callOllamaAPIWithRetry(
        () => this.callOllamaAPI(model, messages, false)
      );
      return this.convertToGeminiResponse(response);
    } catch (error) {
      throw new Error(
        `Ollama API error for model '${model}': ${
          error instanceof Error ? error.message : 'Unknown error'
        }. Ensure Ollama is running at ${this.endpoint}`
      );
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
    
    // Check if request contains tool calls
    const hasToolCalls = this.checkForToolCalls(contents);
    if (hasToolCalls) {
      this.validateModelToolSupport(model);
    }
    
    const messages = this.convertToOllamaMessages(contents);

    try {
      const streamResponse = await this.callOllamaAPIStreamWithRetry(model, messages);
      
      for await (const chunk of streamResponse) {
        if (chunk && chunk.message) {
          yield this.convertToGeminiResponse(chunk);
        }
      }
    } catch (error) {
      throw new Error(
        `Ollama streaming API error for model '${model}': ${
          error instanceof Error ? error.message : 'Unknown error'
        }. Ensure Ollama is running at ${this.endpoint}`
      );
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
    
    return contents.map(content => {
      const message: OllamaMessage = {
        role: this.convertRole(content.role),
        content: this.extractTextFromParts(content.parts || []),
      };

      // Handle function calls in parts
      const functionCalls = content.parts?.filter((part: Part) => part.functionCall);
      if (functionCalls?.length > 0) {
        message.tool_calls = functionCalls.map((fc: Part) => ({
          id: fc.functionCall.id || this.generateId(),
          type: 'function' as const,
          function: {
            name: fc.functionCall.name,
            arguments: JSON.stringify(fc.functionCall.args || {}),
          },
        }));
      }

      // Handle function responses
      const functionResponse = content.parts?.find((part: Part) => part.functionResponse);
      if (functionResponse) {
        message.role = 'tool';
        message.tool_call_id = functionResponse.functionResponse.name;
        message.content = JSON.stringify(functionResponse.functionResponse.response);
      }

      return message;
    });
  }

  /**
   * Convert role from Gemini format to Ollama format
   */
  private convertRole(role: string): 'system' | 'user' | 'assistant' | 'tool' {
    switch (role) {
      case 'model':
        return 'assistant';
      case 'function':
        return 'tool';
      case 'system':
        return 'system';
      case 'user':
      default:
        return 'user';
    }
  }

  /**
   * Generate a unique ID for tool calls
   */
  private generateId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
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
   * Retry logic implementation
   */
  private async callOllamaAPIWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    backoffMs = 1000,
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on 4xx errors (client errors)
        // Check if the error message contains HTTP 4xx status
        if (lastError.message.match(/HTTP 4\d\d:/)) {
          throw lastError;
        }
        
        if (attempt < maxRetries - 1) {
          const delay = backoffMs * Math.pow(2, attempt); // Exponential backoff
          console.warn(`Ollama API attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`Ollama API failed after ${maxRetries} attempts: ${lastError!.message}`);
  }

  /**
   * Retry wrapper for streaming requests
   */
  private async callOllamaAPIStreamWithRetry(
    model: string,
    messages: OllamaMessage[],
    maxRetries = 2,
    backoffMs = 1000,
  ): Promise<AsyncGenerator<OllamaResponse>> {
    return this.callOllamaAPIWithRetry(
      () => this.callOllamaAPIStream(model, messages),
      maxRetries,
      backoffMs
    );
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
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
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
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to get response reader');
    }

    const decoder = new TextDecoder();
    const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB
    let buffer = '';
    let consecutiveErrors = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Prevent memory exhaustion
        if (buffer.length > MAX_BUFFER_SIZE) {
          throw new Error('Response buffer exceeded 1MB - possible malformed response');
        }

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const chunk = JSON.parse(line);
              yield chunk;
              consecutiveErrors = 0; // Reset error counter on success
            } catch (parseError) {
              console.warn(`[Ollama] Failed to parse streaming response: ${line.substring(0, 100)}...`);
              // Don't silently continue - track consecutive errors
              if (++consecutiveErrors > 5) {
                throw new Error('Too many consecutive JSON parse errors in stream');
              }
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
    const parts: Part[] = [];
    
    if (ollamaResponse.message.content) {
      parts.push({ text: ollamaResponse.message.content });
    }

    // Handle tool calls in the response
    if (ollamaResponse.message.tool_calls) {
      for (const toolCall of ollamaResponse.message.tool_calls) {
        parts.push({
          functionCall: {
            name: toolCall.function.name,
            args: JSON.parse(toolCall.function.arguments),
          },
        });
      }
    }

    return {
      candidates: [
        {
          content: {
            parts,
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

  /**
   * Check if the content contains tool/function calls
   */
  private checkForToolCalls(contents: any[]): boolean {
    return contents.some(content => 
      content.parts?.some((part: Part) => 
        part.functionCall || part.functionResponse
      )
    );
  }

  /**
   * Validate if the model supports tool calling
   */
  private validateModelToolSupport(model: string): void {
    const modelConfig = getModelConfig(model);
    
    if (!modelConfig.supportsToolCalling) {
      console.warn(
        `⚠️  Model '${model}' does not natively support tool calling. ` +
        `Tool calls may not work as expected. ` +
        `Consider using one of these models instead: qwen3, qwen2.5:1.5b, llama3.1`
      );
      
      if (modelConfig.notes) {
        console.warn(`   Note: ${modelConfig.notes}`);
      }
    }
  }

  /**
   * Get list of models that support tool calling
   */
  async getToolSupportedModels(): Promise<string[]> {
    const allModels = await this.listModels();
    return allModels.filter(model => modelSupportsTools(model));
  }
}