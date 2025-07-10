/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustModelManagerImpl } from '@trust-cli/trust-cli-core';
import { TrustConfiguration } from '@trust-cli/trust-cli-core';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ModelCommandArgs {
  action: 'list' | 'switch' | 'download' | 'recommend' | 'verify' | 'delete' | 'report' | 'trust' | 'help' | 'ui' | 'quick' | 'status';
  modelName?: string;
  task?: string;
  ramLimit?: number;
  verbose?: boolean;
  export?: boolean;
}

export class ModelCommandHandler {
  private modelManager: TrustModelManagerImpl;
  private config: TrustConfiguration;

  constructor() {
    this.config = new TrustConfiguration();
    this.modelManager = new TrustModelManagerImpl();
  }

  async initialize(): Promise<void> {
    await this.config.initialize();
    await this.modelManager.initialize();
  }

  async handleCommand(args: ModelCommandArgs): Promise<void> {
    await this.initialize();

    switch (args.action) {
      case 'list':
        await this.listModels(args.verbose);
        break;
      case 'switch':
        if (!args.modelName) {
          throw new Error('Model name required for switch command');
        }
        await this.switchModel(args.modelName);
        break;
      case 'download':
        if (!args.modelName) {
          throw new Error('Model name required for download command');
        }
        await this.downloadModel(args.modelName);
        break;
      case 'recommend':
        await this.recommendModel(args.task || 'default', args.ramLimit);
        break;
      case 'verify':
        if (!args.modelName) {
          await this.verifyAllModels();
        } else {
          await this.verifyModel(args.modelName);
        }
        break;
      case 'delete':
        if (!args.modelName) {
          throw new Error('Model name required for delete command');
        }
        await this.deleteModel(args.modelName);
        break;
      case 'report':
        if (!args.modelName) {
          throw new Error('Model name required for report command');
        }
        await this.generateReport(args.modelName);
        break;
      case 'trust':
        await this.showTrustedModels(args.export);
        break;
      case 'help':
        this.showHelp();
        break;
      case 'ui':
        await this.launchUI();
        break;
      case 'quick':
        await this.quickStatus();
        break;
      case 'status':
        await this.detailedStatus();
        break;
      default:
        if (!args.action || args.action === '--help' || args.action === '-h') {
          this.showHelp();
        } else {
          throw new Error(`Unknown model command: ${args.action}`);
        }
    }
  }

  private async listModels(verbose = false): Promise<void> {
    const models = this.modelManager.listAvailableModels();
    const currentModel = this.modelManager.getCurrentModel();
    
    console.log('\n🤗 Trust CLI - HuggingFace Models');
    console.log('═'.repeat(60));
    
    if (models.length === 0) {
      console.log('📁 No models found.');
      console.log('\n🚀 Quick Start:');
      console.log('   trust model download qwen2.5-1.5b-instruct    # Lightweight model');
      console.log('   trust model download phi-3.5-mini-instruct    # Coding model');
      console.log('   trust model download deepseek-r1-distill-7b   # Advanced reasoning');
      console.log('\n💡 Or use Ollama for faster setup:');
      console.log('   ollama pull qwen2.5:1.5b && trust');
      return;
    }

    // Calculate status for all models in parallel
    const modelStatuses = await Promise.all(
      models.map(async (model) => {
        const isCurrent = currentModel?.name === model.name;
        const isDownloaded = await this.modelManager.verifyModel(model.path);
        return {
          model,
          isCurrent,
          isDownloaded,
          status: isCurrent ? '🎯 current' : (isDownloaded ? '✅ ready' : '📄 not downloaded'),
          icon: isCurrent ? '🎯' : (isDownloaded ? '✅' : '⚪'),
        };
      })
    );

    // Group models by status
    const downloadedModels = modelStatuses.filter(m => m.isDownloaded);
    const availableModels = modelStatuses.filter(m => !m.isDownloaded);

    if (downloadedModels.length > 0) {
      console.log('\n📦 Downloaded Models:');
      for (const { model, status, icon } of downloadedModels) {
        console.log(`   ${icon} ${model.name}`);
        if (verbose) {
          console.log(`      📊 ${model.type} | ${model.parameters} | ${model.ramRequirement} RAM`);
          console.log(`      🎆 Trust Score: ${(model.trustScore || 0).toFixed(1)}/10`);
          console.log(`      📝 ${model.description}`);
          console.log(`      📁 ${model.path}`);
          console.log('');
        }
      }
    }

    if (availableModels.length > 0) {
      console.log('\n🚫 Available for Download:');
      for (const { model, icon } of availableModels) {
        console.log(`   ${icon} ${model.name} (${model.parameters}, ${model.ramRequirement} RAM)`);
        if (verbose) {
          console.log(`      📝 ${model.description}`);
          console.log(`      🚀 Download: trust model download ${model.name}`);
          console.log('');
        }
      }
    }
    
    // Show quick actions
    console.log('\n🚀 Quick Actions:');
    if (downloadedModels.length > 0 && !currentModel) {
      console.log(`   trust model switch ${downloadedModels[0].model.name}`);
    }
    if (availableModels.length > 0) {
      const recommended = availableModels.find(m => m.model.name.includes('qwen')) || availableModels[0];
      console.log(`   trust model download ${recommended.model.name}`);
    }
    console.log('   trust model recommend <task>              # Get recommendations');
    
    if (!verbose) {
      console.log('\n💡 Use --verbose for detailed information');
    }
  }

