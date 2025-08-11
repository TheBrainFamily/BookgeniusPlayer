/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BOOK: string;
  readonly VITE_EDITOR: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
