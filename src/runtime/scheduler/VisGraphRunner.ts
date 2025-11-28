import { VisBlackboard, VisExecutionSignal, VisNodeExecutionContext, VisScope } from "../context";
import { VisComponentHost, VisEntityId } from "../component";
import type { VisRuntimeAdapter } from "../adapter";
import { VisGraph } from "../graph";
import type { VisFlowTransition, VisNodeExecutionResult } from "../node";
import type { VisGraphNode } from "../graph";
import type { VisPinMetadata } from "../../core/types";
import type { VisGraphLibrary } from "../library";
import { VisExecutionHandle } from "./VisExecutionHandle";

interface VisScheduledNode {
	nodeId: string;
	entityId: VisEntityId;
}

interface NodeWaiter {
	targetCount: number;
	resolve: () => void;
}

interface VisFiber {
	id: string;
	queue: VisScheduledNode[];
	entityId: VisEntityId;
}

export type FastForwardRule = (nodeId: string, nodeType: string) => boolean;

export interface VisGraphRunnerOptions<TServices = unknown> {
	entityId: VisEntityId;
	adapter?: VisRuntimeAdapter;
	componentHost?: VisComponentHost;
	scope?: VisScope;
	blackboard?: VisBlackboard;
	graphLibrary?: VisGraphLibrary;
	services?: TServices;
}

type RunnerStatus = "idle" | "running" | "completed" | "cancelled" | "failed";

/** Coordinates node execution, fibers, and lifecycle signals for a graph. */
export class VisGraphRunner<TServices = unknown> {
	private readonly _adapter: VisRuntimeAdapter;
	private readonly _scope: VisScope;
	private readonly _blackboard: VisBlackboard;
	private readonly _services: TServices;
	private readonly _signal = new VisExecutionSignal();
	private readonly _fastForwardSet = new Set<string>();
	private readonly _fastForwardRules: FastForwardRule[] = [];
	private readonly _graphs?: VisGraphLibrary;
	private readonly _completionCounts = new Map<string, number>();
	private readonly _waiters = new Map<string, Set<NodeWaiter>>();

	private _status: RunnerStatus = "idle";
	// Each fiber represents one logical execution lane (potentially parallel) spawned by the scheduler.
	private readonly _fibers = new Set<Promise<void>>();
	private _completionPromise?: Promise<void>;
	private _resolveCompletion?: () => void;
	private _fiberCounter = 0;

	public constructor(
		private readonly _graph: VisGraph<TServices>,
		private readonly _options: VisGraphRunnerOptions<TServices>,
	) {
		this._adapter = _options.adapter ?? _options.componentHost ?? new VisComponentHost();
		this._scope = _options.scope ?? new VisScope();
		this._blackboard = _options.blackboard ?? new VisBlackboard();
		this._graphs = _options.graphLibrary;
		this._services = _options.services ?? ({} as TServices);
		// Propagate cancellations immediately so waiting nodes do not hang forever.
		this._signal.subscribe((event) => {
			if (event === "cancel") {
				this._resolveAllWaiters();
			}
		});
	}

	public run(): VisExecutionHandle {
		if (this._status !== "idle") {
			return new VisExecutionHandle(this);
		}
		this._status = "running";
		this._completionPromise = new Promise((resolve) => {
			this._resolveCompletion = resolve;
		});
		// Each root spawns an independent fiber so multiple entry points can progress in parallel.
		for (const root of this._graph.roots) {
			const entityId = this._resolveEntityId(root, this._options.entityId);
			this._spawnFiber(root, entityId);
		}
		if (this._fibers.size === 0) {
			this._finish("completed");
		}
		return new VisExecutionHandle(this);
	}