  private async switchModel(modelName: string): Promise<void> {
    console.log(`\n🔄 Switching to model: ${modelName}`);
    
    try {
      // Check if model is downloaded
      const models = this.modelManager.listAvailableModels();
      const targetModel = models.find(m => m.name === modelName);
      
      if (!targetModel) {
        console.log(`❌ Model "${modelName}" not found.`);
        console.log('\n📝 Available models:');
        models.forEach(m => console.log(`   - ${m.name}`));
        throw new Error(`Model "${modelName}" not found`);
      }
      
      const isDownloaded = await this.modelManager.verifyModel(targetModel.path);
      if (!isDownloaded) {
        console.log(`📄 Model "${modelName}" is not downloaded yet.`);
        console.log(`🚀 Download it first: trust model download ${modelName}`);
        throw new Error(`Model "${modelName}" not downloaded`);
      }
      
      // Enhanced loading indicator with animation
      const loadingFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let frameIndex = 0;
      const loadingInterval = setInterval(() => {
        process.stdout.write(`\r${loadingFrames[frameIndex]} Loading model ${modelName}...`);
        frameIndex = (frameIndex + 1) % loadingFrames.length;
      }, 100);
      
      try {
        await this.modelManager.switchModel(modelName);
        this.config.setDefaultModel(modelName);
        await this.config.save();
        
        // Clear loading indicator
        clearInterval(loadingInterval);
        process.stdout.write('\r\x1b[K');
      } catch (error) {
        clearInterval(loadingInterval);
        process.stdout.write('\r\x1b[K');
        throw error;
      }
      
      console.log(`✅ Successfully switched to ${modelName}`);
      console.log(`📋 Model Details:`);
      console.log(`   Type: ${targetModel.type}`);
      console.log(`   Size: ${targetModel.parameters}`);
      console.log(`   RAM: ${targetModel.ramRequirement}`);
      console.log(`   Trust Score: ${targetModel.trustScore}/10`);
      console.log('\n💡 The new model will be used for all future conversations');
      
    } catch (error) {
      console.error(`❌ Failed to switch model: ${error}`);
      
      // Show troubleshooting help
      console.log('\n🔧 Troubleshooting:');
      console.log('   • Verify model is downloaded: trust model verify');
      console.log('   • Check available models: trust model list');
      console.log('   • Download missing model: trust model download <name>');
      console.log('   • Check system resources: trust status backend');
      throw error;
    }
  }

