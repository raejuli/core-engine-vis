import { VisInput, VisNode, VisOutput, VisParameter } from "../../core/decorators";
import { visComponentRegistry } from "../../core/registry";
import type { VisNodeExecutionContext } from "../context";
import { VisNodeResult, VisRuntimeNode } from "../node";
import type { VisNodeExecutionResult } from "../node";
import type { VisActionDefinition } from "../../core/types";

function normalizeArgs(
	args: unknown,
	action?: VisActionDefinition,
): unknown[] {
	if (Array.isArray(args)) {
		return args;
	}
	if (action?.parameters?.length && args && typeof args === "object") {
		return action.parameters.map((param, index) => {
			const record = args as Record<string, unknown>;
			if (Object.prototype.hasOwnProperty.call(record, param.id)) {
				return record[param.id];
			}
			const labelKey = param.label ?? String(index);
			if (Object.prototype.hasOwnProperty.call(record, labelKey)) {
				return record[labelKey];
			}
			return param.defaultValue;
		});
	}
	if (args && typeof args === "object") {
		return Object.values(args as Record<string, unknown>);
	}
	return Array.isArray(action?.parameters)
		? action!.parameters.map((param) => param.defaultValue)
		: [];
}

@VisNode({
	type: "vis.component.call",
	label: "Call Component",
	description: "Invokes a public action registered on a component.",
	defaultOutput: "next",
})
/** Invokes a registered component action and surfaces the result. */
export class VisCallComponentNode extends VisRuntimeNode {
	@VisInput({ id: "entity", signal: "data", label: "Entity" })
	public entityInput?: string;

	@VisInput({ id: "args", signal: "data", label: "Arguments" })
	public argsInput?: unknown;

	@VisOutput({ id: "next", signal: "flow", label: "Next" })
	public next?: void;

	@VisOutput({ id: "result", signal: "data", label: "Result" })
	public result?: unknown;

	@VisParameter({ id: "componentType", dataType: "string", required: true })
	public componentType!: string;

	@VisParameter({ id: "actionId", dataType: "string", required: true })
	public actionId!: string;

	@VisParameter({ id: "defaultArgs", description: "Fallback args when no input is provided." })
	public defaultArgs: unknown[] = [];

	@VisParameter({ id: "targetEntity", label: "Target Entity" })
	public targetEntity?: string;

	@VisParameter({ id: "useCurrentEntity", dataType: "boolean", defaultValue: true })
	public useCurrentEntity = true;

	protected async _onExecute(ctx: VisNodeExecutionContext): Promise<VisNodeExecutionResult> {
		if (!this.componentType || !this.actionId) {
			return VisNodeResult.failure("Component type and action id are required.");
		}
		const definition = visComponentRegistry.getDefinition(this.componentType);
		if (!definition) {
			return VisNodeResult.failure(`Component '${this.componentType}' is not registered.`);
		}
		const action = definition.actions.find(
			(candidate) => candidate.id === this.actionId || candidate.methodName === this.actionId,
		);
		if (!action) {
			return VisNodeResult.failure(
				`Component '${this.componentType}' does not expose action '${this.actionId}'.`,
			);
		}
		const entityFromInput = ctx.getInput<string>("entity");
		const resolvedEntityId = entityFromInput ?? this.targetEntity ?? (this.useCurrentEntity ? ctx.entityId : ctx.entityId);
		const argsSource = ctx.getInput("args", this.argsInput) ?? this.defaultArgs;
		const args = normalizeArgs(argsSource, action);
		const result = await ctx.adapter.invokeAction(
			resolvedEntityId,
			this.componentType,
			action.id,
			args,
		);
		return VisNodeResult.success({ result }, [{ pinId: "next" }]);
	}
}
