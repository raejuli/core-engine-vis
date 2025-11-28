import {
	addComponentActionMetadata,
	addParameterMetadata,
	addPinMetadata,
	consumeComponentActionMetadata,
	readParameterMetadata,
	readPinMetadata,
} from "./metadata";
import { visComponentRegistry, visNodeRegistry } from "./registry";
import type {
	VisActionDefinition,
	VisActionOptions,
	VisComponentConstructor,
	VisComponentOptions,
	VisNodeConstructor,
	VisNodeOptions,
	VisParameterOptions,
	VisPinOptions,
} from "./types";

export function VisInput(options: VisPinOptions): PropertyDecorator {
	return (target, propertyKey) => {
		addPinMetadata(target, propertyKey, "in", options);
	};
}

export function VisOutput(options: VisPinOptions): PropertyDecorator {
	return (target, propertyKey) => {
		addPinMetadata(target, propertyKey, "out", options);
	};
}

export function VisParameter(options: VisParameterOptions): PropertyDecorator {
	return (target, propertyKey) => {
		addParameterMetadata(target, propertyKey, options);
	};
}

export function VisNode(options: VisNodeOptions): ClassDecorator {
	return (target) => {
		const ctor = target as unknown as VisNodeConstructor;
		const pins = readPinMetadata(ctor);
		const parameters = readParameterMetadata(ctor);
		visNodeRegistry.register(ctor, options, pins, parameters);
	};
}

function buildActionDefinitions(
	ctor: VisComponentConstructor,
	decorated: Map<string | symbol, VisActionOptions>,
): VisActionDefinition[] {
	const byMethod = new Map<string, VisActionDefinition>();
	let proto = ctor.prototype;
	while (proto && proto !== Object.prototype) {
		for (const name of Object.getOwnPropertyNames(proto)) {
			if (name === "constructor") {
				continue;
			}
			const descriptor = Object.getOwnPropertyDescriptor(proto, name);
			if (!descriptor || typeof descriptor.value !== "function") {
				continue;
			}
			if (name.startsWith("_")) {
				continue;
			}
			const options = decorated.get(name) ?? {};
			const id = options.id ?? name;
			const label = options.label ?? name;
			const action: VisActionDefinition = {
				id,
				label,
				description: options.description,
				methodName: name,
				parameters: options.parameters ?? [],
			};
			byMethod.set(name, action);
		}
		proto = Object.getPrototypeOf(proto);
	}
	return Array.from(byMethod.values());
}

export function VisComponent(options: VisComponentOptions): ClassDecorator {
	return (target) => {
		const ctor = target as unknown as VisComponentConstructor;
		const decorated = consumeComponentActionMetadata(ctor);
		const actions = buildActionDefinitions(ctor, decorated);
		visComponentRegistry.register(ctor, options, actions);
	};
}

export function VisAction(options: VisActionOptions = {}): MethodDecorator {
	return (target, propertyKey, descriptor: PropertyDescriptor | undefined) => {
		addComponentActionMetadata(target, propertyKey, options);
		return descriptor;
	};
}
