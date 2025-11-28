import type { FastForwardRule, VisGraphRunner } from "./VisGraphRunner";

/** External control surface for awaiting, cancelling, or inspecting a run. */
export class VisExecutionHandle {
	public constructor(private readonly _runner: VisGraphRunner) { }

	public awaitCompletion(): Promise<void> {
		return this._runner.awaitCompletion();
	}

	public cancel(reason?: string): void {
		this._runner.cancel(reason);
	}

	public fastForwardNode(nodeId: string): void {
		this._runner.fastForwardNode(nodeId);
	}

	public fastForwardWhere(rule: FastForwardRule): void {
		this._runner.fastForwardWhere(rule);
	}

	public get status(): ReturnType<VisGraphRunner["getStatus"]> {
		return this._runner.getStatus();
	}

	public get scope(): ReturnType<VisGraphRunner["getScopeSnapshot"]> {
		return this._runner.getScopeSnapshot();
	}
}
