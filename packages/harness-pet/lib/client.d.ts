import { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
//#region src/status.d.ts
declare const PET_STATUSES: readonly ["idle", "thinking", "working", "searching", "bash", "editing", "waiting", "error", "success"];
type PetStatus = (typeof PET_STATUSES)[number];
//#endregion
//#region src/adapters/deepseek-harness.d.ts
interface SnapshotSource<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}
/** The only Harness-shaped value consumed by the state mapper. */
interface SignalSnapshot {
  sessionId?: unknown;
  chat?: unknown;
  partial?: unknown;
  running?: unknown;
  runningCalls?: unknown;
  pending?: unknown;
  queue?: unknown;
  promptError?: unknown;
  lastAgentError?: unknown;
  nodes?: unknown;
  connection?: unknown;
  derivedSuccess?: unknown;
  [key: string]: unknown;
}
interface HarnessSessions {
  list: SnapshotSource<{
    current?: string;
  }>;
  binding(id: string): {
    session: HarnessSessionFace;
  } | undefined;
}
interface HarnessSessionFace extends SnapshotSource<SignalSnapshot> {
  prompt?(content: Array<{
    type: 'text';
    text: string;
  }>, mode: 'queue' | 'steer'): Promise<unknown>;
}
interface HarnessContext {
  sessions: HarnessSessions;
  connection: {
    hostDescription: SnapshotSource<unknown>;
  };
}
//#endregion
//#region src/pet/index.d.ts
interface WhalePet {
  setStatus(status: PetStatus, conversationTitle?: string, assistantText?: string, conversationIdentity?: string): void;
  dispose(): void;
}
interface PetActionResult {
  ok: boolean;
  message?: string;
}
interface WhalePetOptions {
  onFollowup?(text: string): Promise<PetActionResult>;
}
//#endregion
//#region src/storage/singleton.d.ts
interface DisposableWhale {
  dispose(): void;
}
//#endregion
//#region src/client/index.d.ts
declare const inject: string[];
declare function startHarnessPet(context: HarnessContext, createPet?: (options: WhalePetOptions) => WhalePet): DisposableWhale;
declare function apply(ctx: ClientContext): void;
//#endregion
export { apply, inject, startHarnessPet };