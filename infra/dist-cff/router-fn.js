function handler(event) {
    const req = event.request;
    const host = (req.headers && req.headers.host && req.headers.host.value) || "";
    const qs = req.querystring || {};
    const uri = req.uri || "/";
    if (uri.startsWith("/api/")) {
        req.headers = req.headers || {};
        req.headers["x-viewer-host"] = { value: host };
        req.uri = uri.replace(/^\/api/, "") || "/";
        return req;
    }
    const qsVal = (k) => (qs[k] && qs[k].value) || undefined;
    const norm = (u) => (!u || u === "" ? "/" : u.charAt(0) === "/" ? u : `/${u}`);
    const hasExt = /\.[A-Za-z0-9]{1,8}(\?|$)/.test(uri);
    const parts = host.split(".");
    const sub = parts.length > 2 ? parts[0] : "";
    const second = parts.length > 3 ? parts[1] : "";
    const isBranchesDomain = second === "branches";
    const branch = isBranchesDomain && sub ? sub : "";
    const reserved = { www: true, api: true, cdn: true, branches: true };
    const isBookSlugSub = !isBranchesDomain && !!sub && !reserved[sub];
    if (isBookSlugSub) {
        const apex = host.replace(new RegExp(`^${sub}\\.`), "");
        return { statusCode: 301, statusDescription: "Moved Permanently", headers: { location: { value: `https://${apex}/player/?book=${encodeURIComponent(sub)}` } }, cookies: {} };
    }
    const platformBase = branch ? `/app/platform/branches/${branch}` : "/app/platform/prod";
    const playerCtx = qsVal("playerctx");
    let playerBase;
    if (playerCtx && /^branches\//.test(playerCtx)) {
        playerBase = `/app/player/${playerCtx}`;
    }
    else if (branch) {
        playerBase = `/app/player/branches/${branch}`;
    }
    else {
        playerBase = "/app/player/prod";
    }
    const isPlayer = /^\/(player|reader)(\/|$)/.test(uri);
    let tail = isPlayer ? uri.replace(/^\/(player|reader)/, "") : uri;
    tail = norm(tail);
    if (isPlayer) {
        req.uri = !hasExt || tail === "/" ? `${playerBase}/index.html` : `${playerBase}${tail}`;
    }
    else {
        req.uri = !hasExt || uri === "/" ? `${platformBase}/index.html` : `${platformBase}${uri}`;
    }
    return req;
}
