export type VisPinDirection = "in" | "out";
export type VisPinSignal = "flow" | "data";
export type VisFlowStrategy = "sequential" | "parallel";
export type VisNodeStatus = "idle" | "running" | "success" | "failure" | "skipped";

export interface VisPinOptions {
	id: string;
	label?: string;
	description?: string;
	signal?: VisPinSignal;
	strategy?: VisFlowStrategy;
	dataType?: string;
	required?: boolean;
}

export interface VisPinMetadata extends VisPinOptions {
	direction: VisPinDirection;
	propertyKey: string | symbol;
}

export interface VisParameterOptions {
	id: string;
	label?: string;
	description?: string;
	dataType?: string;
	required?: boolean;
	defaultValue?: unknown;
}

export interface VisParameterMetadata extends VisParameterOptions {
	propertyKey: string | symbol;
}

export interface VisNodeOptions {
	type: string;
	label?: string;
	description?: string;
	category?: string;
	icon?: string;
	defaultOutput?: string;
}

export interface VisNodeDefinition {
	options: VisNodeOptions;
	ctor: VisNodeConstructor;
	pins: VisPinMetadata[];
	parameters: VisParameterMetadata[];
}

export type VisNodeConstructor<T = unknown> = new () => T;

export interface VisActionParameter {
	id: string;
	label?: string;
	description?: string;
	dataType?: string;
	required?: boolean;
	defaultValue?: unknown;
}

export interface VisActionOptions {
	id?: string;
	label?: string;
	description?: string;
	parameters?: VisActionParameter[];
}

export interface VisActionDefinition extends Required<Pick<VisActionOptions, "id" | "label">> {
	description?: string;
	parameters: VisActionParameter[];
	methodName: string;
}

export interface VisComponentOptions {
	type: string;
	label?: string;
	description?: string;
}

export interface VisComponentDefinition {
	options: VisComponentOptions;
	ctor: VisComponentConstructor;
	actions: VisActionDefinition[];
}

export type VisComponentConstructor<T = unknown> = new (...args: any[]) => T;
