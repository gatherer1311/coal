// src/renderer/coal.d.ts
import type { CoalApi } from "../kernel/ipc/contract";

declare global {
  interface Window {
    coal: CoalApi;
  }
}

export {};
