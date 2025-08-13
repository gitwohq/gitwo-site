// functions/api/stars.js
export async function onRequestGet(context) {
  const DEFAULT_REPO = "gitwohq/gitwo";
  const req = context.request;
  const url = new URL(req.url);
  const repo = url.searchParams.get("repo") || DEFAULT_REPO;

  const apiURL = `https://api.github.com/repos/${repo}`;

  // Use repo in the cache key so you can query other repos in the future.
  const cache = caches.default;
  // Roll cache key every 6h so counts refresh predictably
  const bucket = Math.floor(Date.now() / (6 * 60 * 60 * 1000));
  const cacheKey = new Request(
    `https://edge-cache/git-stars?repo=${encodeURIComponent(repo)}&b=${bucket}`
  );

  // Serve from edge cache if present
  let cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, { headers: cached.headers });

  // Fetch from GitHub (unauthenticated is fine for this tiny use case)
  let count = 0;
  try {
    const gh = await fetch(apiURL, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "gitwo-stars"
        // Optionally add a GH token to raise rate limits:
        // "Authorization": `Bearer ${context.env.GITHUB_TOKEN}`
      }
    });
    if (!gh.ok) throw new Error(`GitHub ${gh.status}`);
    const data = await gh.json();
    count = data?.stargazers_count ?? 0;
  } catch (e) {
    // If GitHub fails and we had no cache, respond with 0 (UI will still show something).
    count = 0;
  }

  const body = JSON.stringify({ count });

  // Cache at the edge for 6h. Browsers can still cache briefly if you want (add max-age).
  const res = new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "Cache-Control": "s-maxage=21600" // 6h at Cloudflare edge
    }
  });

  // Store in edge cache (async)
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

