const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 529]);
// Only pause for errors that normally require a credential, endpoint, or
// model configuration change. 400/422 can be caused by one bad prompt and
// must not disable unrelated later calls.
const PAUSING_STATUSES = new Set([401, 403, 404]);

export function extractLlmStatus(error: unknown): number | null {
  const text = String(error ?? "");
  const match = text.match(/\b(?:LLM|Anthropic) API (\d{3})\b/);
  if (!match) return null;
  return Number(match[1]);
}

export class LlmFailureGuard {
  private pausedUntil = 0;

  constructor(
    private readonly cooldownMs = 10 * 60_000,
    private readonly now = () => Date.now(),
  ) {}

  canRun(): boolean {
    return this.now() >= this.pausedUntil;
  }

  remainingMs(): number {
    return Math.max(0, this.pausedUntil - this.now());
  }

  reset(): void {
    this.pausedUntil = 0;
  }

  tripIfNeeded(error: unknown): boolean {
    const status = extractLlmStatus(error);
    if (status == null || RETRYABLE_STATUSES.has(status) || !PAUSING_STATUSES.has(status)) {
      return false;
    }
    this.pausedUntil = Math.max(this.pausedUntil, this.now() + this.cooldownMs);
    return true;
  }
}
