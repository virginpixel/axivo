// Axivo host agent.
//
// A tiny privileged helper that performs the one-click, data-preserving update.
// It is NOT published to the host - only the web container can reach it over the
// internal Docker network - and every request must carry the shared secret.
//
// On POST /update it: backs up the database, pins the requested version in
// .env, pulls the new images and recreates the app services. Postgres and
// uploads live in named volumes, so data survives. It never touches the agent
// container itself, so the update it is running cannot kill it mid-flight.
import http from "node:http";
import { spawn } from "node:child_process";

const SECRET = process.env.AGENT_SECRET || "";
const PORT = Number(process.env.AGENT_PORT || 8099);
const DIR = process.env.AXIVO_INSTALL_DIR || "/opt/axivo";
const COMPOSE = `docker compose -f ${DIR}/docker-compose.prod.yml --env-file ${DIR}/.env`;

let running = false;
let log = [];

function runUpdate(version) {
  running = true;
  log = [];
  const script = `
set -e
mkdir -p "${DIR}/backups"
echo "==> Backing up the database"
${COMPOSE} exec -T postgres pg_dump -U axivo axivo | gzip > "${DIR}/backups/pre-update-$(date +%Y%m%d-%H%M%S).sql.gz"
echo "==> Pinning version ${version}"
sed -i "s/^AXIVO_VERSION=.*/AXIVO_VERSION=${version}/" "${DIR}/.env"
echo "==> Pulling images"
${COMPOSE} pull
echo "==> Recreating services (migrations run automatically)"
${COMPOSE} up -d web worker caddy
echo "==> Pruning old backups (keep last 10)"
ls -1t "${DIR}/backups"/pre-update-*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
echo "==> Update to ${version} complete"
`;
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

http.createServer((req, res) => {
  if (!SECRET || req.headers["x-agent-secret"] !== SECRET) {
    res.writeHead(401);
    return res.end("unauthorized");
  }
  if (req.method === "POST" && req.url === "/update") {
    if (running) {
      res.writeHead(409, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "An update is already running." }));
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let version = "latest";
      try {
        version = JSON.parse(body || "{}").version || "latest";
      } catch {
        /* keep default */
      }
      // Only a semver tag or "latest" - never arbitrary shell.
      if (!/^(v?\d+\.\d+\.\d+|latest)$/.test(version)) {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "Invalid version." }));
      }
      runUpdate(version);
      res.writeHead(202, { "content-type": "application/json" });
      res.end(JSON.stringify({ started: true }));
    });
    return;
  }
  if (req.method === "GET" && req.url === "/status") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ running, log: log.join("") }));
  }
  res.writeHead(404);
  res.end("not found");
}).listen(PORT, () => console.log(`axivo-agent listening on :${PORT}`));
