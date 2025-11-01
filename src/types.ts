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