/** Shared key/value store for graph variables across nodes. */
export class VisBlackboard {
	private readonly _state = new Map<string, unknown>();

	public set(key: string, value: unknown): void {
		this._state.set(key, value);
	}

	public get<T>(key: string): T | undefined {
		return this._state.get(key) as T | undefined;
	}

	public delete(key: string): void {
		this._state.delete(key);
	}
}
