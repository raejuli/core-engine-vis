type VisSignalEvent = "cancel" | "fastForward";

/** Broadcasts cancellation and fast-forward state to running nodes. */
export class VisExecutionSignal {
	private _cancelled = false;
	private _fastForward = false;
	private _reason?: string;
	private readonly _listeners = new Set<(event: VisSignalEvent, reason?: string) => void>();

	public get cancelled(): boolean {
		return this._cancelled;
	}

	public get fastForward(): boolean {
		return this._fastForward;
	}

	public get reason(): string | undefined {
		return this._reason;
	}

	public cancel(reason?: string): void {
		if (this._cancelled) {
			return;
		}
		this._cancelled = true;
		this._reason = reason;
		this._emit("cancel");
	}

	public requestFastForward(reason?: string): void {
		if (this._fastForward) {
			return;
		}
		this._fastForward = true;
		this._reason = reason;
		this._emit("fastForward");
	}

	public subscribe(listener: (event: VisSignalEvent, reason?: string) => void): () => boolean {
		this._listeners.add(listener);
		return () => this._listeners.delete(listener);
	}

	private _emit(event: VisSignalEvent): void {
		for (const listener of this._listeners) {
			try {
				listener(event, this._reason);
			} catch (error) {
				console.error("VisExecutionSignal listener error", error);
			}
		}
	}
}
