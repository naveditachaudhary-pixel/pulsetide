/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_STATUS_URL?: string;
  readonly VITE_HOSTING?: "github" | "azure";
}