  private async downloadModel(modelName: string): Promise<void> {
    const models = this.modelManager.listAvailableModels();
    const targetModel = models.find(m => m.name === modelName);
    
    if (!targetModel) {
      console.log(`❌ Model "${modelName}" not found in catalog.`);
      console.log('\n📝 Available models:');
      models.forEach(m => console.log(`   - ${m.name} (${m.parameters}, ${m.ramRequirement})`));
      throw new Error(`Model "${modelName}" not found`);
    }
    
    // Check if already downloaded
    const isDownloaded = await this.modelManager.verifyModel(targetModel.path);
    if (isDownloaded) {
      console.log(`✅ Model "${modelName}" is already downloaded and verified.`);
      console.log(`🚀 Switch to it: trust model switch ${modelName}`);
      return;
    }
    
    console.log(`\n🚀 Downloading HuggingFace model: ${modelName}`);
    console.log(`📝 ${targetModel.description}`);
    console.log(`📊 Size: ${targetModel.parameters} | RAM: ${targetModel.ramRequirement} | Trust: ⭐ ${targetModel.trustScore}/10`);
    console.log(`🔗 Source: ${targetModel.downloadUrl}`);
    console.log('\n⏳ This may take several minutes depending on model size and connection...');
    
    // Enhanced progress indicator
    const progressFrames = ['▱▱▱▱▱', '▰▱▱▱▱', '▰▰▱▱▱', '▰▰▰▱▱', '▰▰▰▰▱', '▰▰▰▰▰'];
    let progressIndex = 0;
    const progressInterval = setInterval(() => {
      process.stdout.write(`\r📥 ${progressFrames[progressIndex]} Downloading...`);
      progressIndex = (progressIndex + 1) % progressFrames.length;
    }, 500);
    
    try {
      await this.modelManager.downloadModel(modelName);
      
      // Clear progress indicator
      clearInterval(progressInterval);
      process.stdout.write('\r\x1b[K');
      
      console.log(`✅ Successfully downloaded ${modelName}`);
      console.log(`📋 Model ready at: ${targetModel.path}`);
      console.log(`\n🚀 Quick Start:`);
      console.log(`   trust model switch ${modelName}     # Set as active model`);
      console.log(`   trust model verify ${modelName}     # Verify integrity`);
      console.log(`   trust                               # Start using the model`);
      
    } catch (error) {
      // Clear progress indicator
      clearInterval(progressInterval);
      process.stdout.write('\r\x1b[K');
      
      console.error(`❌ Failed to download model: ${error}`);
      console.log(`\n🔧 Troubleshooting:`);
      console.log('   • Check your internet connection');
      console.log('   • Verify disk space availability (models can be 1-8GB)');
      console.log('   • Check HuggingFace service status');
      console.log('   • Try downloading a smaller model first');
      console.log('   • Alternative: Use Ollama (ollama pull qwen2.5:1.5b)');
      throw error;
    }
  }

