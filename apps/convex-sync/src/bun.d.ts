// Bun global declarations

declare namespace Bun {
  function write(path: string, data: string | ArrayBuffer | Uint8Array): Promise<number>;
  function sleep(ms: number): Promise<void>;
  function spawn(
    cmd: string[],
    options?: { stdout?: "pipe" | "ignore"; stderr?: "pipe" | "ignore" },
  ): { stdout: ReadableStream; stderr: ReadableStream; exitCode: number };
  function spawnSync(cmd: string[]): { stdout: Uint8Array; stderr: Uint8Array; exitCode: number };
}

// Extend ImportMeta for Bun
interface ImportMeta {
  dir: string;
  file: string;
  path: string;
  url: string;
  main: boolean;
}
