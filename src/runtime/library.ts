import type { VisGraphAsset } from "./graph";
import { VisGraph } from "./graph";

/** In-memory registry of graph assets that can be instantiated on demand. */
export class VisGraphLibrary {
	private readonly _assets = new Map<string, VisGraphAsset>();

	public register(asset: VisGraphAsset): void {
		this._assets.set(asset.id, asset);
	}

	public registerMany(assets: VisGraphAsset[]): void {
		for (const asset of assets) {
			this.register(asset);
		}
	}

	public has(id: string): boolean {
		return this._assets.has(id);
	}

	public getAsset(id: string): VisGraphAsset {
		const asset = this._assets.get(id);
		if (!asset) {
			throw new Error(`VisGraphLibrary: graph '${id}' is not registered.`);
		}
		return asset;
	}

	public instantiate(id: string): VisGraph {
		return VisGraph.fromAsset(this.getAsset(id));
	}

	public list(): VisGraphAsset[] {
		return Array.from(this._assets.values());
	}
}