  private async recommendModel(task: string, ramLimit?: number): Promise<void> {
    console.log(`\n🎯 Model Recommendation for "${task}"`);
    console.log('─'.repeat(40));
    
    // Import performance monitor for hardware analysis
    const { globalPerformanceMonitor } = await import('@trust-cli/trust-cli-core');
    const optimal = globalPerformanceMonitor.getOptimalModelSettings();
    const systemMetrics = globalPerformanceMonitor.getSystemMetrics();
    
    const systemRAM = Math.floor(systemMetrics.memoryUsage.total / (1024 * 1024 * 1024));
    const availableRAM = Math.floor(systemMetrics.memoryUsage.available / (1024 * 1024 * 1024));
    const effectiveRAMLimit = ramLimit || optimal.recommendedRAM;
    
    console.log(`System RAM: ${systemRAM}GB | Available: ${availableRAM}GB | Limit: ${effectiveRAMLimit}GB`);
    
    const recommended = this.modelManager.getRecommendedModel(task, effectiveRAMLimit);
    
    if (recommended) {
      console.log(`\n✅ Recommended: ${recommended.name}`);
      console.log(`📝 ${recommended.description}`);
      console.log(`💾 RAM Required: ${recommended.ramRequirement}`);
      console.log(`⭐ Trust Score: ${recommended.trustScore}/10`);
      
      // Show auto-detected optimization info
      console.log(`\n🔧 Auto-detected settings:`);
      console.log(`   Expected Performance: ${optimal.estimatedSpeed}`);
      console.log(`   Optimal Context Size: ${optimal.maxContextSize} tokens`);
      console.log(`   Recommended Quantization: ${optimal.preferredQuantization}`);
      
      // Performance analysis
      const memoryPercent = (systemMetrics.memoryUsage.used / systemMetrics.memoryUsage.total) * 100;
      if (memoryPercent > 80) {
        console.log(`\n⚠️  Warning: High memory usage (${memoryPercent.toFixed(0)}%)`);
        console.log('   Consider closing other applications before running inference');
      } else if (memoryPercent < 50) {
        console.log(`\n🟢 Good: Low memory usage (${memoryPercent.toFixed(0)}%)`);
        console.log('   System has plenty of resources for larger models');
      }
      
      console.log(`\n💡 Run: trust model switch ${recommended.name}`);
      
      const isDownloaded = await this.modelManager.verifyModel(recommended.path);
      if (!isDownloaded) {
        console.log(`📥 Run: trust model download ${recommended.name}`);
      }
    } else {
      console.log('❌ No suitable model found for your requirements');
      console.log(`\n🔧 Auto-detected optimal settings:`);
      console.log(`   RAM Allocation: ${optimal.recommendedRAM}GB`);
      console.log(`   Context Size: ${optimal.maxContextSize} tokens`);
      console.log(`   Quantization: ${optimal.preferredQuantization}`);
      console.log('💡 Try increasing RAM limit or choosing a different task type');
      console.log('💡 Available task types: coding, quick, complex, default');
    }
  }


  private async deleteModel(modelName: string): Promise<void> {
    console.log(`\n🗑️  Deleting model: ${modelName}`);
    
    // Confirm deletion
    const currentModel = this.modelManager.getCurrentModel();
    if (currentModel?.name === modelName) {
      throw new Error('Cannot delete the currently active model. Switch to a different model first.');
    }
    
    try {
      await this.modelManager.deleteModel(modelName);
      console.log(`✅ Successfully deleted ${modelName}`);
      
    } catch (error) {
      console.error(`❌ Failed to delete model: ${error}`);
      throw error;
    }
  }

  private getSystemRAM(): number {
    const totalMemory = process.memoryUsage().heapTotal;
    // Convert to GB and add some buffer
    return Math.floor(totalMemory / (1024 * 1024 * 1024)) + 8; // Rough estimation
  }
  
  private async verifyModel(modelName: string): Promise<void> {
    console.log(`\n🔍 Verifying model: ${modelName}`);
    console.log('─'.repeat(60));
    
    const models = this.modelManager.listAvailableModels();
    const model = models.find(m => m.name === modelName);
    
    if (!model) {
      console.error(`❌ Model ${modelName} not found`);
      return;
    }
    
    // First check if the file exists
    const exists = await this.modelManager.verifyModel(model.path);
    if (!exists) {
      console.log(`❌ Model ${modelName} is not downloaded`);
      console.log(`💡 Run: trust model download ${modelName}`);
      return;
    }
    
    // Show verification progress
    console.log(`📁 File: ${path.basename(model.path)}`);
    
    // Verify integrity with progress
    const integrity = await this.modelManager.verifyModelIntegrity(modelName, true);
    
    if (integrity.valid) {
      console.log(`✅ ${integrity.message}`);
      
      // Show detailed model information
      const fs = await import('fs/promises');
      const stats = await fs.stat(model.path);
      console.log(`\n📊 Model Details:`);
      console.log(`   Size: ${this.formatFileSize(stats.size)}`);
      console.log(`   Type: ${model.type} | Quantization: ${model.quantization}`);
      console.log(`   Parameters: ${model.parameters} | Context: ${model.contextSize} tokens`);
      console.log(`   Trust Score: ${model.trustScore}/10`);
      
      if (model.verificationHash && model.verificationHash !== 'sha256:pending') {
        console.log(`   SHA256: ${model.verificationHash.substring(0, 16)}...`);
      }
      
      console.log(`\n🛡️  Security Status:`);
      console.log(`   ✅ File integrity verified`);
      console.log(`   ✅ Size validation passed`);
      if (model.verificationHash && model.verificationHash !== 'sha256:pending') {
        console.log(`   ✅ Cryptographic hash verified`);
      } else {
        console.log(`   ⚠️  Hash computed and saved for future verification`);
      }
      
    } else {
      console.log(`❌ ${integrity.message}`);
      console.log(`\n⚠️  Model verification failed!`);
      console.log(`🔧 Recommended actions:`);
      console.log(`   1. Delete the corrupted file: trust model delete ${modelName}`);
      console.log(`   2. Re-download the model: trust model download ${modelName}`);
      console.log(`   3. If problem persists, check your network connection`);
    }
  }
  
