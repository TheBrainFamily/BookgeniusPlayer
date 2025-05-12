/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BOOK: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
