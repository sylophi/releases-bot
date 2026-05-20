export type Release = {
  id: number;
  tag_name: string;
  name: string | null;
  html_url: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  created_at: string;
  author: {
    login: string;
    avatar_url: string;
    html_url: string;
  } | null;
};

export type Repo = {
  full_name: string;
  html_url: string;
  description: string | null;
  owner: { login: string; avatar_url: string };
};

export type PollResult =
  | { kind: "not_modified"; etag: string | undefined }
  | { kind: "ok"; etag: string | undefined; releases: Release[] };

const API = "https://api.github.com";
const UA = "releases-bot (https://github.com)";

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": UA,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function fetchReleases(
  repo: string,
  etag: string | undefined,
): Promise<PollResult> {
  const headers = authHeaders();
  if (etag) headers["If-None-Match"] = etag;

  const res = await fetch(`${API}/repos/${repo}/releases?per_page=10`, { headers });
  const nextEtag = res.headers.get("etag") ?? undefined;

  if (res.status === 304) {
    return { kind: "not_modified", etag: nextEtag ?? etag };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status} for ${repo}: ${body.slice(0, 200)}`);
  }
  const releases = (await res.json()) as Release[];
  return { kind: "ok", etag: nextEtag, releases };
}

export async function fetchRepo(repo: string): Promise<Repo> {
  const res = await fetch(`${API}/repos/${repo}`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status} for ${repo}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as Repo;
}