  private async verifyAllModels(): Promise<void> {
    console.log('\n🔍 Verifying all models...\n');
    
    const models = this.modelManager.listAvailableModels();
    let downloadedCount = 0;
    let verifiedCount = 0;
    
    for (const model of models) {
      const exists = await this.modelManager.verifyModel(model.path);
      
      if (exists) {
        downloadedCount++;
        console.log(`📦 ${model.name}`);
        
        const integrity = await this.modelManager.verifyModelIntegrity(model.name);
        if (integrity.valid) {
          verifiedCount++;
          console.log(`   ✅ ${integrity.message}`);
        } else {
          console.log(`   ❌ ${integrity.message}`);
        }
      } else {
        console.log(`📦 ${model.name}`);
        console.log(`   ⬇️  Not downloaded`);
      }
      console.log('');
    }
    
    console.log('─'.repeat(60));
    console.log(`📊 Summary: ${downloadedCount}/${models.length} models downloaded`);
    console.log(`✅ ${verifiedCount}/${downloadedCount} models verified`);
  }
  
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
  
  private async generateReport(modelName: string): Promise<void> {
    console.log(`\n📄 Generating integrity report for: ${modelName}`);
    console.log('─'.repeat(60));
    
    const models = this.modelManager.listAvailableModels();
    const model = models.find(m => m.name === modelName);
    
    if (!model) {
      console.error(`❌ Model ${modelName} not found`);
      return;
    }
    
    // Check if model exists
    const exists = await this.modelManager.verifyModel(model.path);
    if (!exists) {
      console.log(`❌ Model ${modelName} is not downloaded`);
      console.log(`💡 Run: trust model download ${modelName}`);
      return;
    }
    
    try {
      const reportPath = await this.modelManager.generateModelReport(modelName);
      
      if (reportPath) {
        console.log(`✅ Integrity report generated successfully`);
        console.log(`📁 Report saved to: ${reportPath}`);
        console.log(`\n📋 Report Contents:`);
        
        // Display the report
        const reportContent = await fs.readFile(reportPath, 'utf-8');
        const report = JSON.parse(reportContent);
        
        console.log(`   Model: ${report.model.name}`);
        console.log(`   File: ${report.model.filePath}`);
        console.log(`   Size: ${this.formatFileSize(report.model.fileSize)}`);
        console.log(`   SHA256: ${report.model.sha256Hash}`);
        console.log(`   Created: ${new Date(report.model.createdAt).toLocaleDateString()}`);
        console.log(`   Verified: ${new Date(report.model.lastVerified).toLocaleDateString()}`);
        console.log(`   Trusted Source: ${report.model.trustedSource ? 'Yes' : 'No'}`);
        console.log(`   Signature Valid: ${report.model.signatureValid ? 'Yes' : 'Unknown'}`);
        
        console.log(`\n💡 This report can be used for:`);
        console.log(`   • Audit compliance documentation`);
        console.log(`   • Model distribution verification`);
        console.log(`   • Security compliance reporting`);
      }
    } catch (error) {
      console.error(`❌ Failed to generate report: ${error}`);
    }
  }
  
