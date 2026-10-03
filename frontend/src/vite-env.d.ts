/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL publique de l'API (vide = même origine, via le proxy Vite ou Nginx). */
  readonly VITE_API_URL?: string;
  readonly VITE_API_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
