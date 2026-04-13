export interface AgentArgument {
  name: string;
  description: string;
  required: boolean;
  default?: string;
}

export interface AgentCapability {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  supportedTaskTypes: string[];
  exitCodeMap: Record<number, string>;
  promptTemplate?: string;
}

export interface AgentDefinition {
  type: string;
  displayName: string;
  command: string;
  argsTemplate: (prompt: string) => string[];
  env?: Record<string, string>;
  supportedTaskTypes: readonly string[];
  exitCodeMap: Record<number, string>;
  maxConcurrent?: number;
}

export type AgentRegistry = Record<string, AgentDefinition>;
