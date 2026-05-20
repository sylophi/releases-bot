import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";

export type RepoState = {
  etag?: string;
  last_release_id?: number;
  last_published_at?: string;
};

export type State = {
  repos: Record<string, RepoState>;
};

const EMPTY: State = { repos: {} };

export class StateStore {
  private path: string;
  private data: State;
  private writing = false;
  private dirty = false;

  private constructor(path: string, data: State) {
    this.path = path;
    this.data = data;
  }

  static async load(path = "state.json"): Promise<StateStore> {
    const abs = resolve(path);
    try {
      const raw = await readFile(abs, "utf8");
      const parsed = JSON.parse(raw) as State;
      if (!parsed.repos || typeof parsed.repos !== "object") {
        return new StateStore(abs, { ...EMPTY });
      }
      return new StateStore(abs, parsed);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return new StateStore(abs, { ...EMPTY });
      throw err;
    }
  }

  get(repo: string): RepoState {
    return this.data.repos[repo] ?? {};
  }

  set(repo: string, next: RepoState): void {
    this.data.repos[repo] = next;
    this.dirty = true;
  }

  async flush(): Promise<void> {
    if (!this.dirty || this.writing) return;
    this.writing = true;
    this.dirty = false;
    try {
      const tmp = `${this.path}.tmp`;
      await writeFile(tmp, JSON.stringify(this.data, null, 2), "utf8");
      await rename(tmp, this.path);
    } finally {
      this.writing = false;
    }
  }
}
