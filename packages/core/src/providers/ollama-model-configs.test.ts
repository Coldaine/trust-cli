/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { 
  getModelConfig, 
  modelSupportsTools, 
  getRecommendedToolModels,
  MODEL_CONFIGS 
} from './ollama-model-configs.js';

describe('Ollama Model Configurations', () => {
  describe('getModelConfig', () => {
    it('should return correct config for Qwen models', () => {
      const qwen3Config = getModelConfig('qwen3');
      expect(qwen3Config.supportsToolCalling).toBe(true);
      expect(qwen3Config.supportsStreamingTools).toBe(true);
      expect(qwen3Config.notes).toContain('thinking capabilities');

      const qwen25Config = getModelConfig('qwen2.5');
      expect(qwen25Config.supportsToolCalling).toBe(true);
      expect(qwen25Config.minSizeForTools).toBe(1.5);
    });

    it('should return correct config for Gemma models', () => {
      const gemma3Config = getModelConfig('gemma3');
      expect(gemma3Config.supportsToolCalling).toBe(false);
      expect(gemma3Config.minSizeForTools).toBe(12);
      expect(gemma3Config.toolPromptTemplate).toBeDefined();
      expect(gemma3Config.notes).toContain('No native tool support');
    });

    it('should handle model names with size suffixes', () => {
      const config = getModelConfig('qwen2.5:1.5b');
      expect(config.supportsToolCalling).toBe(true);
      
      const llamaConfig = getModelConfig('llama3.1:7b');
      expect(llamaConfig.supportsToolCalling).toBe(true);
    });

    it('should return default config for unknown models', () => {
      const unknownConfig = getModelConfig('unknown-model');
      expect(unknownConfig.supportsToolCalling).toBe(false);
      expect(unknownConfig.notes).toContain('Unknown model');
    });

    it('should handle partial matches', () => {
      const config = getModelConfig('qwen3-instruct');
      expect(config.supportsToolCalling).toBe(true);
    });
  });

  describe('modelSupportsTools', () => {
    it('should return true for tool-capable models', () => {
      expect(modelSupportsTools('qwen3')).toBe(true);
      expect(modelSupportsTools('qwen2.5')).toBe(true);
      expect(modelSupportsTools('llama3.1')).toBe(true);
      expect(modelSupportsTools('phi3')).toBe(true);
    });

    it('should return false for models without tool support', () => {
      expect(modelSupportsTools('gemma3')).toBe(false);
      expect(modelSupportsTools('gemma2')).toBe(false);
      expect(modelSupportsTools('unknown')).toBe(false);
    });
  });

  describe('getRecommendedToolModels', () => {
    it('should return only models with tool support', () => {
      const recommended = getRecommendedToolModels();
      
      expect(recommended).toContain('qwen3');
      expect(recommended).toContain('qwen2.5');
      expect(recommended).toContain('llama3.1');
      
      expect(recommended).not.toContain('gemma3');
      expect(recommended).not.toContain('gemma2');
      expect(recommended).not.toContain('default');
    });

    it('should not include the default config', () => {
      const recommended = getRecommendedToolModels();
      expect(recommended).not.toContain('default');
    });
  });

  describe('MODEL_CONFIGS', () => {
    it('should have consistent structure for all configs', () => {
      Object.entries(MODEL_CONFIGS).forEach(([name, config]) => {
        expect(config).toHaveProperty('supportsToolCalling');
        expect(config).toHaveProperty('supportsStreamingTools');
        expect(typeof config.supportsToolCalling).toBe('boolean');
        expect(typeof config.supportsStreamingTools).toBe('boolean');
        
        if (config.minSizeForTools !== undefined) {
          expect(typeof config.minSizeForTools).toBe('number');
        }
        
        if (config.toolPromptTemplate !== undefined) {
          expect(typeof config.toolPromptTemplate).toBe('string');
        }
        
        if (config.notes !== undefined) {
          expect(typeof config.notes).toBe('string');
        }
      });
    });
  });
});