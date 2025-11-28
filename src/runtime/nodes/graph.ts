import { VisInput, VisNode, VisOutput, VisParameter } from "../../core/decorators";
import type { VisNodeExecutionContext } from "../context";
import { VisNodeResult, VisRuntimeNode } from "../node";
import type { VisNodeExecutionResult } from "../node";
import { VisGraphRunner } from "../scheduler";
import { VisBlackboard, VisScope } from "../context";

@VisNode({
	type: "vis.graph.subgraph",
	label: "Run Subgraph",
	description: "Executes another Vis graph (optionally awaiting completion).",
	defaultOutput: "next",
})
/** Instantiates and runs another graph asset from within the current graph. */
export class VisRunSubgraphNode extends VisRuntimeNode {
	@VisInput({ id: "graph", signal: "data", label: "Graph Id" })
	public graphInput?: string;

	@VisInput({ id: "entity", signal: "data", label: "Entity" })
	public entityInput?: string;

	@VisInput({ id: "args", signal: "data", label: "Args" })
	public argsInput?: Record<string, unknown>;

	@VisOutput({ id: "next", signal: "flow", label: "Next" })
	public next?: void;

	@VisOutput({ id: "error", signal: "flow", label: "Error" })
	public error?: void;

	@VisParameter({ id: "graphId", dataType: "string", required: true })
	public graphId!: string;

	@VisParameter({ id: "awaitCompletion", dataType: "boolean", defaultValue: true })
	public awaitCompletion = true;

	@VisParameter({ id: "shareBlackboard", dataType: "boolean", defaultValue: true })
	public shareBlackboard = true;

	@VisParameter({ id: "shareScope", dataType: "boolean", defaultValue: true })
	public shareScope = true;

	protected async _onExecute(ctx: VisNodeExecutionContext): Promise<VisNodeExecutionResult> {
		if (!ctx.graphs) {
			return VisNodeResult.failure("No graph library is attached to the runner.");
		}
		const graphId = ctx.getInput("graph", this.graphInput) ?? this.graphId;
		if (!graphId) {
			return VisNodeResult.failure("Subgraph node missing graph id.");
		}
		const entityId = ctx.getInput("entity", this.entityInput) ?? ctx.entityId;
		const graph = ctx.graphs.instantiate(graphId);
		const scope = this.shareScope ? ctx.scope : new VisScope();
		const blackboard = this.shareBlackboard ? ctx.blackboard : new VisBlackboard();
		const args = ctx.getInput<Record<string, unknown>>("args", this.argsInput);
		if (args && !this.shareBlackboard) {
			for (const [key, value] of Object.entries(args)) {
				blackboard.set(key, value);
			}
		}
		if (args && this.shareBlackboard) {
			for (const [key, value] of Object.entries(args)) {
				ctx.setVariable(key, value);
			}
		}
		const runner = new VisGraphRunner(graph, {
			entityId,
			adapter: ctx.adapter,
			scope,
			blackboard,
			graphLibrary: ctx.graphs,
			services: ctx.services,
		});
		const handle = runner.run();
		if (this.awaitCompletion) {
			await handle.awaitCompletion();
			if (handle.status === "failed") {
				return VisNodeResult.failure(`Subgraph '${graphId}' failed.`);
			}
		}
		return VisNodeResult.success(undefined, [{ pinId: "next" }]);
	}
}
