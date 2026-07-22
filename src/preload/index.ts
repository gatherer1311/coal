// src/preload/index.ts  (stub; Task 9 replaces with the real bridge)
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("coal", {});
