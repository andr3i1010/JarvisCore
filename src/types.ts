export type toolCallRequest = {
  cmd: string;
  payload?: Record<string, any>;
  passToClient?: boolean;
}

export type toolCallResponse = {
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
  streamChat: (messages: any[], options?: Record<string, any>) => AsyncGenerator<string>;
  chat: (messages: any[], options?: Record<string, any>) => Promise<string>;
  completions: (prompt: string, options?: Record<string, any>) => Promise<string>;
}