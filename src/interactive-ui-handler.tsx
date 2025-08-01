// interactive-ui-handler.tsx - React-based UI handler for interactive prompts
import React, { useState, useEffect } from 'react';
import { Text, Box, Newline } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { UserInputHandler } from './interactive-block-executor.js';
import { PromptDefinition } from './simple-tools.js';

interface UIPromptHandlerProps {
  onResponse: (response: any) => void;
  prompt: PromptDefinition;
}

const TextPromptComponent: React.FC<UIPromptHandlerProps> = ({ prompt, onResponse }) => {
  const [value, setValue] = useState(prompt.default?.toString() || '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (input: string) => {
    try {
      const finalValue = input.trim() || prompt.default;
      
      if (prompt.required && !finalValue) {
        setError('This field is required');
        return;
      }

      if (prompt.validation?.pattern && finalValue) {
        const regex = new RegExp(prompt.validation.pattern);
        if (!regex.test(finalValue)) {
          setError(prompt.validation.message || 'Invalid format');
          return;
        }
      }

      // Clear error on successful submission
      setError(null);
      onResponse(finalValue);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation error');
    }
  };

  // Clear error when user starts typing
  const handleChange = (newValue: string) => {
    setValue(newValue);
    if (error) setError(null);
  };

  return (
    <Box flexDirection="column">
      <Text>
        {prompt.message}
        {prompt.required && <Text color="red"> *</Text>}
        {prompt.default && <Text color="gray"> (default: {prompt.default})</Text>}
      </Text>
      
      {error && (
        <Text color="red">❌ {error}</Text>
      )}
      
      <Box>
        <Text>💬 </Text>
        <TextInput
          value={value}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder={prompt.default?.toString() || 'Enter value...'}
          focus={true}
        />
      </Box>
    </Box>
  );
};

const SelectPromptComponent: React.FC<UIPromptHandlerProps> = ({ prompt, onResponse }) => {
  if (!prompt.options || prompt.options.length === 0) {
    return <Text color="red">❌ Select prompt requires options</Text>;
  }

  const items = prompt.options.map(option => ({
    label: option.label,
    value: option.value
  }));

  return (
    <Box flexDirection="column">
      <Text>
        {prompt.message}
        {prompt.required && <Text color="red"> *</Text>}
      </Text>
      <SelectInput
        items={items}
        onSelect={(item) => onResponse(item.value)}
      />
    </Box>
  );
};

const ConfirmPromptComponent: React.FC<UIPromptHandlerProps> = ({ prompt, onResponse }) => {
  const items = [
    { label: 'Yes', value: true },
    { label: 'No', value: false }
  ];

  return (
    <Box flexDirection="column">
      <Text>
        {prompt.message}
        {prompt.default !== undefined && (
          <Text color="gray"> (default: {prompt.default ? 'yes' : 'no'})</Text>
        )}
      </Text>
      <SelectInput
        items={items}
        onSelect={(item) => onResponse(item.value)}
      />
    </Box>
  );
};

const NumberPromptComponent: React.FC<UIPromptHandlerProps> = ({ prompt, onResponse }) => {
  const [value, setValue] = useState(prompt.default?.toString() || '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (input: string) => {
    try {
      const inputValue = input.trim();
      const finalValue = inputValue ? Number(inputValue) : prompt.default;
      
      if (prompt.required && (finalValue === undefined || finalValue === null)) {
        setError('This field is required');
        return;
      }

      if (finalValue !== undefined && isNaN(Number(finalValue))) {
        setError('Please enter a valid number');
        return;
      }

      const num = Number(finalValue);
      
      if (prompt.validation?.min !== undefined && num < prompt.validation.min) {
        setError(`Value must be at least ${prompt.validation.min}`);
        return;
      }

      if (prompt.validation?.max !== undefined && num > prompt.validation.max) {
        setError(`Value must be at most ${prompt.validation.max}`);
        return;
      }

      // Clear error on successful submission
      setError(null);
      onResponse(num);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation error');
    }
  };

  // Clear error when user starts typing
  const handleChange = (newValue: string) => {
    setValue(newValue);
    if (error) setError(null);
  };

  const minMaxHint = prompt.validation ? 
    ` (${prompt.validation.min !== undefined ? `min: ${prompt.validation.min}` : ''}${
      prompt.validation.min !== undefined && prompt.validation.max !== undefined ? ', ' : ''
    }${prompt.validation.max !== undefined ? `max: ${prompt.validation.max}` : ''})` : '';

  return (
    <Box flexDirection="column">
      <Text>
        {prompt.message}{minMaxHint}
        {prompt.required && <Text color="red"> *</Text>}
        {prompt.default !== undefined && <Text color="gray"> (default: {prompt.default})</Text>}
      </Text>
      
      {error && (
        <Text color="red">❌ {error}</Text>
      )}
      
      <Box>
        <Text>🔢 </Text>
        <TextInput
          value={value}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder={prompt.default?.toString() || 'Enter number...'}
          focus={true}
        />
      </Box>
    </Box>
  );
};

interface InteractivePromptProps {
  prompt: PromptDefinition | null;
  onResponse: (response: any) => void;
}

export const InteractivePrompt: React.FC<InteractivePromptProps> = ({ prompt, onResponse }) => {
  if (!prompt) return null;

  return (
    <Box borderStyle="single" borderColor="yellow" padding={1} marginY={1}>
      <Box flexDirection="column">
        <Text color="yellow" bold>🎯 User Input Required</Text>
        <Newline />
        
        {prompt.type === 'text' && (
          <TextPromptComponent prompt={prompt} onResponse={onResponse} />
        )}
        
        {prompt.type === 'select' && (
          <SelectPromptComponent prompt={prompt} onResponse={onResponse} />
        )}
        
        {prompt.type === 'confirm' && (
          <ConfirmPromptComponent prompt={prompt} onResponse={onResponse} />
        )}
        
        {prompt.type === 'number' && (
          <NumberPromptComponent prompt={prompt} onResponse={onResponse} />
        )}
      </Box>
    </Box>
  );
};

/**
 * React-based implementation of UserInputHandler for Ink UI
 */
export class ReactUIInputHandler implements UserInputHandler {
  private currentPrompt: PromptDefinition | null = null;
  private responseResolver: ((value: any) => void) | null = null;
  private promptComponent: React.ComponentType<InteractivePromptProps> | null = null;

  async handlePrompt(prompt: PromptDefinition): Promise<any> {
    return new Promise((resolve) => {
      this.currentPrompt = prompt;
      this.responseResolver = resolve;
    });
  }

  handleResponse(response: any) {
    if (this.responseResolver) {
      this.responseResolver(response);
      this.currentPrompt = null;
      this.responseResolver = null;
    }
  }

  getCurrentPrompt(): PromptDefinition | null {
    return this.currentPrompt;
  }

  renderPrompt(): React.ReactElement | null {
    if (!this.currentPrompt) return null;
    
    return (
      <InteractivePrompt 
        prompt={this.currentPrompt} 
        onResponse={(response) => this.handleResponse(response)}
      />
    );
  }
}

export const reactUIInputHandler = new ReactUIInputHandler();