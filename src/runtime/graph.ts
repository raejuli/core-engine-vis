import { visNodeRegistry } from "../core/registry";
import type { VisNodeDefinition, VisParameterMetadata, VisPinMetadata } from "../core/types";
import { VisScope } from "./context";
import { VisRuntimeNode } from "./node";

export interface VisSerializedNode {
	id: string;
	type: string;
	params?: Record<string, unknown>;
	inputs?: Record<string, unknown>;
	entityId?: string;
	metadata?: Record<string, unknown>;
}

export interface VisSerializedConnection {
	kind: "flow" | "data";
	from: { nodeId: string; pinId: string };
	to: { nodeId: string; pinId: string };
}

export interface VisGraphAsset {
	id: string;
	name: string;
	root?: string | string[];
	nodes: VisSerializedNode[];
	connections?: VisSerializedConnection[];
	metadata?: Record<string, unknown>;
}

interface VisNodeParameterBinding {
	propertyKey: string | symbol;
	id: string;
	meta: VisParameterMetadata;
}

export interface VisGraphNode<TServices = unknown> {
	id: string;
	type: string;
	entityId?: string;
	instance: VisRuntimeNode<TServices>;
	definition: VisNodeDefinition;
	literalInputs: Record<string, unknown>;
}

interface DataBinding {
	nodeId: string;
	pinId: string;
}

/** Materializes a serialized graph asset into runnable nodes and connections. */
export class VisGraph<TServices = unknown> {
	public readonly id: string;
	public readonly name: string;
	public readonly roots: string[];

	private readonly _nodes = new Map<string, VisGraphNode<TServices>>();
	private readonly _flowMap = new Map<string, Map<string, string[]>>();
	private readonly _dataMap = new Map<string, Map<string, DataBinding[]>>();

	private constructor(asset: VisGraphAsset) {
		this.id = asset.id;
		this.name = asset.name;
		this.roots = this._resolveRoots(asset);
	}

	public static fromAsset<TServices = unknown>(asset: VisGraphAsset): VisGraph<TServices> {
		const graph = new VisGraph<TServices>(asset);
		graph._hydrateNodes(asset.nodes ?? []);
		graph._hydrateConnections(asset.connections ?? []);
		return graph;
	}

	private _resolveRoots(asset: VisGraphAsset): string[] {
		if (asset.root) {
			return Array.isArray(asset.root) ? asset.root : [asset.root];
		}
		const incoming = new Set<string>();
		for (const connection of asset.connections ?? []) {
			incoming.add(connection.to.nodeId);
		}
		const roots = (asset.nodes ?? []).map((node) => node.id).filter((id) => !incoming.has(id));
		if (roots.length) {
			return roots;
		}
		return asset.nodes?.length ? [asset.nodes[0].id] : [];
	}

	private _hydrateNodes(nodes: VisSerializedNode[]): void {
		for (const node of nodes) {
			const definition = visNodeRegistry.getDefinition(node.type);
			if (!definition) {
				throw new Error(`Node type '${node.type}' is not registered.`);
			}
			const instance = new (definition.ctor as new () => VisRuntimeNode<TServices>)();
			instance.id = node.id;
			this._applyParameters(instance, definition.parameters, node.params ?? {});
			this._nodes.set(node.id, {
				id: node.id,
				type: node.type,
				entityId: node.entityId,
				instance,
				definition,
				literalInputs: node.inputs ?? {},
			});
		}
	}

	private _applyParameters(
		instance: VisRuntimeNode,
		parameters: VisParameterMetadata[],
		values: Record<string, unknown>,
	): void {
		for (const meta of parameters) {
			const propertyKey = meta.propertyKey as keyof VisRuntimeNode;
			const value = values[meta.id] ?? meta.defaultValue;
			if (value !== undefined) {
				(instance as any)[propertyKey] = value;
			}
		}
	}

	private _hydrateConnections(connections: VisSerializedConnection[]): void {
		for (const connection of connections) {
			if (connection.kind === "flow") {
				this._addFlowConnection(connection);
			} else {
				this._addDataConnection(connection);
			}
		}
	}

	private _addFlowConnection(connection: VisSerializedConnection): void {
		const map = this._ensureFlow(connection.from.nodeId);
		const list = map.get(connection.from.pinId) ?? [];
		list.push(connection.to.nodeId);
		map.set(connection.from.pinId, list);
	}

	private _addDataConnection(connection: VisSerializedConnection): void {
		const map = this._ensureData(connection.to.nodeId);
		const list = map.get(connection.to.pinId) ?? [];
		list.push({ nodeId: connection.from.nodeId, pinId: connection.from.pinId });
		map.set(connection.to.pinId, list);
	}

	private _ensureFlow(nodeId: string): Map<string, string[]> {
		if (!this._flowMap.has(nodeId)) {
			this._flowMap.set(nodeId, new Map());
		}
		return this._flowMap.get(nodeId)!;
	}

	private _ensureData(nodeId: string): Map<string, DataBinding[]> {
		if (!this._dataMap.has(nodeId)) {
			this._dataMap.set(nodeId, new Map());
		}
		return this._dataMap.get(nodeId)!;
	}

	public getNode(nodeId: string): VisGraphNode<TServices> {
		const node = this._nodes.get(nodeId);
		if (!node) {
			throw new Error(`Missing node '${nodeId}' in graph.`);
		}
		return node;
	}

	public getNext(nodeId: string, pinId: string): string[] {
		return [...(this._flowMap.get(nodeId)?.get(pinId) ?? [])];
	}

	public buildInputs(nodeId: string, scope: VisScope): Record<string, unknown> {
		const node = this.getNode(nodeId);
		const values: Record<string, unknown> = { ...node.literalInputs };
		const binding = this._dataMap.get(nodeId);
		if (binding) {
			for (const [pinId, sources] of binding.entries()) {
				for (const source of sources) {
					const value = scope.get(source.nodeId, source.pinId);
					if (value !== undefined) {
						values[pinId] = value;
					}
				}
			}
		}
		return values;
	}

	public listNodeIds(): string[] {
		return Array.from(this._nodes.keys());
	}
}
