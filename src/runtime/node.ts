import type { VisFlowStrategy, VisNodeStatus } from "../core/types";
import { VisNodeExecutionContext } from "./context";

export interface VisFlowTransition {
	pinId: string;
	strategy?: VisFlowStrategy;
	awaitCompletion?: boolean;
	groupId?: string;
}

export interface VisNodeExecutionResult {
	status: VisNodeStatus;
	outputs?: Record<string, unknown>;
	transitions?: VisFlowTransition[];
	waitFor?: string[];
	waitForNext?: boolean;
}

/** Base class for all executable nodes with lifecycle helpers. */
export abstract class VisRuntimeNode<TServices = unknown> {
	public id = "";

	public async execute(ctx: VisNodeExecutionContext<TServices>): Promise<VisNodeExecutionResult> {
		if (ctx.signal.cancelled) {
			return VisNodeResult.cancelled();
		}
		if (ctx.signal.fastForward) {
			return this.onFastForward(ctx);
		}
		return this._onExecute(ctx);
	}

	protected abstract _onExecute(
		ctx: VisNodeExecutionContext<TServices>,
	): Promise<VisNodeExecutionResult> | VisNodeExecutionResult;

	public async onFastForward(ctx: VisNodeExecutionContext<TServices>): Promise<VisNodeExecutionResult> {
		return VisNodeResult.skipped();
	}
}

export const VisNodeResult = {
	success(
		outputs?: Record<string, unknown>,
		transitions?: VisFlowTransition[],
	): VisNodeExecutionResult {
		return { status: "success", outputs, transitions };
	},
	running(transitions?: VisFlowTransition[]): VisNodeExecutionResult {
		return { status: "running", transitions };
	},
	waitFor(
		targets: string | string[],
		options?: {
			next?: boolean;
			outputs?: Record<string, unknown>;
			transitions?: VisFlowTransition[];
		},
	): VisNodeExecutionResult {
		const list = Array.isArray(targets) ? targets : [targets];
		return {
			status: "running",
			outputs: options?.outputs,
			transitions: options?.transitions,
			waitFor: list,
			waitForNext: options?.next,
		};
	},
	failure(message?: string): VisNodeExecutionResult {
		return {
			status: "failure",
			outputs: message ? { error: message } : undefined,
		};
	},
	skipped(transitions?: VisFlowTransition[]): VisNodeExecutionResult {
		return { status: "skipped", transitions };
	},
	cancelled(): VisNodeExecutionResult {
		return { status: "skipped" };
	},
};
