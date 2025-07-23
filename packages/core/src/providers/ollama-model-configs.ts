/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Model-specific configurations for Ollama providers
 * Handles different tool calling capabilities and formats
 */

export interface ModelConfig {
  /**
   * Whether the model natively supports tool/function calling
   */
  supportsToolCalling: boolean;
  
  /**
   * Minimum model size recommended for effective tool calling (in billions)
   */
  minSizeForTools?: number;
  
  /**
   * Custom prompt template for models without native tool support
   */
  toolPromptTemplate?: string;
  
  /**
   * Whether the model supports streaming tool calls
   */
  supportsStreamingTools: boolean;
  
  /**
   * Additional notes about the model's capabilities
   */
  notes?: string;
}

/**
 * Registry of model-specific configurations
 */
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // Qwen models - excellent tool calling support
  'qwen3': {
    supportsToolCalling: true,
    supportsStreamingTools: true,
    notes: 'Excellent tool calling with built-in thinking capabilities'
  },
  'qwen2.5': {
    supportsToolCalling: true,
    supportsStreamingTools: true,
    minSizeForTools: 1.5, // 0.5b model has limited effectiveness
    notes: 'Good tool calling support, prefer 1.5b or larger'
  },
  
  // Gemma models - limited/no native tool support
  'gemma3': {
    supportsToolCalling: false,
    supportsStreamingTools: false,
    minSizeForTools: 12, // Only 12b and 27b work well with custom implementations
    notes: 'No native tool support; requires custom Modelfile modifications',
    toolPromptTemplate: `You are a helpful assistant. When you need to use a tool, respond with:
TOOL_CALL: {
  "name": "function_name",
  "arguments": { "param": "value" }
}

Available tools:
{{tools}}

User: {{prompt}}`
  },
  'gemma2': {
    supportsToolCalling: false,
    supportsStreamingTools: false,
    notes: 'No native tool support'
  },
  
  // Llama models - good tool support
  'llama3.1': {
    supportsToolCalling: true,
    supportsStreamingTools: true,
    notes: 'Good tool calling support'
  },
  'llama3': {
    supportsToolCalling: true,
    supportsStreamingTools: true,
    notes: 'Basic tool calling support'
  },
  
  // Phi models
  'phi3': {
    supportsToolCalling: true,
    supportsStreamingTools: true,
    minSizeForTools: 3.8,
    notes: 'Adequate tool calling for simple functions'
  },
  
  // Default configuration for unknown models
  'default': {
    supportsToolCalling: false,
    supportsStreamingTools: false,
    notes: 'Unknown model - tool calling may not work'
  }
};

/**
 * Get configuration for a specific model
 */
export function getModelConfig(modelName: string): ModelConfig {
  // Extract base model name (remove size suffix like :1.5b)
  const baseModel = modelName.split(':')[0].toLowerCase();
  
  // Check for exact match first
  if (MODEL_CONFIGS[modelName]) {
    return MODEL_CONFIGS[modelName];
  }
  
  // Check for base model match
  for (const [key, config] of Object.entries(MODEL_CONFIGS)) {
    if (baseModel.includes(key) || key.includes(baseModel)) {
      return config;
    }
  }
  
  // Return default if no match found
  return MODEL_CONFIGS.default;
}

/**
 * Check if a model supports tool calling
 */
export function modelSupportsTools(modelName: string): boolean {
  const config = getModelConfig(modelName);
  return config.supportsToolCalling;
}

/**
 * Get recommended models for tool calling
 */
export function getRecommendedToolModels(): string[] {
  return Object.entries(MODEL_CONFIGS)
    .filter(([name, config]) => 
      config.supportsToolCalling && 
      name !== 'default'
    )
    .map(([name]) => name);
}