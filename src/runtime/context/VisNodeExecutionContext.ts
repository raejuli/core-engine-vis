import type { VisRuntimeAdapter, VisRuntimeEntity } from "../adapter";
import type { VisEntityId } from "../component";
import type { VisGraph } from "../graph";
import type { VisGraphLibrary } from "../library";
import { VisBlackboard } from "./VisBlackboard";
import { VisExecutionSignal } from "./VisExecutionSignal";
import { VisScope } from "./VisScope";

export interface VisNodeExecutionContextOptions<TServices = unknown> {
	entityId: VisEntityId;
	adapter: VisRuntimeAdapter;
	scope: VisScope;
	blackboard: VisBlackboard;
	signal: VisExecutionSignal;
	inputs: Record<string, unknown>;
	graphs?: VisGraphLibrary;
	services?: TServices;
}

/** Provides nodes with scoped access to components, graphs, and shared state. */
export class VisNodeExecutionContext<TServices = unknown> {
	public readonly entity: VisRuntimeEntity;
	public readonly adapter: VisRuntimeAdapter;
	public readonly graphs?: VisGraphLibrary;
	private readonly _services: TServices;

	public constructor(private readonly _options: VisNodeExecutionContextOptions<TServices>) {
		this.adapter = _options.adapter;
		this.entity = _options.adapter.getEntity(_options.entityId);
		this.graphs = _options.graphs;
		this._services = _options.services ?? ({} as TServices);
	}

	public get entityId(): VisEntityId {
		return this._options.entityId;
	}

	public get scope(): VisScope {
		return this._options.scope;
	}

	public get blackboard(): VisBlackboard {
		return this._options.blackboard;
	}

	public get signal(): VisExecutionSignal {
		return this._options.signal;
	}

	public get inputs(): Record<string, unknown> {
		return this._options.inputs;
	}

	public get services(): TServices {
		return this._services;
	}

	public resolveEntity(entityId?: VisEntityId): VisRuntimeEntity {
		const id = entityId ?? this._options.entityId;
		return this.adapter.getEntity(id);
	}

	public setVariable(key: string, value: unknown): void {
		this.blackboard.set(key, value);
	}

	public getVariable<T>(key: string): T | undefined {
		return this.blackboard.get<T>(key);
	}

	public getInput<T>(pinId: string, fallback?: T): T | undefined {
		return (this._options.inputs[pinId] as T | undefined) ?? fallback;
	}

	public clearVariable(key: string): void {
		this.blackboard.delete(key);
	}

	public instantiateGraph(graphId: string): VisGraph | undefined {
		return this.graphs?.instantiate(graphId);
	}
}
