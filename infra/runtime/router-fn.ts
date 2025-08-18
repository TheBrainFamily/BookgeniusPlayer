// CloudFront Function (runtime: JS_2_0). No imports/exports.
// Must define global function `handler(event)` and return a request/response.
// Uses modern TS/JS, compiled to plain JS (no module wrapper).

function handler(event: any) {
    const req = event.request;
    const host: string = (req.headers && req.headers.host && req.headers.host.value) || '';
    const qs: Record<string, { value: string }> = req.querystring || {};
    let uri: string = req.uri || '/';

    const qsVal = (k: string) => (qs[k] && qs[k].value) || undefined;
    const norm = (u: string) => (!u || u === '' ? '/' : u.charAt(0) === '/' ? u : `/${u}`);
    const hasExt = /\.[A-Za-z0-9]{1,8}(\?|$)/.test(uri);

    // subdomain detection
    const parts = host.split('.');
    const sub = parts.length > 2 ? parts[0] : '';         // e.g. pr-394.example.com -> pr-394
    const reserved: Record<string, true> = { www: true, api: true, cdn: true };
    const isBranch = /^pr-/.test(sub);
    const isBookSlugSub = !!sub && !reserved[sub] && !isBranch;

    // SEO entry: <slug>.<apex> -> 301 to apex /player/?book=<slug>
    if (isBookSlugSub) {
        const apex = host.replace(new RegExp(`^${sub}\\.`), '');
        return {
            statusCode: 301,
            statusDescription: 'Moved Permanently',
            headers: { location: { value: `https://${apex}/player/?book=${encodeURIComponent(sub)}` } }
        };
    }

    // Choose platform base (prod or branch)
    const branch = isBranch ? sub : '';
    const platformBase = branch ? `/app/platform/branches/${branch}` : '/app/platform/prod';

    // Choose player build base
    const playerCtx = qsVal('playerctx'); // ex: "branches/pr-394" or "prod"
    let playerBase: string;
    if (playerCtx && /^branches\//.test(playerCtx)) {
        playerBase = `/app/player/${playerCtx}`;
    } else if (branch) {
        playerBase = `/app/player/branches/${branch}`;
    } else {
        playerBase = '/app/player/prod';
    }

    // Route /player|/reader vs everything else
    const isPlayer = /^\/(player|reader)(\/|$)/.test(uri);
    let tail = isPlayer ? uri.replace(/^\/(player|reader)/, '') : uri;
    tail = norm(tail);

    if (isPlayer) {
        req.uri = !hasExt || tail === '/' ? `${playerBase}/index.html` : `${playerBase}${tail}`;
    } else {
        req.uri = !hasExt || uri === '/' ? `${platformBase}/index.html` : `${platformBase}${uri}`;
    }
    return req;
}