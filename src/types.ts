export type ToolCallRequest = {
  cmd: string;
  payload: Record<string, any>;
  passToClient?: boolean;
}

export type ToolCallResponse = {
  ok: boolean;
  payload?: Record<string, any>;
  output?: string;
}

export type aiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
}

export type AIResponsePacket = {
  ok: boolean;
  event: string;
  error?: string;
  content?: string;
}

export type AIProviderFunctions = {
  streamChat: (messages: any[], options?: Record<string, any>) => AsyncGenerator<AIResponsePacket>;
  chat: (messages: any[], options?: Record<string, any>) => Promise<string>;
  completions: (prompt: string, options?: Record<string, any>) => Promise<string>;
}

export type ModuleObject = {
  name: string;
  payload?: Record<string, any>;
  execute: (payload: Record<string, any>) => Promise<any>;
}