	private _spawnFiber(nodeId: string, entityId: VisEntityId): Promise<void> {
		const fiber: VisFiber = {
			id: `fiber-${++this._fiberCounter}`,
			queue: [{ nodeId, entityId }],
			entityId,
		};
		// The fiber promise tracks lifecycle of a work queue; when it settles we may need to finish the graph.
		const promise = this._runFiber(fiber)
			.catch((error) => {
				console.error("VisGraphRunner fiber error", error);
				this._status = "failed";
				this._signal.cancel(String(error));
			})
			.finally(() => {
				this._fibers.delete(promise);
				if (this._fibers.size === 0) {
					const state: RunnerStatus = this._signal.cancelled
						? "cancelled"
						: this._status === "failed"
							? "failed"
							: "completed";
					this._finish(state);
				}
			});
		this._fibers.add(promise);
		return promise;
	}

	private async _runFiber(fiber: VisFiber): Promise<void> {
		// Fibers pull nodes from their queue until cancelled. Queue entries can be injected by upstream transitions.
		while (!this._signal.cancelled && fiber.queue.length) {
			const scheduled = fiber.queue.shift()!;
			const graphNode = this._graph.getNode(scheduled.nodeId);
			const entityId = scheduled.entityId ?? this._resolveEntityId(graphNode.id, fiber.entityId);
			const inputs = this._graph.buildInputs(graphNode.id, this._scope);
			const ctx = new VisNodeExecutionContext<TServices>({
				entityId,
				adapter: this._adapter,
				scope: this._scope,
				blackboard: this._blackboard,
				signal: this._signal,
				inputs,
				graphs: this._graphs,
				services: this._services,
			});
			const result = await this._invokeNode(graphNode, ctx);
			try {
				if (result.waitFor?.length) {
					// Node can block its fiber until other nodes complete (e.g., join logic).
					await this._waitForNodes(result.waitFor, result.waitForNext ?? false);
					if (this._signal.cancelled) {
						break;
					}
				}
				this._applyOutputs(graphNode.id, result.outputs);
				await this._routeTransitions(fiber, graphNode, result.transitions);
			} finally {
				this._markNodeCompleted(graphNode.id);
			}
		}
	}

	private async _routeTransitions(
		fiber: VisFiber,
		graphNode: VisGraphNode<TServices>,
		transitions?: VisFlowTransition[],
	): Promise<void> {
		const list = this._normalizeTransitions(graphNode, transitions);
		const sequential: VisScheduledNode[] = [];
		const parallelAwaitables: Promise<void>[] = [];
		for (const transition of list) {
			const targets = this._graph.getNext(graphNode.id, transition.pinId);
			if (!targets.length) {
				continue;
			}
			if (transition.strategy === "parallel") {
				for (const target of targets) {
					const entityId = this._resolveEntityId(target, fiber.entityId);
					// Parallel transitions spin up brand-new fibers so downstream work is concurrent.
					const promise = this._spawnFiber(target, entityId);
					if (transition.awaitCompletion !== false) {
						parallelAwaitables.push(promise);
					}
				}
			} else {
				for (const target of targets) {
					const entityId = this._resolveEntityId(target, fiber.entityId);
					// Sequential transitions stay in the current fiber queue so execution remains ordered.
					sequential.push({ nodeId: target, entityId });
				}
			}
		}
		if (sequential.length) {
			fiber.queue.unshift(...sequential);
		}
		if (parallelAwaitables.length) {
			await Promise.all(parallelAwaitables);
		}
	}

	private _normalizeTransitions(
		graphNode: VisGraphNode<TServices>,
		transitions?: VisFlowTransition[],
	): VisFlowTransition[] {
		const list = transitions && transitions.length ? transitions : this._defaultTransitions(graphNode);
		return list.map((transition) => {
			if (transition.strategy) {
				return transition;
			}
			const pin = graphNode.definition.pins.find(
				(p: VisPinMetadata) => p.direction === "out" && p.id === transition.pinId,
			);
			return { ...transition, strategy: pin?.strategy ?? "sequential" };
		});
	}

	private _defaultTransitions(graphNode: VisGraphNode<TServices>): VisFlowTransition[] {
		const defaultOutput = graphNode.definition.options.defaultOutput;
		if (!defaultOutput) {
			return [];
		}
		return [{ pinId: defaultOutput, strategy: "sequential" }];
	}

