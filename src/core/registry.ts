import type {
	VisActionDefinition,
	VisComponentConstructor,
	VisComponentDefinition,
	VisComponentOptions,
	VisNodeConstructor,
	VisNodeDefinition,
	VisNodeOptions,
	VisParameterMetadata,
	VisPinMetadata,
} from "./types";

function normalizeNodeDefinition(
	ctor: VisNodeConstructor,
	options: VisNodeOptions,
	pins: VisPinMetadata[],
	parameters: VisParameterMetadata[],
): VisNodeDefinition {
	return {
		ctor,
		options,
		pins: [...pins],
		parameters: [...parameters],
	};
}

export class VisNodeRegistry {
	private readonly _definitions = new Map<string, VisNodeDefinition>();

	public register(
		ctor: VisNodeConstructor,
		options: VisNodeOptions,
		pins: VisPinMetadata[],
		parameters: VisParameterMetadata[],
	) {
		if (this._definitions.has(options.type)) {
			throw new Error(`VisNode type '${options.type}' already registered.`);
		}
		const definition = normalizeNodeDefinition(ctor, options, pins, parameters);
		this._definitions.set(options.type, definition);
	}

	public getDefinition(type: string): VisNodeDefinition | undefined {
		return this._definitions.get(type);
	}

	public getAll(): VisNodeDefinition[] {
		return Array.from(this._definitions.values());
	}
}

export const visNodeRegistry = new VisNodeRegistry();

function normalizeActionDefinition(action: VisActionDefinition): VisActionDefinition {
	return {
		...action,
		parameters: action.parameters ?? [],
	};
}

export class VisComponentRegistry {
	private readonly _components = new Map<string, VisComponentDefinition>();
	private readonly _byCtor = new Map<VisComponentConstructor, VisComponentDefinition>();

	public register(
		ctor: VisComponentConstructor,
		options: VisComponentOptions,
		actions: VisActionDefinition[],
	) {
		if (this._components.has(options.type)) {
			throw new Error(`VisComponent type '${options.type}' already registered.`);
		}
		const definition: VisComponentDefinition = {
			ctor,
			options,
			actions: actions.map(normalizeActionDefinition),
		};
		this._components.set(options.type, definition);
		this._byCtor.set(ctor, definition);
	}

	public getDefinition(type: string): VisComponentDefinition | undefined {
		return this._components.get(type);
	}

	public getAll(): VisComponentDefinition[] {
		return Array.from(this._components.values());
	}

	public getByConstructor(ctor: VisComponentConstructor): VisComponentDefinition | undefined {
		return this._byCtor.get(ctor);
	}
}

export const visComponentRegistry = new VisComponentRegistry();
