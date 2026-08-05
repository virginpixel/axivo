// Axivo host agent.
//
// A tiny privileged helper reachable ONLY from the web container over the
// internal Docker network, gated by a shared secret. It performs the two
// host-level operations the app can't do itself:
//   POST /update          - one-click, data-preserving version update
//   POST /tunnel/enable    - turn on Cloudflare Tunnel remote access + HTTPS
//   POST /tunnel/disable   - turn it back off (local HTTP only)
// Data lives in named volumes, so updates preserve it. The agent never touches
// its own container, so a task it runs cannot kill it mid-flight.
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";

const SECRET = process.env.AGENT_SECRET || "";
const PORT = Number(process.env.AGENT_PORT || 8099);
const DIR = process.env.AXIVO_INSTALL_DIR || "/opt/axivo";
const ENV_FILE = `${DIR}/.env`;
const COMPOSE = `docker compose -f ${DIR}/docker-compose.prod.yml --env-file ${ENV_FILE}`;

let running = false;
let log = [];

/** Read one value out of the .env file. */
function getEnvVar(key) {
  try {
    const line = fs
      .readFileSync(ENV_FILE, "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1) : "";
  } catch {
    return "";
  }
}

/** Set/replace keys in the .env file, preserving the rest. */
function setEnvVars(updates) {
  let lines = [];
  try {
    lines = fs.readFileSync(ENV_FILE, "utf8").split("\n");
  } catch {
    /* new file */
  }
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (idx >= 0) lines[idx] = line;
    else lines.push(line);
  }
  fs.writeFileSync(ENV_FILE, lines.join("\n"));
}

/** Run a shell script in the background, capturing its output into `log`. */
function runTask(script) {
  running = true;
  log = [];
  const child = spawn("sh", ["-c", script]);
  const capture = (buf) => {
    log.push(buf.toString());
    if (log.length > 500) log.shift();
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  child.on("close", (code) => {
    running = false;
    log.push(`\n[finished with exit code ${code}]`);
  });
}

function runUpdate(version) {
  runTask(`
set -e
mkdir -p "${DIR}/backups"
echo "==> Backing up the database"
${COMPOSE} exec -T postgres pg_dump -U axivo axivo | gzip > "${DIR}/backups/pre-update-$(date +%Y%m%d-%H%M%S).sql.gz"
echo "==> Pinning version ${version}"
sed -i "s/^AXIVO_VERSION=.*/AXIVO_VERSION=${version}/" "${ENV_FILE}"
echo "==> Pulling images"
${COMPOSE} pull
echo "==> Recreating services (migrations run automatically)"
${COMPOSE} up -d web worker caddy
echo "==> Pruning old backups (keep last 10)"
ls -1t "${DIR}/backups"/pre-update-*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
echo "==> Update to ${version} complete"
`);
}

function enableTunnel({ domain, token, apiToken, email }) {
  // Secrets are written to .env (read by compose), never logged.
  setEnvVars({
    CLOUDFLARE_TUNNEL_TOKEN: token,
    AXIVO_DOMAIN: domain,
    CLOUDFLARE_API_TOKEN: apiToken,
    ACME_EMAIL: email,
    APP_URL: `https://${domain}`,
    TUNNEL_ENABLED: "1",
  });
  runTask(`
set -e
echo "==> Switching the proxy to HTTPS (Let's Encrypt via Cloudflare DNS-01)"
cp "${DIR}/Caddyfile.https" "${DIR}/Caddyfile"
echo "==> Starting the Cloudflare tunnel and reloading the proxy"
${COMPOSE} --profile tunnel up -d cloudflared caddy web
echo "==> Remote access enabled for ${domain}"
`);
}

function disableTunnel() {
  const host = getEnvVar("APP_HOST") || "localhost";
  setEnvVars({ APP_URL: `http://${host}`, CLOUDFLARE_TUNNEL_TOKEN: "", TUNNEL_ENABLED: "0" });
  runTask(`
set -e
echo "==> Switching the proxy back to local HTTP"
cp "${DIR}/Caddyfile.http" "${DIR}/Caddyfile"
echo "==> Stopping the Cloudflare tunnel and reloading the proxy"
${COMPOSE} --profile tunnel rm -sf cloudflared || true
${COMPOSE} up -d caddy web
echo "==> Remote access disabled"
`);
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

const HOSTNAME = /^[a-zA-Z0-9.-]{1,253}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN = /^[A-Za-z0-9+/._=-]{10,4096}$/;
const API_TOKEN = /^[A-Za-z0-9._-]{10,200}$/;

http.createServer(async (req, res) => {
  const json = (code, obj) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (!SECRET || req.headers["x-agent-secret"] !== SECRET) {
    res.writeHead(401);
    return res.end("unauthorized");
  }

  if (req.method === "GET" && req.url === "/status") {
    return json(200, { running, log: log.join("") });
  }

  if (req.method === "POST" && req.url === "/update") {
    if (running) return json(409, { error: "A task is already running." });
    const { version = "latest" } = await readBody(req);
    if (!/^(v?\d+\.\d+\.\d+|latest)$/.test(version)) return json(400, { error: "Invalid version." });
    runUpdate(version);
    return json(202, { started: true });
  }

  if (req.method === "POST" && req.url === "/tunnel/enable") {
    if (running) return json(409, { error: "A task is already running." });
    const { domain, token, apiToken, email } = await readBody(req);
    if (!HOSTNAME.test(domain || "")) return json(400, { error: "Invalid domain." });
    if (!TOKEN.test(token || "")) return json(400, { error: "Invalid tunnel token." });
    if (!API_TOKEN.test(apiToken || "")) return json(400, { error: "Invalid API token." });
    if (!EMAIL.test(email || "")) return json(400, { error: "Invalid email." });
    enableTunnel({ domain, token, apiToken, email });
    return json(202, { started: true });
  }

  if (req.method === "POST" && req.url === "/tunnel/disable") {
    if (running) return json(409, { error: "A task is already running." });
    disableTunnel();
    return json(202, { started: true });
  }

  res.writeHead(404);
  res.end("not found");
}).listen(PORT, () => console.log(`axivo-agent listening on :${PORT}`));
