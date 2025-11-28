function makeScopeKey(nodeId: string, pinId: string): string {
	return `${nodeId}:${pinId}`;
}

/** Tracks pin-level outputs so downstream nodes can read computed values. */
export class VisScope {
	private readonly _values = new Map<string, unknown>();

	public set(nodeId: string, pinId: string, value: unknown): void {
		this._values.set(makeScopeKey(nodeId, pinId), value);
	}

	public get<T>(nodeId: string, pinId: string): T | undefined {
		return this._values.get(makeScopeKey(nodeId, pinId)) as T | undefined;
	}

	public snapshot(): Record<string, unknown> {
		return Object.fromEntries(this._values.entries());
	}
}
