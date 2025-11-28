import type { VisEntityId } from "./component/types";

export interface VisRuntimeEntity {
	readonly id: VisEntityId;
	getComponent<T>(componentType: string): T | undefined;
	invokeAction(componentType: string, actionId: string, args: unknown[]): Promise<unknown>;
}

export interface VisRuntimeAdapter {
	getEntity(entityId: VisEntityId): VisRuntimeEntity;
	getComponent<T>(entityId: VisEntityId, componentType: string): T | undefined;
	invokeAction(entityId: VisEntityId, componentType: string, actionId: string, args: unknown[]): Promise<unknown>;
	attachComponent?<T>(entityId: VisEntityId, component: T, componentType?: string): void;
	listComponents?(entityId: VisEntityId): string[];
}
