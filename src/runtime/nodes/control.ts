import { VisInput, VisNode, VisOutput, VisParameter } from "../../core/decorators";
import type { VisNodeExecutionContext } from "../context";
import { VisNodeResult, VisRuntimeNode } from "../node";
import type { VisNodeExecutionResult } from "../node";

function toBoolean(value: unknown, fallback = false): boolean {
	if (typeof value === "boolean") {
		return value;
	}
	if (typeof value === "number") {
		return value !== 0;
	}
	if (typeof value === "string") {
		return value.length > 0;
	}
	return fallback;
}

function toNumber(value: unknown, fallback = 0): number {
	const num = Number(value);
	return Number.isFinite(num) ? num : fallback;
}

function toStringArray(value: unknown): string[] {
	if (!value) {
		return [];
	}
	if (typeof value === "string") {
		return value
			.split(/[,\n\s]+/)
			.map((entry) => entry.trim())
			.filter(Boolean);
	}
	if (Array.isArray(value)) {
		return value
			.map((entry) => (entry == null ? "" : String(entry).trim()))
			.filter(Boolean);
	}
	if (typeof value === "object") {
		const maybeNodes = (value as Record<string, unknown>).nodes;
		if (maybeNodes) {
			return toStringArray(maybeNodes);
		}
	}
	return [];
}

async function waitWithSignal(ms: number, ctx: VisNodeExecutionContext): Promise<void> {
	if (ctx.signal.cancelled || ctx.signal.fastForward) {
		return;
	}
	if (ms <= 0) {
		return;
	}
	await new Promise<void>((resolve) => {
		const timer = setTimeout(() => {
			cleanup();
			resolve();
		}, ms);
		const unsubscribe = ctx.signal.subscribe(() => {
			cleanup();
			resolve();
		});
		const cleanup = () => {
			clearTimeout(timer);
			unsubscribe?.();
		};
	});
}

@VisNode({
	type: "vis.control.branch",
	label: "Branch",
	description: "Routes flow based on a boolean condition.",
	defaultOutput: "true",
})
/** Routes execution based on a boolean condition. */
export class VisBranchNode extends VisRuntimeNode {
	@VisInput({ id: "flow", signal: "flow", label: "In" })
	public in?: void;

	@VisInput({ id: "condition", signal: "data", label: "Condition" })
	public condition?: boolean;

	@VisOutput({ id: "true", signal: "flow", label: "True" })
	public true?: void;

	@VisOutput({ id: "false", signal: "flow", label: "False" })
	public false?: void;

	@VisParameter({ id: "defaultCondition", dataType: "boolean", defaultValue: false })
	public defaultCondition = false;

	protected _onExecute(ctx: VisNodeExecutionContext): VisNodeExecutionResult {
		const decision = toBoolean(ctx.getInput("condition", this.defaultCondition), this.defaultCondition);
		const pinId = decision ? "true" : "false";
		return VisNodeResult.success(undefined, [{ pinId, strategy: "sequential" }]);
	}
}

@VisNode({
	type: "vis.control.delay",
	label: "Delay",
	description: "Waits a number of milliseconds before continuing.",
	defaultOutput: "next",
})
/** Sleeps for the given duration or skips when fast-forwarded/cancelled. */
export class VisDelayNode extends VisRuntimeNode {
	@VisInput({ id: "duration", signal: "data", label: "Duration (ms)" })
	public durationInput?: number;

	@VisOutput({ id: "next", signal: "flow", label: "Next" })
	public next?: void;

	@VisParameter({ id: "durationMs", dataType: "number", defaultValue: 250 })
	public durationMs = 250;

	protected async _onExecute(ctx: VisNodeExecutionContext): Promise<VisNodeExecutionResult> {
		const duration = toNumber(ctx.getInput("duration", this.durationMs), this.durationMs);
		if (ctx.signal.fastForward || ctx.signal.cancelled) {
			return VisNodeResult.skipped();
		}
		await waitWithSignal(duration, ctx);
		if (ctx.signal.cancelled) {
			return VisNodeResult.cancelled();
		}
		if (ctx.signal.fastForward) {
			return VisNodeResult.skipped();
		}
		return VisNodeResult.success(undefined, [{ pinId: "next" }]);
	}
}

@VisNode({
	type: "vis.control.parallel",
	label: "Parallel",
	description: "Forks up to four branches concurrently.",
})
/** Fans out flow pins and optionally awaits their completion. */
export class VisParallelNode extends VisRuntimeNode {
	@VisInput({ id: "flow", signal: "flow", label: "In" })
	public in?: void;

	@VisOutput({ id: "branchA", signal: "flow", label: "Branch A", strategy: "parallel" })
	public branchA?: void;

	@VisOutput({ id: "branchB", signal: "flow", label: "Branch B", strategy: "parallel" })
	public branchB?: void;

	@VisOutput({ id: "branchC", signal: "flow", label: "Branch C", strategy: "parallel" })
	public branchC?: void;

	@VisOutput({ id: "branchD", signal: "flow", label: "Branch D", strategy: "parallel" })
	public branchD?: void;

	@VisParameter({ id: "awaitCompletion", dataType: "boolean", defaultValue: true })
	public awaitCompletion = true;

