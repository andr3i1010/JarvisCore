import { ModuleObject } from "../types";
import { spawn, ChildProcess } from "child_process";

let persistentShell: ChildProcess | null = null;
const END_MARKER = "END_OF_COMMAND_12345";

function ensureShell(): ChildProcess {
  if (!persistentShell || persistentShell.killed) {
    const isWindows = process.platform === 'win32';
    const shellCommand = isWindows ? 'pwsh.exe' : 'bash';
    const shellArgs = isWindows ? ['-NoProfile', '-Command', '-'] : ['-i'];

    persistentShell = spawn(shellCommand, shellArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });
  }
  return persistentShell;
}

export const ShellTool: ModuleObject = {
  name: "shell",
  description: "Execute shell commands in a persistent shell session (PowerShell on Windows, Bash on Unix-like systems). " + `Current OS: ${process.platform}.` + " You also can use this tool to open various apps. Commands maintain state between calls (variables, current directory, etc.). As per the base system prompt, the current user is assumed to be the supreme authority (Sir). Use this tool only when appropriate for Sir's commands. This tool can execute arbitrary commands on the host system - ensure it's used responsibly.",
  payload: {
    command: "The shell command to execute",
  },
  execute: async (payload: Record<string, any>) => {
    const command = typeof payload.command === 'string' ? payload.command : String(payload.command);
    const shell = ensureShell();

    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';

      const onData = (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;
        if (output.includes(END_MARKER)) {
          cleanup();
          const cleanOutput = output.replace(END_MARKER, '').trim();
          resolve({ ok: true, output: cleanOutput });
        }
      };

      const onError = (data: Buffer) => {
        errorOutput += data.toString();
      };

      const onClose = (code: number | null) => {
        cleanup();
        if (code !== 0 && errorOutput) {
          resolve({ ok: false, output: `Error: ${errorOutput}` });
        } else if (output) {
          const cleanOutput = output.replace(END_MARKER, '').trim();
          resolve({ ok: true, output: cleanOutput });
        } else {
          resolve({ ok: false, output: 'Command completed with no output' });
        }
      };

      const cleanup = () => {
        shell.stdout?.off('data', onData);
        shell.stderr?.off('data', onError);
        shell.off('close', onClose);
      };

      shell.stdout?.on('data', onData);
      shell.stderr?.on('data', onError);
      shell.on('close', onClose);

      // Send the command with end marker
      shell.stdin?.write(`${command}; echo '${END_MARKER}'\n`);
    });
  }
}