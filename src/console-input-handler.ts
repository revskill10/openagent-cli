// console-input-handler.ts - Console-based user input handler for prompts
import { UserInputHandler } from './interactive-block-executor.js';
import { PromptDefinition } from './simple-tools.js';

/**
 * Console-based implementation of UserInputHandler
 */
export class ConsoleInputHandler implements UserInputHandler {
  private readline: any;

  constructor() {
    // Dynamically import readline to avoid issues in non-Node environments
    this.initializeReadline();
  }

  private async initializeReadline() {
    try {
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      const readline = require('readline');
      
      this.readline = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
    } catch (error) {
      console.error('Failed to initialize readline:', error);
    }
  }

  async handlePrompt(prompt: PromptDefinition): Promise<any> {
    if (!this.readline) {
      await this.initializeReadline();
    }

    return new Promise((resolve, reject) => {
      try {
        switch (prompt.type) {
          case 'text':
            this.handleTextPrompt(prompt, resolve, reject);
            break;
          case 'number':
            this.handleNumberPrompt(prompt, resolve, reject);
            break;
          case 'select':
            this.handleSelectPrompt(prompt, resolve, reject);
            break;
          case 'confirm':
            this.handleConfirmPrompt(prompt, resolve, reject);
            break;
          default:
            this.handleTextPrompt(prompt, resolve, reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleTextPrompt(
    prompt: PromptDefinition, 
    resolve: (value: any) => void, 
    reject: (error: any) => void
  ) {
    const defaultHint = prompt.default ? ` (default: ${prompt.default})` : '';
    const requiredHint = prompt.required ? ' *' : '';
    const question = `${prompt.message}${defaultHint}${requiredHint}: `;

    this.readline.question(question, (answer: string) => {
      try {
        const value = answer.trim() || prompt.default;
        
        if (prompt.required && !value) {
          console.log('❌ This field is required');
          return this.handleTextPrompt(prompt, resolve, reject);
        }

        if (prompt.validation?.pattern && value) {
          const regex = new RegExp(prompt.validation.pattern);
          if (!regex.test(value)) {
            console.log(`❌ ${prompt.validation.message || 'Invalid format'}`);
            return this.handleTextPrompt(prompt, resolve, reject);
          }
        }

        resolve(value);
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleNumberPrompt(
    prompt: PromptDefinition, 
    resolve: (value: any) => void, 
    reject: (error: any) => void
  ) {
    const defaultHint = prompt.default !== undefined ? ` (default: ${prompt.default})` : '';
    const requiredHint = prompt.required ? ' *' : '';
    const minMax = prompt.validation ? 
      ` (${prompt.validation.min !== undefined ? `min: ${prompt.validation.min}` : ''}${
        prompt.validation.min !== undefined && prompt.validation.max !== undefined ? ', ' : ''
      }${prompt.validation.max !== undefined ? `max: ${prompt.validation.max}` : ''})` : '';
    
    const question = `${prompt.message}${minMax}${defaultHint}${requiredHint}: `;

    this.readline.question(question, (answer: string) => {
      try {
        const input = answer.trim();
        const value = input ? Number(input) : prompt.default;
        
        if (prompt.required && (value === undefined || value === null)) {
          console.log('❌ This field is required');
          return this.handleNumberPrompt(prompt, resolve, reject);
        }

        if (value !== undefined && isNaN(Number(value))) {
          console.log('❌ Please enter a valid number');
          return this.handleNumberPrompt(prompt, resolve, reject);
        }

        const num = Number(value);
        
        if (prompt.validation?.min !== undefined && num < prompt.validation.min) {
          console.log(`❌ Value must be at least ${prompt.validation.min}`);
          return this.handleNumberPrompt(prompt, resolve, reject);
        }

        if (prompt.validation?.max !== undefined && num > prompt.validation.max) {
          console.log(`❌ Value must be at most ${prompt.validation.max}`);
          return this.handleNumberPrompt(prompt, resolve, reject);
        }

        resolve(num);
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleSelectPrompt(
    prompt: PromptDefinition, 
    resolve: (value: any) => void, 
    reject: (error: any) => void
  ) {
    if (!prompt.options || prompt.options.length === 0) {
      reject(new Error('Select prompt requires options'));
      return;
    }

    console.log(`\n${prompt.message}`);
    prompt.options.forEach((option, index) => {
      console.log(`  ${index + 1}. ${option.label}`);
    });

    const defaultHint = prompt.default !== undefined ? ` (default: ${prompt.default})` : '';
    const requiredHint = prompt.required ? ' *' : '';
    const question = `Select option (1-${prompt.options.length})${defaultHint}${requiredHint}: `;

    this.readline.question(question, (answer: string) => {
      try {
        const input = answer.trim();
        
        if (!input && prompt.default !== undefined) {
          resolve(prompt.default);
          return;
        }

        if (prompt.required && !input) {
          console.log('❌ Please make a selection');
          return this.handleSelectPrompt(prompt, resolve, reject);
        }

        const selection = Number(input);
        if (isNaN(selection) || selection < 1 || selection > prompt.options!.length) {
          console.log(`❌ Please select a number between 1 and ${prompt.options!.length}`);
          return this.handleSelectPrompt(prompt, resolve, reject);
        }

        const selectedOption = prompt.options![selection - 1];
        resolve(selectedOption.value);
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleConfirmPrompt(
    prompt: PromptDefinition, 
    resolve: (value: any) => void, 
    reject: (error: any) => void
  ) {
    const defaultHint = prompt.default !== undefined ? 
      ` (default: ${prompt.default ? 'yes' : 'no'})` : '';
    const question = `${prompt.message} [y/n]${defaultHint}: `;

    this.readline.question(question, (answer: string) => {
      try {
        const input = answer.trim().toLowerCase();
        
        if (!input && prompt.default !== undefined) {
          resolve(Boolean(prompt.default));
          return;
        }

        if (prompt.required && !input) {
          console.log('❌ Please answer yes or no');
          return this.handleConfirmPrompt(prompt, resolve, reject);
        }

        if (['y', 'yes', 'true', '1'].includes(input)) {
          resolve(true);
        } else if (['n', 'no', 'false', '0'].includes(input)) {
          resolve(false);
        } else {
          console.log('❌ Please answer yes (y) or no (n)');
          return this.handleConfirmPrompt(prompt, resolve, reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  cleanup() {
    if (this.readline) {
      this.readline.close();
    }
  }
}

/**
 * Mock input handler for testing that automatically responds
 */
export class MockInputHandler implements UserInputHandler {
  private responses: Map<string, any> = new Map();

  /**
   * Set predefined responses for prompts
   */
  setResponse(variable: string, value: any): void {
    this.responses.set(variable, value);
  }

  /**
   * Set multiple responses at once
   */
  setResponses(responses: Record<string, any>): void {
    for (const [key, value] of Object.entries(responses)) {
      this.responses.set(key, value);
    }
  }

  async handlePrompt(prompt: PromptDefinition): Promise<any> {
    // Check if we have a predefined response
    if (this.responses.has(prompt.variable)) {
      const response = this.responses.get(prompt.variable);
      console.log(`🤖 Auto-responding to "${prompt.message}": ${response}`);
      return response;
    }

    // Auto-generate response based on prompt type
    switch (prompt.type) {
      case 'text':
        return prompt.default || `auto_${prompt.variable}`;
      case 'number':
        return prompt.default || 42;
      case 'confirm':
        return prompt.default !== undefined ? prompt.default : true;
      case 'select':
        if (prompt.options && prompt.options.length > 0) {
          return prompt.default !== undefined ? prompt.default : prompt.options[0].value;
        }
        return prompt.default || 'option1';
      default:
        return prompt.default || 'auto_response';
    }
  }
}

export const consoleInputHandler = new ConsoleInputHandler();
export const mockInputHandler = new MockInputHandler();