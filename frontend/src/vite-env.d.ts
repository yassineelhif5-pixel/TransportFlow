/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL publique de l'API (vide = même origine, via le proxy Vite ou Nginx). */
  readonly VITE_API_URL?: string;
  readonly VITE_API_PROXY_TARGET?: string;
  /** « true » : version de démonstration autonome (API simulée, GitHub Pages). */
  readonly VITE_DEMO?: string;
  /** Chemin de publication (ex. « /TransportFlow/ » sur GitHub Pages). */
  readonly VITE_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
