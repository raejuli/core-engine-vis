import { VisAction, VisComponent } from "../../core/decorators";
import type { VisRuntimeAdapter } from "../adapter";
import type { VisGraphLibrary } from "../library";
import { VisGraphRunner } from "../scheduler";
import { VisBlackboard, VisScope } from "../context";
import type { VisEntityId } from "./types";
import type { VisExecutionHandle } from "../scheduler";

export interface VisSequencerComponentOptions<TServices = unknown> {
	entityId: VisEntityId;
	adapter: VisRuntimeAdapter;
	graphLibrary: VisGraphLibrary;
	services?: TServices;
	graphId?: string;
	playOnLoad?: boolean;
	shareBlackboard?: boolean;
}

@VisComponent({ type: "vis.sequencer", label: "VIS Sequencer" })
/** Boots the VIS runtime for an entity and runs graphs on demand. */
export class VisSequencerComponent<TServices = unknown> {
	private readonly _adapter: VisRuntimeAdapter;
	private readonly _graphLibrary: VisGraphLibrary;
	private readonly _services?: TServices;
	private readonly _entityId: VisEntityId;
	private readonly _shareBlackboard: boolean;

	private _defaultGraphId?: string;
	private _blackboard = new VisBlackboard();
	private _currentHandle?: VisExecutionHandle;
	private _lastRun?: Promise<void>;

	public constructor(private readonly _options: VisSequencerComponentOptions<TServices>) {
		this._adapter = _options.adapter;
		this._graphLibrary = _options.graphLibrary;
		this._services = _options.services;
		this._entityId = _options.entityId;
		this._defaultGraphId = _options.graphId;
		this._shareBlackboard = _options.shareBlackboard ?? true;
		if (_options.playOnLoad && this._defaultGraphId) {
			void this.play();
		}
	}

	/** Returns a promise that resolves when the most recent run completes. */
	public get lastRun(): Promise<void> | undefined {
		return this._lastRun;
	}

	@VisAction({
		id: "setGraph",
		label: "Set Graph",
		parameters: [{ id: "graphId", label: "Graph Id", required: true }],
	})
	public setGraph(graphId: string): void {
		this._defaultGraphId = graphId;
	}

	@VisAction({
		id: "play",
		label: "Play",
		parameters: [{ id: "graphId", label: "Graph Id" }],
	})
	public async play(graphId?: string): Promise<void> {
		const target = graphId ?? this._defaultGraphId;
		if (!target) {
			throw new Error("VisSequencerComponent has no graph id to play.");
		}
		this._defaultGraphId = target;
		await this._startRun(target);
	}

	@VisAction({ id: "stop", label: "Stop" })
	public stop(reason = "stop"): void {
		if (this._currentHandle) {
			this._currentHandle.cancel(reason);
			this._currentHandle = undefined;
		}
	}

	private async _startRun(graphId: string): Promise<void> {
		this.stop("restart");
		const graph = this._graphLibrary.instantiate(graphId);
		const scope = new VisScope();
		const blackboard = this._shareBlackboard ? this._blackboard : new VisBlackboard();
		const runner = new VisGraphRunner(graph, {
			entityId: this._entityId,
			adapter: this._adapter,
			scope,
			blackboard,
			graphLibrary: this._graphLibrary,
			services: this._services,
		});
		const handle = runner.run();
		this._currentHandle = handle;
		const completion = handle.awaitCompletion().finally(() => {
			if (this._currentHandle === handle) {
				this._currentHandle = undefined;
			}
		});
		this._lastRun = completion;
		await completion;
	}
}
