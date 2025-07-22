## Comprehensive PR Review

Thank you for implementing the Ollama provider! This is a great start, but there are several important items that need to be completed before this PR is ready to merge.

### 🚨 **Missing: Modular Tool Calling Implementation**

The original task included implementing modular tool calling support for the Ollama provider, but this appears to be missing from the current PR. This is a critical feature that needs to be added:

1. **Tool Call Support in OllamaMessage Interface**:
   - The `tool_calls` field is currently typed as `any[]` and appears unused
   - Need to implement proper tool call handling in the request/response cycle

2. **Required Implementation**:
   ```typescript
   // In ollama.ts, add proper tool call types:
   interface OllamaToolCall {
     id: string;
     type: 'function';
     function: {
       name: string;
       arguments: string;
     };
   }

   interface OllamaToolResponse {
     tool_call_id: string;
     content: string;
   }

   // Modify convertToOllamaMessages to handle tool calls:
   private convertToOllamaMessages(contents: any[]): OllamaMessage[] {
     return contents.map(content => {
       const message: OllamaMessage = {
         role: content.role === 'model' ? 'assistant' : content.role,
         content: this.extractTextFromParts(content.parts || []),
       };

       // Handle function calls in parts
       const functionCalls = content.parts?.filter(part => part.functionCall);
       if (functionCalls?.length > 0) {
         message.tool_calls = functionCalls.map(fc => ({
           id: fc.functionCall.id || generateId(),
           type: 'function',
           function: {
             name: fc.functionCall.name,
             arguments: JSON.stringify(fc.functionCall.args),
           },
         }));
       }

       // Handle function responses
       const functionResponse = content.parts?.find(part => part.functionResponse);
       if (functionResponse) {
         message.tool_call_id = functionResponse.functionResponse.name;
         message.content = JSON.stringify(functionResponse.functionResponse.response);
       }

       return message;
     });
   }

   // Modify convertToGeminiResponse to handle tool calls:
   private convertToGeminiResponse(ollamaResponse: OllamaResponse): GenerateContentResponse {
     const parts: Part[] = [];
     
     if (ollamaResponse.message.content) {
       parts.push({ text: ollamaResponse.message.content });
     }

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
       candidates: [{
         content: {
           parts,
           role: 'model',
         },
         finishReason: ollamaResponse.done ? FinishReason.STOP : FinishReason.OTHER,
         index: 0,
       }],
       usageMetadata: {
         promptTokenCount: 0,
         candidatesTokenCount: 0,
         totalTokenCount: 0,
       },
     } as GenerateContentResponse;
   }
   ```

### 🔧 **Required Code Fixes**

1. **Token Counting** (packages/core/src/providers/index.ts:46):
   ```typescript
   // Instead of returning 0, implement basic estimation:
   countTokens: async (request: CountTokensParameters) => {
     // Simple word-based estimation (1 token ≈ 0.75 words)
     const text = JSON.stringify(request.contents);
     const wordCount = text.split(/\s+/).length;
     const estimatedTokens = Math.ceil(wordCount / 0.75);
     return { totalTokens: estimatedTokens };
   },
   ```

2. **Streaming Error Handling** (packages/core/src/providers/ollama.ts:195-203):
   ```typescript
   try {
     const chunk = JSON.parse(line);
     yield chunk;
   } catch (parseError) {
     console.warn(`[Ollama] Failed to parse streaming response: ${line.substring(0, 100)}...`);
     // Don't silently continue - track consecutive errors
     if (++consecutiveErrors > 5) {
       throw new Error('Too many consecutive JSON parse errors in stream');
     }
     continue;
   }
   ```

3. **Buffer Overflow Protection** (packages/core/src/providers/ollama.ts:183):
   ```typescript
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
       // ... rest of implementation
     }
   }
   ```

4. **Configuration Enhancement** (packages/core/src/providers/ollama.ts:46-49):
   ```typescript
   constructor(config: Partial<OllamaConfig> = {}) {
     this.endpoint = config.endpoint || 
       process.env.OLLAMA_ENDPOINT || 
       process.env.OLLAMA_HOST || // Support common env var
       'http://localhost:11434';
     
     this.defaultModel = config.model || 
       process.env.OLLAMA_MODEL || 
       'qwen2.5:1.5b';
     
     // Add timeout configuration
     this.timeout = config.timeout || 
       parseInt(process.env.OLLAMA_TIMEOUT || '30000', 10);
   }
   ```

5. **Embed Content Error** (packages/core/src/providers/index.ts:47):
   ```typescript
   embedContent: async (request: EmbedContentParameters) => {
     throw new Error(
       'Embedding is not supported by the Ollama provider. ' +
       'Please use a different provider for embedding operations.'
     );
   },
   ```

6. **Retry Logic Implementation**:
   ```typescript
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
         if (error instanceof Response && error.status >= 400 && error.status < 500) {
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

   // Update callOllamaAPI to use retry logic:
   private async callOllamaAPI(
     model: string,
     messages: OllamaMessage[],
     stream: boolean,
   ): Promise<OllamaResponse> {
     return this.callOllamaAPIWithRetry(async () => {
       const response = await fetch(`${this.endpoint}/api/chat`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ model, messages, stream }),
         signal: AbortSignal.timeout(this.timeout),
       });

       if (!response.ok) {
         const errorText = await response.text().catch(() => response.statusText);
         throw new Error(`HTTP ${response.status}: ${errorText}`);
       }

       return await response.json();
     });
   }
   ```

### 📝 **Additional Tests Needed**

Add tests for the modular tool calling functionality:

```typescript
describe('tool calling support', () => {
  it('should handle function calls in requests', async () => {
    const request = {
      model: 'ollama:llama3',
      contents: [{
        role: 'model',
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

    // Test implementation...
  });
});
```

### 📋 **Summary of Required Changes**

1. **Implement modular tool calling support** - This is the main missing feature
2. **Fix all type safety issues** - Replace `any` types with proper interfaces
3. **Add proper error handling** - Including retry logic and better error messages
4. **Implement token counting** - Even if it's just an estimation
5. **Add buffer overflow protection** - Prevent memory exhaustion
6. **Support environment variables** - For better configuration flexibility
7. **Fix the embedContent stub** - Throw proper errors instead of returning invalid data
8. **Add comprehensive tests** - Especially for tool calling functionality

Please implement these changes and update the PR. The Ollama provider is a great addition to Trust CLI, but we need to ensure it's robust and feature-complete before merging.