	private _applyOutputs(nodeId: string, outputs?: Record<string, unknown>): void {
		if (!outputs) {
			return;
		}
		for (const [pinId, value] of Object.entries(outputs)) {
			this._scope.set(nodeId, pinId, value);
		}
	}

	private async _invokeNode(
		node: VisGraphNode,
		ctx: VisNodeExecutionContext,
	): Promise<VisNodeExecutionResult> {
		if (this._shouldFastForward(node.id, node.type)) {
			return node.instance.onFastForward(ctx);
		}
		return node.instance.execute(ctx);
	}

	private _resolveEntityId(nodeId: string, fallback: VisEntityId): VisEntityId {
		const node = this._graph.getNode(nodeId);
		return node.entityId ?? fallback;
	}

	public fastForwardNode(nodeId: string): void {
		this._fastForwardSet.add(nodeId);
	}

	public fastForwardWhere(rule: FastForwardRule): void {
		this._fastForwardRules.push(rule);
	}

	private _shouldFastForward(nodeId: string, nodeType: string): boolean {
		if (this._fastForwardSet.has(nodeId)) {
			return true;
		}
		return this._fastForwardRules.some((rule) => rule(nodeId, nodeType));
	}

	private async _waitForNodes(nodeIds: string[], waitForNext: boolean): Promise<void> {
		const promises: Promise<void>[] = [];
		for (const nodeId of nodeIds) {
			// Validate node existence early for clearer errors.
			this._graph.getNode(nodeId);
			const promise = this._waitForNode(nodeId, waitForNext);
			if (promise) {
				// Each promise resolves when the node hits the requested completion count.
				promises.push(promise);
			}
		}
		if (promises.length) {
			await Promise.all(promises);
		}
	}

	private _waitForNode(nodeId: string, waitForNext: boolean): Promise<void> | undefined {
		const completed = this._completionCounts.get(nodeId) ?? 0;
		const targetCount = waitForNext ? completed + 1 : 1;
		if (!waitForNext && completed >= targetCount) {
			return undefined;
		}
		if (waitForNext && completed >= targetCount) {
			return undefined;
		}
		return new Promise<void>((resolve) => {
			const waiter: NodeWaiter = { targetCount, resolve };
			if (!this._waiters.has(nodeId)) {
				this._waiters.set(nodeId, new Set());
			}
			this._waiters.get(nodeId)!.add(waiter);
		});
	}

	private _markNodeCompleted(nodeId: string): void {
		const nextCount = (this._completionCounts.get(nodeId) ?? 0) + 1;
		this._completionCounts.set(nodeId, nextCount);
		const waiters = this._waiters.get(nodeId);
		if (!waiters || !waiters.size) {
			return;
		}
		for (const waiter of Array.from(waiters)) {
			if (nextCount >= waiter.targetCount) {
				waiters.delete(waiter);
				waiter.resolve();
			}
		}
		if (!waiters.size) {
			this._waiters.delete(nodeId);
		}
	}

	private _resolveAllWaiters(): void {
		// Cancellation tears down every outstanding waiter so blocked fibers can unwind quickly.
		for (const waiters of this._waiters.values()) {
			for (const waiter of waiters) {
				waiter.resolve();
			}
		}
		this._waiters.clear();
	}

	public async awaitCompletion(): Promise<void> {
		if (!this._completionPromise) {
			return;
		}
		await this._completionPromise;
	}

	public cancel(reason?: string): void {
		if (this._status === "cancelled") {
			return;
		}
		this._signal.cancel(reason);
		if (this._fibers.size === 0) {
			this._finish("cancelled");
		}
	}

	private _finish(state: RunnerStatus): void {
		if (this._status === "completed" || this._status === "failed" || this._status === "cancelled") {
			if (this._resolveCompletion) {
				this._resolveCompletion();
				this._resolveCompletion = undefined;
			}
			return;
		}
		this._status = state;
		if (this._resolveCompletion) {
			this._resolveCompletion();
			this._resolveCompletion = undefined;
		}
	}

	public getStatus(): RunnerStatus {
		return this._status;
	}

	public getScopeSnapshot(): Record<string, unknown> {
		return this._scope.snapshot();
	}
}
