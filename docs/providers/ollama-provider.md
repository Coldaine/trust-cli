# Ollama Provider Usage Example

This document demonstrates how to use the new Ollama provider with the `ollama:` prefix.

## Quick Setup

1. **Install and start Ollama** (if not already running):
   ```bash
   curl -fsSL https://ollama.ai/install.sh | sh
   ollama serve
   ```

2. **Pull a model** (in another terminal):
   ```bash
   ollama pull qwen2.5:1.5b
   ```

## Usage Examples

### Configuration File

You can now specify Ollama models using the `ollama:` prefix in your Trust CLI configuration:

```json
{
  "model": "ollama:qwen2.5:1.5b",
  "authType": "local"
}
```

### Command Line Examples

```bash
# Use Ollama with Llama 3 model
trust config set model "ollama:llama3"

# Use Ollama with Qwen model
trust config set model "ollama:qwen2.5:1.5b"

# Use Ollama with Phi model
trust config set model "ollama:phi3:3.8b"
```

### Programmatic Usage

```javascript
import { createContentGenerator } from '@trust-cli/trust-cli-core';

// Create content generator with Ollama provider
const generator = await createContentGenerator({
  model: 'ollama:qwen2.5:1.5b',
  authType: undefined, // Let the system auto-detect the provider
});

// Generate content
const response = await generator.generateContent({
  model: 'ollama:qwen2.5:1.5b',
  contents: [
    {
      role: 'user',
      parts: [{ text: 'Hello, world!' }],
    },
  ],
});

console.log(response.candidates[0].content.parts[0].text);
```

## Supported Models

The provider supports any model available in your local Ollama installation. Popular models include:

- `ollama:llama3` - Meta's Llama 3 model
- `ollama:qwen2.5:1.5b` - Qwen 2.5 1.5B model (lightweight)
- `ollama:phi3:3.8b` - Microsoft's Phi-3 model
- `ollama:gemma2:2b` - Google's Gemma 2 model

## Troubleshooting

- **"Ollama is not running"**: Start Ollama with `ollama serve`
- **"Model not found"**: Pull the model with `ollama pull <model-name>`
- **Connection issues**: Ensure Ollama is running on `http://localhost:11434`

## Provider Detection

The system automatically detects the Ollama provider when you use the `ollama:` prefix. If Ollama is not available, it will gracefully fall back to other configured providers.