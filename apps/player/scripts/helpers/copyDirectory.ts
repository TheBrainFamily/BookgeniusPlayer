import { cp } from "node:fs/promises";
import type { CopyOptions } from "node:fs";

export async function copyDirectory(src: string, dest: string, opts: CopyOptions = {}): Promise<void> {
  await cp(src, dest, { recursive: true, ...opts });
}
