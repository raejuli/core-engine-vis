import { visComponentRegistry } from "../../core/registry";
import type { VisComponentConstructor } from "../../core/types";
import type { VisRuntimeAdapter, VisRuntimeEntity } from "../adapter";
import type { VisEntityId } from "./types";

/** Manages component instances per entity and orchestrates action invocation. */
export class VisComponentHost implements VisRuntimeAdapter {
	private readonly _components = new Map<VisEntityId, Map<string, unknown>>();

	private _ensureEntity(entityId: VisEntityId): Map<string, unknown> {
		if (!this._components.has(entityId)) {
			this._components.set(entityId, new Map());
		}
		return this._components.get(entityId)!;
	}

	private _resolveComponentType(instance: unknown): string | undefined {
		if (!instance) {
			return undefined;
		}
		const ctor = instance.constructor as VisComponentConstructor;
		const definition = visComponentRegistry.getByConstructor(ctor);
		return definition?.options.type;
	}

	public attachComponent<T>(entityId: VisEntityId, component: T, componentType?: string): void {
		const registryType = componentType ?? this._resolveComponentType(component);
		if (!registryType) {
			throw new Error("Component type must be provided or decorated with @VisComponent.");
		}
		const bucket = this._ensureEntity(entityId);
		bucket.set(registryType, component);
	}

	public getComponent<T>(entityId: VisEntityId, componentType: string): T | undefined {
		return this._components.get(entityId)?.get(componentType) as T | undefined;
	}

	public async invokeAction(
		entityId: VisEntityId,
		componentType: string,
		actionId: string,
		args: unknown[],
	): Promise<unknown> {
		const definition = visComponentRegistry.getDefinition(componentType);
		if (!definition) {
			throw new Error(`Component type '${componentType}' is not registered.`);
		}
		const action = definition.actions.find((candidate) => candidate.id === actionId || candidate.methodName === actionId);
		if (!action) {
			throw new Error(`Component type '${componentType}' does not expose action '${actionId}'.`);
		}
		const bucket = this._components.get(entityId);
		if (!bucket || !bucket.has(componentType)) {
			throw new Error(`Entity '${entityId}' does not contain component '${componentType}'.`);
		}
		const instance = bucket.get(componentType) as Record<string, any>;
		const method = instance[action.methodName];
		if (typeof method !== "function") {
			throw new Error(`Component '${componentType}' is missing method '${action.methodName}'.`);
		}
		const result = method.apply(instance, args);
		return result instanceof Promise ? result : Promise.resolve(result);
	}

	public listComponents(entityId: VisEntityId): string[] {
		return Array.from(this._components.get(entityId)?.keys() ?? []);
	}

	public getEntity(entityId: VisEntityId): VisRuntimeEntity {
		return {
			id: entityId,
			getComponent: <T>(componentType: string) => this.getComponent<T>(entityId, componentType),
			invokeAction: (componentType: string, actionId: string, args: unknown[]) =>
				this.invokeAction(entityId, componentType, actionId, args),
		};
	}
}
