import type {
	VisActionOptions,
	VisComponentConstructor,
	VisParameterMetadata,
	VisParameterOptions,
	VisPinDirection,
	VisPinMetadata,
	VisPinOptions,
} from "./types";

const nodeMetadata = new WeakMap<object, {
	pins: Map<string | symbol, VisPinMetadata>;
	parameters: Map<string | symbol, VisParameterMetadata>;
}>();

const componentActions = new WeakMap<VisComponentConstructor, Map<string | symbol, VisActionOptions>>();

function ensureNodeBag(target: object) {
	if (!nodeMetadata.has(target)) {
		nodeMetadata.set(target, {
			pins: new Map(),
			parameters: new Map(),
		});
	}
	return nodeMetadata.get(target)!;
}

function getCtor(target: object): object {
	return typeof target === "function" ? target : target.constructor;
}

export function addPinMetadata(
	target: object,
	propertyKey: string | symbol,
	direction: VisPinDirection,
	options: VisPinOptions,
) {
	const ctor = getCtor(target);
	const bag = ensureNodeBag(ctor);
	const existing = bag.pins.get(propertyKey);
	const metadata: VisPinMetadata = {
		direction,
		propertyKey,
		signal: options.signal ?? "flow",
		strategy: options.strategy ?? (direction === "out" ? "sequential" : undefined),
		id: options.id,
		label: options.label ?? options.id,
		description: options.description,
		dataType: options.dataType,
		required: options.required,
	};
	bag.pins.set(propertyKey, existing ? { ...existing, ...metadata } : metadata);
}

export function addParameterMetadata(
	target: object,
	propertyKey: string | symbol,
	options: VisParameterOptions,
) {
	const ctor = getCtor(target);
	const bag = ensureNodeBag(ctor);
	const metadata: VisParameterMetadata = {
		propertyKey,
		id: options.id,
		label: options.label ?? options.id,
		description: options.description,
		dataType: options.dataType,
		required: options.required,
		defaultValue: options.defaultValue,
	};
	bag.parameters.set(propertyKey, metadata);
}

export function readPinMetadata(ctor: object): VisPinMetadata[] {
	const bag = nodeMetadata.get(ctor);
	if (!bag) {
		return [];
	}
	return Array.from(bag.pins.values());
}

export function readParameterMetadata(ctor: object): VisParameterMetadata[] {
	const bag = nodeMetadata.get(ctor);
	if (!bag) {
		return [];
	}
	return Array.from(bag.parameters.values());
}

export function addComponentActionMetadata(
	target: object,
	propertyKey: string | symbol,
	options: VisActionOptions = {},
) {
	const ctor = (typeof target === "function" ? target : target.constructor) as VisComponentConstructor;
	if (!componentActions.has(ctor)) {
		componentActions.set(ctor, new Map());
	}
	const map = componentActions.get(ctor)!;
	map.set(propertyKey, { ...options });
}

export function consumeComponentActionMetadata(
	ctor: VisComponentConstructor,
): Map<string | symbol, VisActionOptions> {
	const map = componentActions.get(ctor);
	if (!map) {
		return new Map();
	}
	return new Map(map);
}
