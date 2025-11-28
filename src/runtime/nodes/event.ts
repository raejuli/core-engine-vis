import { VisNode, VisInput, VisParameter } from "../../core/decorators";
import type { VisNodeExecutionContext } from "../context";
import { VisNodeResult, VisRuntimeNode } from "../node";
import type { VisNodeExecutionResult } from "../node";
import { VisGraphRunner } from "../scheduler";
import { VisBlackboard, VisScope } from "../context";
import type { VisGraphLibrary } from "../library";

interface VisEventGateway {
	on(eventName: string, listener: (payload: unknown) => void): (() => void) | void;
}

function isGateway(candidate: unknown): candidate is VisEventGateway {
	return (
		!!candidate &&
		typeof candidate === "object" &&
		typeof (candidate as VisEventGateway).on === "function"
	);
}

function resolveGateway(services: unknown, key?: string): VisEventGateway | undefined {
	if (!services) {
		return undefined;
	}
	if (isGateway(services)) {
		return services;
	}
	if (typeof services !== "object") {
		return undefined;
	}
	if (key && key in services) {
		const value = (services as Record<string, unknown>)[key];
		if (isGateway(value)) {
			return value;
		}
	}
	const fallback = (services as Record<string, unknown>).events;
	if (isGateway(fallback)) {
		return fallback;
	}
	return undefined;
}

@VisNode({
	type: "vis.event.on",
	label: "On Event",
	description: "Subscribes to an event gateway and spawns a graph for each emission.",
})
/** Subscribes to an external event gateway and runs a graph every time the event fires. */
export class VisOnEventNode extends VisRuntimeNode {
	@VisInput({ id: "event", signal: "data", label: "Event" })
	public eventInput?: string;

	@VisInput({ id: "graph", signal: "data", label: "Graph" })
	public graphInput?: string;

	@VisInput({ id: "entity", signal: "data", label: "Entity" })
	public entityInput?: string;

	@VisParameter({ id: "eventName", dataType: "string", required: true })
	public eventName!: string;

	@VisParameter({ id: "graphId", dataType: "string", required: true })
	public graphId!: string;

	@VisParameter({ id: "serviceKey", dataType: "string", defaultValue: "events" })
	public serviceKey = "events";

	@VisParameter({ id: "payloadVariable", dataType: "string" })
	public payloadVariable?: string;

	@VisParameter({ id: "awaitCompletion", dataType: "boolean", defaultValue: true })
	public awaitCompletion = true;

	@VisParameter({ id: "shareBlackboard", dataType: "boolean", defaultValue: false })
	public shareBlackboard = false;

	@VisParameter({ id: "targetEntity", dataType: "string" })
	public targetEntity?: string;

	protected async _onExecute(ctx: VisNodeExecutionContext): Promise<VisNodeExecutionResult> {
		if (!ctx.graphs) {
			return VisNodeResult.failure("OnEvent node requires a graph library to spawn handlers.");
		}
		const gateway = resolveGateway(ctx.services, this.serviceKey);
		if (!gateway) {
			return VisNodeResult.failure("OnEvent node could not resolve an event gateway from services.");
		}
		const eventName = ctx.getInput("event", this.eventInput) ?? this.eventName;
		if (!eventName) {
			return VisNodeResult.failure("OnEvent node missing event name.");
		}
		const graphId = ctx.getInput("graph", this.graphInput) ?? this.graphId;
		if (!graphId) {
			return VisNodeResult.failure("OnEvent node missing graph id.");
		}
		const baseEntity = ctx.getInput("entity", this.entityInput) ?? this.targetEntity ?? ctx.entityId;
		const unsubscribe = gateway.on(eventName, (payload: unknown) =>
			this._handleEvent(ctx, ctx.graphs!, graphId, baseEntity, payload),
		);

		await new Promise<void>((resolve) => {
			const dispose = ctx.signal.subscribe((event) => {
				if (event === "cancel") {
					if (typeof unsubscribe === "function") {
						unsubscribe();
					}
					dispose();
					resolve();
				}
			});
		});

		return VisNodeResult.cancelled();
	}

	private async _handleEvent(
		ctx: VisNodeExecutionContext,
		graphs: VisGraphLibrary,
		graphId: string,
		entityId: string,
		payload: unknown,
	): Promise<void> {
		try {
			const graph = graphs.instantiate(graphId);
			const scope = new VisScope();
			const blackboard = this.shareBlackboard ? ctx.blackboard : new VisBlackboard();
			if (this.payloadVariable) {
				if (this.shareBlackboard) {
					ctx.setVariable(this.payloadVariable, payload);
				} else {
					blackboard.set(this.payloadVariable, payload);
				}
			}
			const runner = new VisGraphRunner(graph, {
				entityId,
				adapter: ctx.adapter,
				scope,
				blackboard,
				graphLibrary: graphs,
				services: ctx.services,
			});
			const handle = runner.run();
			if (this.awaitCompletion) {
				await handle.awaitCompletion();
			} else {
				handle.awaitCompletion().catch(() => undefined);
			}
		} catch (error) {
			console.error("VisOnEventNode handler error", error);
		}
	}
}