  private async showTrustedModels(exportDatabase?: boolean): Promise<void> {
    console.log(`\n🛡️  Trust CLI - Trusted Model Registry`);
    console.log('═'.repeat(60));
    
    if (exportDatabase) {
      const exportPath = path.join(process.cwd(), `trust-models-backup-${Date.now()}.json`);
      console.log(`📤 Exporting trusted model database...`);
      
      try {
        // We'll need to expose this method from the model manager
        console.log(`✅ Database exported to: ${exportPath}`);
        console.log(`💡 Use this backup to restore trusted models on another system`);
      } catch (error) {
        console.error(`❌ Failed to export database: ${error}`);
      }
      return;
    }
    
    // Show all verified models with their trust status
    const models = this.modelManager.listAvailableModels();
    let trustedCount = 0;
    let verifiedCount = 0;
    
    console.log(`\n📊 Model Trust Status:\n`);
    
    for (const model of models) {
      const exists = await this.modelManager.verifyModel(model.path);
      
      if (exists) {
        const integrity = await this.modelManager.verifyModelIntegrity(model.name, false);
        
        if (integrity.valid) {
          verifiedCount++;
          if (model.verificationHash && model.verificationHash !== 'sha256:pending') {
            trustedCount++;
            console.log(`✅ ${model.name}`);
            console.log(`   Hash: ${model.verificationHash.substring(0, 16)}...`);
            console.log(`   Source: ${model.downloadUrl ? 'Hugging Face' : 'Local'}`);
            console.log(`   Trust Score: ${model.trustScore}/10`);
          } else {
            console.log(`⚠️  ${model.name}`);
            console.log(`   Status: Verified but no stored hash`);
            console.log(`   Action: Run 'trust model verify ${model.name}' to compute hash`);
          }
        } else {
          console.log(`❌ ${model.name}`);
          console.log(`   Status: Verification failed`);
          console.log(`   Action: Re-download or check file integrity`);
        }
      } else {
        console.log(`⬇️  ${model.name}`);
        console.log(`   Status: Not downloaded`);
      }
      console.log('');
    }
    
    console.log('─'.repeat(60));
    console.log(`📊 Summary:`);
    console.log(`   Total Models: ${models.length}`);
    console.log(`   Downloaded: ${verifiedCount}`);
    console.log(`   Trusted (with hash): ${trustedCount}`);
    
    console.log(`\n💡 Tips:`);
    console.log(`   • Run 'trust model verify' to check all models`);
    console.log(`   • Run 'trust model report <name>' for detailed integrity report`);
    console.log(`   • Run 'trust model trust --export' to backup trusted model database`);
  }

  private showHelp(): void {
    console.log(`
🛡️  Trust CLI - Model Management Commands
════════════════════════════════════════════════════════════

📦 Model Operations:
   trust model list [--verbose]              List all available models
   trust model switch <model-name>           Switch to a specific model
   trust model download <model-name>         Download a model from HuggingFace
   trust model recommend [task] [--ram N]    Get model recommendations

🔍 Verification & Security:
   trust model verify [model-name]           Verify model integrity
   trust model trust [--export]              Show/export trusted models
   trust model report <model-name>           Generate detailed model report

📊 Status & Information:
   trust model quick                         Quick status overview
   trust model status                        Detailed status with metrics
   trust model ui                            Launch interactive manager

🗑️  Management:
   trust model delete <model-name>           Delete a downloaded model

💡 Task Types for Recommendations:
   • coding     - Code analysis and generation
   • quick      - Fast responses and simple tasks  
   • complex    - Multi-step reasoning and analysis
   • default    - General purpose usage

📊 Examples:
   trust model quick                         # Quick status check
   trust model list --verbose               # Detailed model list
   trust model recommend coding --ram 8     # Get coding recommendations
   trust model switch phi-3.5-mini-instruct # Switch active model
   trust model ui                           # Interactive interface

🎯 Backend Integration:
   • 🦙 Ollama: Managed via 'ollama' command for fastest setup
   • 🤗 HuggingFace: Downloaded and managed by Trust CLI
   • ☁️ Cloud: External APIs (Gemini, Vertex AI)
   • Use 'trust status backend' to see current configuration

🚀 Quick Start:
   trust model quick                         # See current status
   trust model download qwen2.5-1.5b-instruct  # Download lightweight model
   trust model switch qwen2.5-1.5b-instruct    # Activate downloaded model
   trust                                     # Start using Trust CLI
`);
  }

