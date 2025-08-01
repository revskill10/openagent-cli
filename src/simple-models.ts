import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { Config } from './simple-config.js';

export type ModelProvider = OpenAI | Anthropic;

export interface ModelResponse {
  content: string;
}

export interface StreamingCallback {
  (chunk: string): void;
}

export class ModelManager {
  private providers: Map<string, ModelProvider> = new Map();

  async initialize(config: Config) {
    for (const providerConfig of config.providers) {
      const apiKey = providerConfig.apiKey;
      
      let provider: ModelProvider;
      switch (providerConfig.type) {
        case 'openai':
          provider = new OpenAI({
            baseURL: providerConfig.baseURL,
            apiKey,
          });
          break;
        case 'anthropic':
          provider = new Anthropic({ apiKey });
          break;
        default:
          throw new Error(`Unknown provider type: ${providerConfig.type}`);
      }
      
      this.providers.set(providerConfig.name, provider);
      console.log(`✅ Initialized ${providerConfig.type} provider: ${providerConfig.name}`);
    }
  }

  async callModel(providerName: string, providerType: string, model: string, systemPrompt: string, userMessage: string, streamingCallback?: StreamingCallback): Promise<ModelResponse> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    try {
      if (providerType === 'openai') {
        const openai = provider as OpenAI;
        const stream = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          stream: true,
          max_tokens: 4000,
        });
        
        let content = '';
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            content += delta;
            if (streamingCallback) {
              streamingCallback(delta);
            }
          }
        }
        
        return {
          content: content || ''
        };
      } else if (providerType === 'anthropic') {
        const anthropic = provider as Anthropic;
        
        // Truncate system prompt if too long for context
        const maxContextLength = 32000; // Increased context limit
        const maxSystemPromptLength = maxContextLength - 1000; // Reserve space for user message and response
        const truncatedSystemPrompt = systemPrompt.length > maxSystemPromptLength 
          ? systemPrompt.substring(0, maxSystemPromptLength) + "..."
          : systemPrompt;
        
        if (streamingCallback) {
          const stream = await anthropic.messages.create({
            model,
            system: truncatedSystemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            max_tokens: 4096,
            stream: true,
          });
          
          let content = '';
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              const delta = chunk.delta.text;
              content += delta;
              streamingCallback(delta);
            }
          }
          
          return {
            content: content || ''
          };
        } else {
          const response = await anthropic.messages.create({
            model,
            system: truncatedSystemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            max_tokens: 4096,
          });
          
          return {
            content: (response.content[0] as Anthropic.TextBlock).text
          };
        }
      }
      
      throw new Error(`Unsupported provider type: ${providerType}`);
    } catch (error) {
      throw new Error(`Model call failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export const modelManager = new ModelManager();