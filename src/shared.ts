import { EventEmitter } from 'events';

export interface Log {
  agentId: string;
  text: string;
  type: "thought" | "file" | "done" | "question";
}

export const sharedLogs: Log[] = [];

export const logEmitter = new EventEmitter();