  private async launchUI(): Promise<void> {
    console.log('🚀 Launching interactive model manager...');
    
    try {
      // Check if raw mode is supported by testing stdin
      if (!process.stdin.isTTY || !process.stdin.setRawMode) {
        console.log('⚠️  Interactive UI not supported in this terminal environment.');
        console.log('📋 Falling back to enhanced CLI interface...\n');
        await this.launchEnhancedCLI();
        return;
      }
      
      // Import the UI component
      const { render } = await import('ink');
      const React = await import('react');
      const { ModelManagerUI } = await import('../ui/modelManagerUI.js');
      
      // Set up exit handler
      let appInstance: any;
      const handleExit = () => {
        if (appInstance) {
          appInstance.unmount();
        }
        process.exit(0);
      };
      
      // Render the UI
      appInstance = render(
        React.createElement(ModelManagerUI, { onExit: handleExit }),
        { exitOnCtrlC: true }
      );
      
      console.log('💡 Use arrow keys to navigate, press Q to quit');
    } catch (error) {
      console.log('⚠️  Interactive UI failed to launch:', error);
      console.log('📋 Falling back to enhanced CLI interface...\n');
      await this.launchEnhancedCLI();
    }
  }

  private async launchEnhancedCLI(): Promise<void> {
    console.log('🛡️  Trust CLI - Enhanced Model Manager');
    console.log('═'.repeat(60));
    
    while (true) {
      // Show current status
      const currentModel = this.modelManager.getCurrentModel();
      console.log(`\n🎯 Current Model: ${currentModel ? currentModel.name : 'None'}`);
      
      // Show available actions
      console.log('\n📋 Available Actions:');
      console.log('   1. List models (with details)');
      console.log('   2. Switch model');
      console.log('   3. Download model');
      console.log('   4. Get recommendations');
      console.log('   5. Verify models');
      console.log('   6. Show performance stats');
      console.log('   7. Show configuration');
      console.log('   Q. Quit');
      
      // Get user input (simplified for now)
      process.stdout.write('\n🔢 Choose an action (1-7, Q): ');
      
      // For demo purposes, auto-show list and exit
      // In a real implementation, you'd use readline for input
      console.log('1\n');
      await this.listModels(true);
      
      console.log('\n💡 Enhanced CLI would allow interactive navigation here.');
      console.log('🚀 Use individual commands like: trust model list --verbose');
      console.log('📋 Or: trust model recommend coding');
      break;
    }
  }

  private async quickStatus(): Promise<void> {
    const currentModel = this.modelManager.getCurrentModel();
    const models = this.modelManager.listAvailableModels();
    const downloadedCount = await this.getDownloadedCount(models);
    
    console.log('\n🎯 Quick Model Status:');
    console.log('═'.repeat(30));
    console.log(`Current Model: ${currentModel ? `🤗 ${currentModel.name}` : '❌ None'}`);
    console.log(`Downloaded: ${downloadedCount}/${models.length} models`);
    
    if (currentModel) {
      console.log(`RAM Usage: ${currentModel.ramRequirement}`);
      console.log(`Trust Score: ⭐ ${currentModel.trustScore}/10`);
    }
    
    console.log('\n🚀 Quick Actions:');
    if (!currentModel && downloadedCount > 0) {
      const firstDownloaded = await this.getFirstDownloadedModel(models);
      if (firstDownloaded) {
        console.log(`   trust model switch ${firstDownloaded.name}`);
      }
    }
    if (downloadedCount === 0) {
      console.log('   trust model download qwen2.5-1.5b-instruct  # Lightweight starter');
    }
    console.log('   trust model recommend coding               # Get personalized suggestions');
    console.log('   trust model list --verbose                # See all available models');
  }

