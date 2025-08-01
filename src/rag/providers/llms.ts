/**
 * LLM Providers
 * 
 * Pluggable LLM providers for response generation
 */

import { LLMProvider } from '../base.js';
import { ChatOpenAI } from '@langchain/openai';
// import { ChatAnthropic } from '@langchain/anthropic'; // Not available in dependencies
import { ChatPromptTemplate } from '@langchain/core/prompts';

// OpenAI LLM provider
export class OpenAILLMProvider implements LLMProvider {
  private llm: ChatOpenAI;
  private promptTemplate: ChatPromptTemplate;

  constructor(options: {
    apiKey?: string;
    model?: string;
    temperature?: number;
  } = {}) {
    this.llm = new ChatOpenAI({
      apiKey: options.apiKey || process.env.OPENAI_API_KEY,
      model: options.model || 'gpt-4o-mini',
      temperature: options.temperature || 0.1
    });

    this.promptTemplate = ChatPromptTemplate.fromTemplate(`
You are an assistant for question-answering tasks. Use the following pieces of retrieved context to answer the question. 
If you don't know the answer, just say that you don't know. Use three sentences maximum and keep the answer concise.

Context:
{context}

Question: {question}

Answer:`);
  }

  async generate(query: string, context: string[]): Promise<string> {
    const contextString = context.join('\n\n');
    
    const prompt = await this.promptTemplate.format({
      context: contextString,
      question: query
    });

    const response = await this.llm.invoke(prompt);
    return response.content as string;
  }
}

// Anthropic LLM provider (placeholder - requires @langchain/anthropic dependency)
export class AnthropicLLMProvider implements LLMProvider {
  constructor(options: {
    apiKey?: string;
    model?: string;
    temperature?: number;
  } = {}) {
    throw new Error('Anthropic LLM provider requires @langchain/anthropic dependency. Use OpenAI provider instead.');
  }

  async generate(query: string, context: string[]): Promise<string> {
    throw new Error('Anthropic LLM provider not available');
  }
}

// Mock LLM provider for testing
export class MockLLMProvider implements LLMProvider {
  async generate(query: string, context: string[]): Promise<string> {
    return `Mock response for query: "${query}". Context had ${context.length} chunks.`;
  }
}

// Custom prompt LLM provider
export class CustomPromptLLMProvider implements LLMProvider {
  private llm: ChatOpenAI;
  private customPrompt: string;

  constructor(options: {
    provider: 'openai' | 'anthropic';
    model?: string;
    apiKey?: string;
    customPrompt: string;
    temperature?: number;
  }) {
    this.customPrompt = options.customPrompt;

    if (options.provider === 'openai') {
      this.llm = new ChatOpenAI({
        apiKey: options.apiKey || process.env.OPENAI_API_KEY,
        model: options.model || 'gpt-4o-mini',
        temperature: options.temperature || 0.1
      });
    } else {
      throw new Error('Anthropic provider not available. Use OpenAI provider.');
    }
  }

  async generate(query: string, context: string[]): Promise<string> {
    const contextString = context.join('\n\n');
    
    const prompt = this.customPrompt
      .replace('{context}', contextString)
      .replace('{question}', query)
      .replace('{query}', query);

    const response = await (this.llm as ChatOpenAI).invoke(prompt);
    return response.content as string;
  }
}

// Streaming LLM provider (for real-time responses)
export class StreamingLLMProvider implements LLMProvider {
  private llm: ChatOpenAI;
  private promptTemplate: ChatPromptTemplate;

  constructor(options: {
    apiKey?: string;
    model?: string;
    temperature?: number;
    onStream?: (chunk: string) => void;
  } = {}) {
    this.llm = new ChatOpenAI({
      apiKey: options.apiKey || process.env.OPENAI_API_KEY,
      model: options.model || 'gpt-4o-mini',
      temperature: options.temperature || 0.1,
      streaming: true
    });

    this.promptTemplate = ChatPromptTemplate.fromTemplate(`
You are an assistant for question-answering tasks. Use the following pieces of retrieved context to answer the question. 
If you don't know the answer, just say that you don't know. Use three sentences maximum and keep the answer concise.

Context:
{context}

Question: {question}

Answer:`);
  }

  async generate(query: string, context: string[]): Promise<string> {
    const contextString = context.join('\n\n');
    
    const prompt = await this.promptTemplate.format({
      context: contextString,
      question: query
    });

    // For now, return non-streaming response
    // In a full implementation, this would handle streaming
    const response = await this.llm.invoke(prompt);
    return response.content as string;
  }
}

// Factory function for creating LLM providers
export function createLLMProvider(
  type: 'openai' | 'anthropic' | 'mock' | 'custom',
  options: any = {}
): LLMProvider {
  switch (type) {
    case 'openai':
      return new OpenAILLMProvider(options);
    case 'anthropic':
      return new AnthropicLLMProvider(options);
    case 'mock':
      return new MockLLMProvider();
    case 'custom':
      return new CustomPromptLLMProvider(options);
    default:
      throw new Error(`Unknown LLM provider: ${type}`);
  }
}