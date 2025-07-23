# Ollama Tool Calling Guide

This guide explains how different models handle tool/function calling in the Trust CLI's Ollama provider.

## Model Compatibility

### ✅ Models with Native Tool Support

These models work seamlessly with tool calling:

| Model | Tool Support | Notes |
|-------|--------------|-------|
| **Qwen 3** | Excellent | Best choice - includes thinking capabilities |
| **Qwen 2.5** (≥1.5b) | Good | Use 1.5b or larger; 0.5b has limited effectiveness |
| **Llama 3.1** | Good | Reliable tool calling |
| **Llama 3** | Basic | Works for simple tools |
| **Phi 3** (≥3.8b) | Adequate | Good for simple functions |

### ❌ Models WITHOUT Native Tool Support

These models will show a warning when used with tools:

| Model | Tool Support | Alternative |
|-------|--------------|-------------|
| **Gemma 3** | None | Requires custom Modelfile; only 12b/27b work well |
| **Gemma 2** | None | Use Qwen or Llama models instead |

## Usage Examples

### Basic Tool Calling

```javascript
// This will work well with Qwen 3
const response = await generator.generateContent({
  model: 'ollama:qwen3',
  contents: [{
    role: 'user',
    parts: [{ text: 'What is the weather in Paris?' }]
  }],
  tools: [{
    name: 'get_weather',
    description: 'Get weather for a location',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string' }
      }
    }
  }]
});
```

### Checking Model Compatibility

```javascript
import { OllamaProvider } from '@trust-cli/trust-cli-core';

const provider = new OllamaProvider();

// List all models that support tools
const toolModels = await provider.getToolSupportedModels();
console.log('Models with tool support:', toolModels);
```

## Warning Messages

When using a model without tool support, you'll see:

```
⚠️  Model 'gemma3' does not natively support tool calling. Tool calls may not work as expected. Consider using one of these models instead: qwen3, qwen2.5:1.5b, llama3.1
   Note: No native tool support; requires custom Modelfile modifications
```

## Best Practices

1. **Model Selection**: 
   - For complex tool calling: Use **Qwen 3**
   - For basic tool calling: **Qwen 2.5:1.5b** or **Llama 3.1**
   - Avoid Gemma models for tool-heavy workflows

2. **Size Matters**:
   - Qwen 2.5: Use 1.5b or larger
   - Phi 3: Use 3.8b or larger
   - Gemma 3: Would need 12b or larger (with custom setup)

3. **Testing**: Always test your tool calls with your chosen model:
   ```bash
   # Test with a simple tool call
   trust config set model "ollama:qwen3"
   trust "What's the weather in London?" --tools weather
   ```

4. **Fallback Strategy**: If you must use a non-tool model, consider:
   - Implementing structured prompts instead of tools
   - Using a different provider for tool-heavy tasks
   - Switching to a tool-capable model

## Tool Response Formats

The Ollama provider handles standard OpenAI-compatible tool formats:

```json
{
  "tool_calls": [{
    "id": "call_123",
    "type": "function",
    "function": {
      "name": "get_weather",
      "arguments": "{\"location\": \"Paris\"}"
    }
  }]
}
```

## Troubleshooting

### Tools Not Working?

1. Check your model supports tools:
   ```bash
   ollama list  # See installed models
   ```

2. Switch to a compatible model:
   ```bash
   ollama pull qwen3
   trust config set model "ollama:qwen3"
   ```

3. Verify Ollama is running:
   ```bash
   curl http://localhost:11434/api/version
   ```

### Performance Issues?

- Larger models (≥7B) generally handle tools better
- Ensure adequate RAM for your chosen model
- Consider using Qwen models for best performance

## Future Improvements

We're working on:
- Custom prompt templates for non-native models
- Automatic model selection based on capabilities
- Enhanced Gemma support through prompt engineering