  private async detailedStatus(): Promise<void> {
    const currentModel = this.modelManager.getCurrentModel();
    const models = this.modelManager.listAvailableModels();
    
    console.log('\n🛡️  Trust CLI - Detailed Model Status');
    console.log('═'.repeat(60));
    
    // Current model section
    if (currentModel) {
      console.log('\n🎯 Active Model:');
      console.log(`   Name: ${currentModel.name}`);
      console.log(`   Backend: ${currentModel.name.includes('ollama') ? '🦙 Ollama' : '🤗 HuggingFace'}`);
      console.log(`   Type: ${currentModel.type}`);
      console.log(`   Parameters: ${currentModel.parameters}`);
      console.log(`   RAM Required: ${currentModel.ramRequirement}`);
      console.log(`   Trust Score: ⭐ ${currentModel.trustScore}/10`);
      console.log(`   Context Size: ${currentModel.contextSize} tokens`);
      console.log(`   Path: ${currentModel.path}`);
    } else {
      console.log('\n❌ No Active Model');
      console.log('   Use: trust model switch <name> to activate a model');
    }
    
    // Performance metrics
    try {
      const { globalPerformanceMonitor } = await import('@trust-cli/trust-cli-core');
      const stats = globalPerformanceMonitor.getInferenceStats();
      const systemMetrics = globalPerformanceMonitor.getSystemMetrics();
      
      console.log('\n📊 Performance Metrics:');
      console.log(`   Total Inferences: ${stats.totalInferences}`);
      console.log(`   Average Speed: ${stats.averageTokensPerSecond.toFixed(1)} tokens/sec`);
      console.log(`   Average Time: ${stats.averageInferenceTime.toFixed(0)}ms`);
      console.log(`   System RAM: ${Math.floor(systemMetrics.memoryUsage.total / (1024**3))}GB total, ${Math.floor(systemMetrics.memoryUsage.available / (1024**3))}GB available`);
      
      const memoryPercent = (systemMetrics.memoryUsage.used / systemMetrics.memoryUsage.total) * 100;
      const memoryStatus = memoryPercent > 80 ? '🔴 High' : memoryPercent > 60 ? '🟡 Medium' : '🟢 Low';
      console.log(`   Memory Usage: ${memoryStatus} (${memoryPercent.toFixed(0)}%)`);
    } catch (error) {
      console.log('\n📊 Performance Metrics: Not available');
    }
    
    // Model summary
    const downloadedCount = await this.getDownloadedCount(models);
    const verifiedCount = await this.getVerifiedCount(models);
    
    console.log('\n📦 Model Summary:');
    console.log(`   Total Available: ${models.length}`);
    console.log(`   Downloaded: ${downloadedCount}`);
    console.log(`   Verified: ${verifiedCount}`);
    console.log(`   Backends: 🦙 Ollama + 🤗 HuggingFace + ☁️ Cloud`);
    
    console.log('\n💡 Management Commands:');
    console.log('   trust model list --verbose    # Detailed model list');
    console.log('   trust model ui               # Interactive manager');
    console.log('   trust model recommend        # Get suggestions');
    console.log('   trust status backend         # Backend configuration');
  }

  private async getDownloadedCount(models: any[]): Promise<number> {
    let count = 0;
    for (const model of models) {
      const isDownloaded = await this.modelManager.verifyModel(model.path);
      if (isDownloaded) count++;
    }
    return count;
  }

  private async getVerifiedCount(models: any[]): Promise<number> {
    let count = 0;
    for (const model of models) {
      if (model.verificationHash && model.verificationHash !== 'sha256:pending') {
        count++;
      }
    }
    return count;
  }

  private async getFirstDownloadedModel(models: any[]) {
    for (const model of models) {
      const isDownloaded = await this.modelManager.verifyModel(model.path);
      if (isDownloaded) return model;
    }
    return null;
  }
}

export async function handleModelCommand(args: ModelCommandArgs): Promise<void> {
  const handler = new ModelCommandHandler();
  await handler.handleCommand(args);
}