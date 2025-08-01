// Basic durable pipeline implementation for compatibility
export interface DurableStep<TInput, TOutput> {
  id: string;
  maxRetries: number;
  retryDelay: number;
  timeout?: number;
  run: (input: TInput, context: DurableContext) => Promise<TOutput>;
  compensate?: (input: TInput, output: TOutput, context: DurableContext) => Promise<void>;
}

export interface DurableContext {
  executionId: string;
  stepId: string;
  attemptCount: number;
  isResuming: boolean;
  checkpoint: <T>(data: T) => Promise<void>;
  logger: any;
}

export interface PipelineExecutionState {
  id: string;
  pipelineId: string;
  currentStep: number;
  steps: any[];
  status: 'running' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  context: Record<string, any>;
}

export interface PersistenceAdapter {
  save(state: PipelineExecutionState): Promise<void>;
  load(executionId: string): Promise<PipelineExecutionState | null>;
  list(filter: { pipelineId?: string; status?: string }): Promise<PipelineExecutionState[]>;
  delete(executionId: string): Promise<void>;
}

export class InMemoryPersistenceAdapter implements PersistenceAdapter {
  private states = new Map<string, PipelineExecutionState>();

  async save(state: PipelineExecutionState): Promise<void> {
    this.states.set(state.id, { ...state });
  }

  async load(executionId: string): Promise<PipelineExecutionState | null> {
    return this.states.get(executionId) || null;
  }

  async list(filter: { pipelineId?: string; status?: string }): Promise<PipelineExecutionState[]> {
    return Array.from(this.states.values()).filter(state => {
      if (filter.pipelineId && state.pipelineId !== filter.pipelineId) return false;
      if (filter.status && state.status !== filter.status) return false;
      return true;
    });
  }

  async delete(executionId: string): Promise<void> {
    this.states.delete(executionId);
  }
}

export class DurablePipelineBuilder<TInput = any, TOutput = any> {
  constructor(
    private steps: DurableStep<any, any>[] = [],
    private persistence: PersistenceAdapter = new InMemoryPersistenceAdapter()
  ) {}

  withPersistence(adapter: PersistenceAdapter): this {
    this.persistence = adapter;
    return this;
  }

  addStep<TNext>(step: DurableStep<TOutput, TNext>): DurablePipelineBuilder<TInput, TNext> {
    return new DurablePipelineBuilder([...this.steps, step], this.persistence);
  }

  addPipelineAsStep<TNext>(
    pipeline: DurablePipeline<TOutput, TNext>,
    id?: string
  ): DurablePipelineBuilder<TInput, TNext> {
    const step: DurableStep<TOutput, TNext> = {
      id: id || `${pipeline.id}.asStep`,
      maxRetries: 0,
      retryDelay: 0,
      run: async (input: TOutput) => {
        return pipeline.execute(input);
      },
    };
    return this.addStep(step);
  }

  build(id: string): DurablePipeline<TInput, TOutput> {
    return new DurablePipeline(id, this.steps, this.persistence);
  }
}

export function createDurableStep<TInput, TOutput>(
  id: string,
  run: (input: TInput, context: DurableContext) => Promise<TOutput>,
  options: { maxRetries?: number; delay?: number; timeout?: number } = {}
): DurableStep<TInput, TOutput> {
  return {
    id,
    maxRetries: options.maxRetries || 3,
    retryDelay: options.delay || 1000,
    timeout: options.timeout,
    run,
  };
}

export class DurablePipeline<TInput, TOutput> {
  constructor(
    public readonly id: string,
    private steps: DurableStep<any, any>[],
    protected persistence: PersistenceAdapter
  ) {}

  async execute(input: TInput, options: { executionId?: string } = {}): Promise<TOutput> {
    console.log(`Executing pipeline ${this.id}`);
    return input as unknown as TOutput;
  }

  async listExecutions(status?: string): Promise<PipelineExecutionState[]> {
    return this.persistence.list({ pipelineId: this.id, status });
  }

  async getStatus(executionId: string): Promise<PipelineExecutionState | null> {
    return this.persistence.load(executionId);
  }
}