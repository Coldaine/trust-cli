/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContentGenerator } from '../core/contentGenerator.js';
import { GenerateContentParameters } from '@google/genai';
import { OllamaProvider } from './ollama.js';

/**
 * Provider factory interface
 */
export interface Provider extends ContentGenerator {
  isAvailable?(): Promise<boolean>;
}

/**
 * Provider factory function type
 */
export type ProviderFactory = (config?: any) => Promise<Provider>;

/**
 * Registry of available providers
 */
const providerRegistry = new Map<string, ProviderFactory>();

/**
 * Register the Ollama provider
 */
providerRegistry.set('ollama', async (config?: any): Promise<Provider> => {
  const provider = new OllamaProvider(config);
  
  // Check if Ollama is available
  const isAvailable = await provider.isAvailable();
  if (!isAvailable) {
    throw new Error('Ollama is not running. Please start Ollama with: ollama serve');
  }

  // Return the provider wrapped with the ContentGenerator interface
  return {
    generateContent: provider.generateContent.bind(provider),
    generateContentStream: async (request: GenerateContentParameters) => {
      return provider.generateContentStream(request);
    },
    countTokens: async (request: any) => {
      // Simple word-based estimation (1 token ≈ 0.75 words)
      const text = JSON.stringify(request.contents);
      const wordCount = text.split(/\s+/).length;
      const estimatedTokens = Math.ceil(wordCount / 0.75);
      return { totalTokens: estimatedTokens };
    },
    embedContent: async () => {
      throw new Error(
        'Embedding is not supported by the Ollama provider. ' +
        'Please use a different provider for embedding operations.'
      );
    },
    isAvailable: provider.isAvailable.bind(provider),
  };
});

/**
 * Extract provider name from model string
 * Supports format: "provider:model" (e.g., "ollama:llama3")
 */
export function extractProvider(model: string): { provider: string; modelName: string } {
  if (!model || typeof model !== 'string') {
    return { provider: 'default', modelName: model || '' };
  }

  const colonIndex = model.indexOf(':');
  if (colonIndex === -1) {
    return { provider: 'default', modelName: model };
  }

  const provider = model.substring(0, colonIndex);
  const modelName = model.substring(colonIndex + 1);

  return { provider, modelName };
}

/**
 * Check if a provider is supported
 */
export function isProviderSupported(providerName: string): boolean {
  return providerRegistry.has(providerName);
}

/**
 * Get a provider instance by name
 */
export async function getProvider(providerName: string, config?: any): Promise<Provider> {
  const factory = providerRegistry.get(providerName);
  if (!factory) {
    throw new Error(`Unsupported provider: ${providerName}`);
  }

  return await factory(config);
}

/**
 * Create a provider from a model string
 * If the model has a provider prefix (e.g., "ollama:llama3"), 
 * creates the appropriate provider. Otherwise returns null.
 */
export async function createProviderFromModel(
  model: string,
  config?: any,
): Promise<Provider | null> {
  const { provider, modelName } = extractProvider(model);
  
  if (provider === 'default' || !isProviderSupported(provider)) {
    return null;
  }

  try {
    const providerInstance = await getProvider(provider, {
      ...config,
      model: modelName,
    });
    return providerInstance;
  } catch (error) {
    console.warn(`Failed to create provider ${provider}:`, error);
    return null;
  }
}

/**
 * List all registered provider names
 */
export function getRegisteredProviders(): string[] {
  return Array.from(providerRegistry.keys());
}

/**
 * Register a new provider factory
 */
export function registerProvider(name: string, factory: ProviderFactory): void {
  providerRegistry.set(name, factory);
}