	protected _onExecute(): VisNodeExecutionResult {
		const transitions = ["branchA", "branchB", "branchC", "branchD"]
			.map((pinId) => ({ pinId, strategy: "parallel" as const, awaitCompletion: this.awaitCompletion }))
			.filter((transition) => transition.pinId);
		return VisNodeResult.success(undefined, transitions);
	}
}

@VisNode({
	type: "vis.control.setVar",
	label: "Set Variable",
	description: "Writes a value into the graph blackboard.",
	defaultOutput: "next",
})
/** Writes a key/value pair into the shared blackboard. */
export class VisSetVariableNode extends VisRuntimeNode {
	@VisInput({ id: "value", signal: "data", label: "Value" })
	public valueInput?: unknown;

	@VisOutput({ id: "next", signal: "flow", label: "Next" })
	public next?: void;

	@VisOutput({ id: "value", signal: "data", label: "Value" })
	public valueOutput?: unknown;

	@VisParameter({ id: "key", dataType: "string", required: true })
	public key!: string;

	protected _onExecute(ctx: VisNodeExecutionContext): VisNodeExecutionResult {
		if (!this.key) {
			return VisNodeResult.failure("Set Variable node requires a key");
		}
		const value = ctx.getInput("value", this.valueInput);
		ctx.setVariable(this.key, value);
		return VisNodeResult.success({ value }, [{ pinId: "next", strategy: "sequential" }]);
	}
}

@VisNode({
	type: "vis.control.getVar",
	label: "Get Variable",
	description: "Reads a value from the graph blackboard.",
	defaultOutput: "next",
})
/** Reads a value from the blackboard and emits it as output. */
export class VisGetVariableNode extends VisRuntimeNode {
	@VisOutput({ id: "next", signal: "flow", label: "Next" })
	public next?: void;

	@VisOutput({ id: "value", signal: "data", label: "Value" })
	public value?: unknown;

	@VisParameter({ id: "key", dataType: "string", required: true })
	public key!: string;

	@VisParameter({ id: "defaultValue" })
	public defaultValue?: unknown;

	protected _onExecute(ctx: VisNodeExecutionContext): VisNodeExecutionResult {
		if (!this.key) {
			return VisNodeResult.failure("Get Variable node requires a key");
		}
		const value = ctx.getVariable(this.key) ?? this.defaultValue;
		return VisNodeResult.success({ value }, [{ pinId: "next", strategy: "sequential" }]);
	}
}

@VisNode({
	type: "vis.control.loop",
	label: "Loop",
	description: "Iterates a fixed number of times, exposing the current index.",
	defaultOutput: "body",
})
/** Replays its body pin for a fixed count while tracking the iteration index. */
export class VisLoopNode extends VisRuntimeNode {
	@VisInput({ id: "flow", signal: "flow", label: "In" })
	public in?: void;

	@VisInput({ id: "count", signal: "data", label: "Count" })
	public countInput?: number;

	@VisOutput({ id: "body", signal: "flow", label: "Body" })
	public body?: void;

	@VisOutput({ id: "complete", signal: "flow", label: "Complete" })
	public complete?: void;

	@VisOutput({ id: "index", signal: "data", label: "Index" })
	public indexOutput?: number;

	@VisParameter({ id: "count", dataType: "number", defaultValue: 1 })
	public count = 1;

	@VisParameter({ id: "loopKey", dataType: "string", defaultValue: "loop" })
	public loopKey = "loop";

	protected _onExecute(ctx: VisNodeExecutionContext): VisNodeExecutionResult {
		const total = Math.max(0, Math.floor(toNumber(ctx.getInput("count", this.count), this.count)));
		const key = `loop:${this.id}:${this.loopKey}`;
		const current = ctx.getVariable<number>(key) ?? 0;
		if (current < total) {
			ctx.setVariable(key, current + 1);
			return VisNodeResult.success({ index: current }, [{ pinId: "body" }]);
		}
		ctx.clearVariable(key);
		return VisNodeResult.success(undefined, [{ pinId: "complete" }]);
	}
}

@VisNode({
	type: "vis.control.waitFor",
	label: "Wait For Nodes",
	description: "Pauses execution until the selected nodes complete.",
	defaultOutput: "next",
})
/** Blocks the current fiber until specified nodes reach completion. */
export class VisWaitForNode extends VisRuntimeNode {
	@VisInput({ id: "targets", signal: "data", label: "Targets" })
	public targetsInput?: unknown;

	@VisOutput({ id: "next", signal: "flow", label: "Next" })
	public next?: void;

	@VisOutput({ id: "nodes", signal: "data", label: "Nodes" })
	public nodesOutput?: string[];

	@VisParameter({ id: "nodes", label: "Node Ids", description: "Comma-separated list or array of node ids." })
	public nodesParam?: string | string[];

	@VisParameter({ id: "waitForNext", dataType: "boolean", defaultValue: false })
	public waitForNext = false;

	protected _onExecute(ctx: VisNodeExecutionContext): VisNodeExecutionResult {
		const paramTargets = toStringArray(this.nodesParam);
		const inputTargets = toStringArray(ctx.getInput("targets", this.targetsInput) ?? this.targetsInput);
		const targets = Array.from(new Set([...paramTargets, ...inputTargets]));
		if (!targets.length) {
			return VisNodeResult.failure("Wait For node requires at least one target node id.");
		}
		return VisNodeResult.waitFor(targets, {
			next: this.waitForNext,
			outputs: { nodes: targets },
			transitions: [{ pinId: "next", strategy: "sequential" }],
		});
	}
}