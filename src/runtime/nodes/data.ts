import { VisInput, VisNode, VisOutput, VisParameter } from "../../core/decorators";
import type { VisNodeExecutionContext } from "../context";
import { VisNodeResult, VisRuntimeNode } from "../node";
import type { VisNodeExecutionResult } from "../node";

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toInteger(value: unknown, fallback = 0): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return fallback;
	}
	return Math.trunc(parsed);
}

@VisNode({
	type: "vis.data.object",
	label: "Make Object",
	description: "Creates an object with a single key/value pair.",
	defaultOutput: "next",
})
/** Builds a record from a key parameter and incoming value. */
export class VisMakeObjectNode extends VisRuntimeNode {
	@VisInput({ id: "value", signal: "data", label: "Value" })
	public valueInput?: unknown;

	@VisOutput({ id: "next", signal: "flow", label: "Next" })
	public next?: void;

	@VisOutput({ id: "object", signal: "data", label: "Object" })
	public objectOutput?: Record<string, unknown>;

	@VisParameter({ id: "key", dataType: "string", required: true })
	public key!: string;

	protected _onExecute(ctx: VisNodeExecutionContext): VisNodeExecutionResult {
		if (!this.key) {
			return VisNodeResult.failure("Make Object node requires a key.");
		}
		const value = ctx.getInput("value", this.valueInput);
		const object = { [this.key]: value };
		return VisNodeResult.success({ object }, [{ pinId: "next" }]);
	}
}

@VisNode({
	type: "vis.data.merge",
	label: "Merge Objects",
	description: "Shallow merges two records to create a payload.",
	defaultOutput: "next",
})
/** Combines two objects into a single shallow copy. */
export class VisMergeObjectsNode extends VisRuntimeNode {
	@VisInput({ id: "a", signal: "data", label: "First" })
	public a?: Record<string, unknown>;

	@VisInput({ id: "b", signal: "data", label: "Second" })
	public b?: Record<string, unknown>;

	@VisOutput({ id: "next", signal: "flow", label: "Next" })
	public next?: void;

	@VisOutput({ id: "object", signal: "data", label: "Object" })
	public object?: Record<string, unknown>;

	protected _onExecute(ctx: VisNodeExecutionContext): VisNodeExecutionResult {
		const left = ctx.getInput<Record<string, unknown>>("a", this.a) ?? {};
		const right = ctx.getInput<Record<string, unknown>>("b", this.b) ?? {};
		const object = { ...left, ...right };
		return VisNodeResult.success({ object }, [{ pinId: "next" }]);
	}
}

@VisNode({
	type: "vis.data.pick",
	label: "Pick From Array",
	description: "Reads the element at the provided index from an array.",
	defaultOutput: "next",
})
/** Selects an array element by index with optional clamping. */
export class VisPickArrayNode extends VisRuntimeNode {
	@VisInput({ id: "array", signal: "data", label: "Array" })
	public arrayInput?: unknown[];

	@VisInput({ id: "index", signal: "data", label: "Index" })
	public indexInput?: number;

	@VisOutput({ id: "next", signal: "flow", label: "Next" })
	public next?: void;

	@VisOutput({ id: "value", signal: "data", label: "Value" })
	public value?: unknown;

	@VisParameter({ id: "defaultIndex", dataType: "number", defaultValue: 0 })
	public defaultIndex = 0;

	@VisParameter({ id: "clampIndex", dataType: "boolean", defaultValue: true })
	public clampIndex = true;

	@VisParameter({ id: "defaultValue", description: "Fallback when the array or index is invalid." })
	public defaultValue?: unknown;

	protected _onExecute(ctx: VisNodeExecutionContext): VisNodeExecutionResult {
		const source = ctx.getInput<unknown[]>("array", this.arrayInput) ?? [];
		const array = Array.isArray(source) ? source : [];
		const rawIndex = ctx.getInput("index", this.indexInput ?? this.defaultIndex);
		let index = toInteger(rawIndex, this.defaultIndex);
		if (array.length === 0) {
			return VisNodeResult.success({ value: this.defaultValue }, [{ pinId: "next" }]);
		}
		if (this.clampIndex) {
			index = Math.max(0, Math.min(array.length - 1, index));
		}
		const value = array[index] ?? this.defaultValue;
		return VisNodeResult.success({ value }, [{ pinId: "next" }]);
	}
}

@VisNode({
	type: "vis.data.get",
	label: "Get Property",
	description: "Reads a property from an object and exposes it as data.",
	defaultOutput: "next",
})
/** Extracts a single property from an incoming object. */
export class VisGetPropertyNode extends VisRuntimeNode {
	@VisInput({ id: "object", signal: "data", label: "Object" })
	public objectInput?: Record<string, unknown>;

	@VisInput({ id: "key", signal: "data", label: "Key" })
	public keyInput?: string;

	@VisOutput({ id: "next", signal: "flow", label: "Next" })
	public next?: void;

	@VisOutput({ id: "value", signal: "data", label: "Value" })
	public value?: unknown;

	@VisParameter({ id: "key", dataType: "string", required: true })
	public key!: string;

	@VisParameter({ id: "defaultValue" })
	public defaultValue?: unknown;

	protected _onExecute(ctx: VisNodeExecutionContext): VisNodeExecutionResult {
		const record = ctx.getInput<Record<string, unknown>>("object", this.objectInput) ?? this.objectInput;
		const keyFromInput = ctx.getInput<string>("key", this.keyInput);
		const resolvedKey = (keyFromInput ?? this.key)?.toString();
		if (!resolvedKey || !isPlainObject(record)) {
			return VisNodeResult.success({ value: this.defaultValue }, [{ pinId: "next" }]);
		}
		const value = (record as Record<string, unknown>)[resolvedKey] ?? this.defaultValue;
		return VisNodeResult.success({ value }, [{ pinId: "next" }]);
	}
}
