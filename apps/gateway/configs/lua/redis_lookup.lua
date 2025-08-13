local M = {}

local function connect()
  local redis = require "resty.redis"
  local r = redis:new()
  r:set_timeout(200)
  assert(r:connect(os.getenv("REDIS_HOST") or "redis", tonumber(os.getenv("REDIS_PORT") or "6379")))
  local p = os.getenv("REDIS_PASSWORD")
  if p and #p > 0 then assert(r:auth(p)) end
  return r
end

function M.set_upstream(suffix)
  local r = connect()
  local key = ngx.var.host .. ":" .. suffix
  local val = r:get(key)
  if (not val) or (val == ngx.null) then
    return ngx.exit(404)
  end
  ngx.var.upstream = val
  r:set_keepalive(10000, 50)
end

return M
