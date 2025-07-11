/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Default Trust model for local inference
 * Trust: An Open System for Modern Assurance
 */
export const DEFAULT_TRUST_MODEL = 'qwen2.5-1.5b-instruct';

// Re-export performance monitoring types and utilities
export type { SystemMetrics, InferenceMetrics, ResourceUsage } from './performanceMonitor.js';
export { PerformanceMonitor, globalPerformanceMonitor } from './performanceMonitor.js';

/**
 * Trust Model Configuration
 * Part of Trust: An Open System for Modern Assurance
 */
export interface TrustModelConfig {
  name: string;
  path: string;
  type: 'llama' | 'phi' | 'qwen' | 'mistral' | 'gemma' | 'deepseek';
  quantization: 'Q4_K_M' | 'Q8_0' | 'FP16' | 'Q4_0' | 'Q5_K_M';
  contextSize: number;
  ramRequirement: string;
  description: string;
  trustScore?: number; // Community trust rating
  verificationHash?: string; // SHA256 hash for model integrity verification
  expectedSize?: number; // Expected file size in bytes
  parameters?: string; // Model parameter count (e.g., "3B", "7B")
  downloadUrl?: string; // Hugging Face URL for download
}

/**
 * Logit bias configuration for token probability adjustment
 */
export interface LogitBiasConfig {
  // Token ID to bias value mapping (-100 to 100)
  tokenBias?: Record<number, number>;
  // String token to bias value mapping (-100 to 100)
  stringBias?: Record<string, number>;
  // JSON structure enforcement biases
  jsonBias?: {
    // Boost JSON structural tokens: {, }, [, ], ", :, ,
    boostStructural?: boolean;
    // Suppress likely broken tokens that break JSON
    suppressInvalid?: boolean;
    // Boost/suppress specific values
    valueBias?: Record<string, number>;
  };
  // Custom bias rules based on context
  contextualBias?: {
    // Apply different biases in different JSON contexts
    inObject?: Record<string, number>;
    inArray?: Record<string, number>;
    inString?: Record<string, number>;
    inValue?: Record<string, number>;
  };
}

/**
 * Model inference options
 */
export interface GenerationOptions {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  stopTokens?: string[];
  stream?: boolean;
  functions?: Record<string, any>; // Function definitions for GBNF grammar-based calling
  grammar?: any; // JSON schema grammar for structured output
  // Logit bias configuration for precise token control
  logitBias?: LogitBiasConfig;
}

/**
 * Model performance metrics
 */
export interface ModelMetrics {
  tokensPerSecond: number;
  memoryUsage: number;
  responseTime: number;
  lastUsed: Date;
}

/**
 * Trust Model Client Interface
 * Part of Trust: An Open System for Modern Assurance
 */
export interface TrustModelClient {
  generateText(prompt: string, options?: GenerationOptions): Promise<string>;
  generateStream(prompt: string, options?: GenerationOptions): AsyncIterable<string>;
  loadModel(modelPath: string): Promise<void>;
  unloadModel(): Promise<void>;
  createChatSession(): Promise<any>;
  getModelInfo(): TrustModelConfig | null;
  getMetrics(): ModelMetrics;
  isModelLoaded(): boolean;
}

/**
 * Trust Model Manager Interface
 * Part of Trust: An Open System for Modern Assurance
 */
export interface TrustModelManager {
  listAvailableModels(): TrustModelConfig[];
  downloadModel(modelId: string): Promise<void>;
  verifyModel(modelPath: string): Promise<boolean>;
  switchModel(modelName: string): Promise<void>;
  getCurrentModel(): TrustModelConfig | null;
  getTrustRating(modelId: string): Promise<number>;
  getRecommendedModel(task: string, ramLimit?: number): TrustModelConfig | null;
  deleteModel(modelName: string): Promise<void>;
}

/**
 * Privacy Mode Type
 * Part of Trust: An Open System for Modern Assurance
 */
export type PrivacyMode = 'strict' | 'moderate' | 'open';

/**
 * AI Backend Type
 * Part of Trust: An Open System for Modern Assurance
 */
export type AIBackend = 'ollama' | 'huggingface' | 'cloud';

/**
 * Trust Configuration
 * Part of Trust: An Open System for Modern Assurance
 */
export interface TrustConfig {
  privacy: {
    privacyMode: PrivacyMode;
    auditLogging: boolean;
    modelVerification: boolean;
  };
  models: {
    default: string;
    directory: string;
    autoVerify: boolean;
  };
  inference: {
    temperature: number;
    topP: number;
    maxTokens: number;
    stream: boolean;
    threads?: number;
  };
  transparency: {
    logPrompts: boolean;
    logResponses: boolean;
    showModelInfo: boolean;
    showPerformanceMetrics: boolean;
  };
  ai: {
    preferredBackend: AIBackend;
    fallbackOrder: AIBackend[];
    enableFallback: boolean;
    ollama: {
      baseUrl: string;
      defaultModel: string;
      timeout: number;
      keepAlive: string;
      maxToolCalls: number;
      concurrency: number;
      temperature: number;
      numPredict: number;
    };
    huggingface: {
      enabled: boolean;
      gbnfFunctions: boolean;
    };
    cloud: {
      enabled: boolean;
      provider: 'google' | 'openai' | 'anthropic';
    };
  };
}

/**
 * Alias for TrustConfiguration class compatibility
 */
export type TrustConfiguration = any;