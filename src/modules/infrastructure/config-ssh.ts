import { Client, type ClientChannel, type ConnectConfig } from "ssh2";
import {
  IDENTITY_COMMANDS, PAGING_OFF, cleanConfig, detectFamily, plain, type ConfigFamily,
} from "./config-parse";

/**
 * Logs in to one switch over SSH and reads its running configuration, the
 * way an engineer would at the console: wait for the prompt, enter enable
 * mode if needed, turn paging off, run read-only `show` commands. Nothing is
 * ever changed on the device. Worker-only (SDS Doc 24).
 *
 * Built from what the network discovery learned about this estate: older
 * Cisco boxes need legacy key exchange and keyboard-interactive login, Cisco
 * small-business switches ask for the username again inside the session, and
 * HP/Aruba switches want a carriage return and a key press after the banner.
 */

export interface CollectInput {
  host: string;
  port?: number;
  username: string;
  password: string;
  /** For Cisco devices that log in at ">" and need `enable`. Falls back to the login password. */
  enablePassword?: string | null;
  manufacturer?: string | null;
  /** The whole exchange, login to logout. */
  timeoutMs?: number;
}

export interface CollectResult {
  family: ConfigFamily;
  prompt: string;
  /** Raw output of each identity command, keyed by command. */
  outputs: Record<string, string>;
  config: string;
}

/** A failure worth showing as it is: the message is written for a person. */
export class CollectError extends Error {}

/** Only `show` commands and session settings are ever sent. */
const ALLOWED = /^(show [\w -]+|terminal length 0|terminal datadump|no page|enable|exit)$/;

const PAGER = /--\s*more\s*--|more:|press any key|<space>\s*to continue/i;
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const PROMPT = /^[\w.\-()/:@]+\s?[>#]\s*$/;
const LOGIN_PROMPT = /(user ?name|login)\s*:\s*$/i;
const PASSWORD_PROMPT = /password\s*:\s*$/i;

class Shell {
  private buffer = "";
  private mark = 0;
  private lastData = Date.now();
  private closed = false;
  private listeners = new Set<() => void>();
  /** Where to look for the next pager prompt, so each one is answered once. */
  private pagerFrom = 0;

  constructor(private stream: ClientChannel, private eol: string) {
    stream.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8");
      this.lastData = Date.now();
      // Raw text, not plain(): cleaning removes the very "--More--" looked for.
      const tail = this.buffer.slice(Math.max(this.pagerFrom, this.buffer.length - 120)).replace(ANSI, "");
      if (PAGER.test(tail)) {
        this.pagerFrom = this.buffer.length;
        stream.write(" ");
      }
      for (const listener of this.listeners) listener();
    });
    stream.on("close", () => {
      this.closed = true;
      for (const listener of this.listeners) listener();
    });
  }

  /** Everything printed since the last read. */
  private fresh(): string {
    return this.buffer.slice(this.mark);
  }

  private lastLine(): string {
    const lines = plain(this.fresh()).split("\n").map((line) => line.trim()).filter(Boolean);
    return lines[lines.length - 1] ?? "";
  }

  send(command: string, secret = false) {
    if (!secret && !ALLOWED.test(command)) throw new Error(`Refusing to send "${command}"`);
    this.mark = this.buffer.length;
    this.stream.write(command + this.eol);
  }

  /** Raw keystroke for the login prompts and "press any key". */
  type(text: string) {
    this.mark = this.buffer.length;
    this.stream.write(text);
  }

  /**
   * Read until `done` holds and the device has gone quiet briefly, or until
   * it has been silent for `idleMs` (for prompts that are not recognised).
   */
  read(done: (lastLine: string) => boolean, totalMs: number, idleMs = 3000): Promise<string> {
    return new Promise((resolve) => {
      const start = Date.now();
      const finish = () => {
        clearInterval(timer);
        this.listeners.delete(check);
        const out = this.fresh();
        this.mark = this.buffer.length;
        resolve(out);
      };
      const check = () => {
        const quiet = Date.now() - this.lastData;
        if (this.closed) return finish();
        if (done(this.lastLine()) && quiet >= 250) return finish();
        if (quiet >= idleMs || Date.now() - start >= totalMs) return finish();
      };
      const timer = setInterval(check, 100);
      this.listeners.add(check);
    });
  }

  get isClosed() {
    return this.closed;
  }
}

function connect(input: CollectInput): Promise<{ client: Client; inSession: boolean }> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let method: string | null = null;
    const attempts: Record<string, unknown>[] = [
      // "none" first, as SSH clients do: small-business Cisco switches accept
      // it and ask for the login inside the session instead.
      { type: "none", username: input.username },
      { type: "password", username: input.username, password: input.password },
      {
        type: "keyboard-interactive",
        username: input.username,
        prompt: (_name: string, _instructions: string, _lang: string, prompts: { echo?: boolean }[], finish: (answers: string[]) => void) =>
          finish(prompts.map((p) => (p.echo ? input.username : input.password))),
      },
    ];
    const config: ConnectConfig = {
      host: input.host,
      port: input.port ?? 22,
      username: input.username,
      readyTimeout: 15_000,
      keepaliveInterval: 10_000,
      tryKeyboard: true,
      algorithms: {
        kex: { append: ["diffie-hellman-group14-sha1", "diffie-hellman-group-exchange-sha1", "diffie-hellman-group1-sha1"] },
        serverHostKey: { append: ["ssh-rsa"] },
        cipher: { append: ["aes128-cbc", "aes256-cbc", "3des-cbc"] },
        hmac: { append: ["hmac-sha1"] },
      } as ConnectConfig["algorithms"],
      authHandler: ((methodsLeft: string[] | null, _partial: boolean, next: (method: unknown) => void) => {
        while (attempts.length > 0) {
          const attempt = attempts.shift()!;
          if (attempt.type === "none" || !methodsLeft || methodsLeft.includes(attempt.type as string)) {
            method = attempt.type as string;
            return next(attempt);
          }
        }
        return next(false);
      }) as unknown as ConnectConfig["authHandler"],
    };
    client.once("ready", () => resolve({ client, inSession: method === "none" }));
    client.once("error", (error: Error & { level?: string }) => {
      client.end();
      if (error.level === "client-authentication") reject(new CollectError("Login refused: check the username and password."));
      else if (error.level === "client-timeout") reject(new CollectError("No answer on SSH (port 22)."));
      else if (/ECONNREFUSED/.test(error.message)) reject(new CollectError("SSH is not open on this device (connection refused)."));
      else if (/EHOSTUNREACH|ENETUNREACH|ETIMEDOUT/.test(error.message)) reject(new CollectError("Cannot reach the device's IP address."));
      else if (/handshake|algorithm/i.test(error.message)) reject(new CollectError(`SSH handshake failed: ${error.message}`));
      else reject(new CollectError(error.message));
    });
    client.connect(config);
  });
}

function openShell(client: Client): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    client.shell({ term: "vt100", cols: 250, rows: 1000 }, (error, stream) => (error ? reject(error) : resolve(stream)));
  });
}

async function session(input: CollectInput): Promise<CollectResult> {
  const { client, inSession } = await connect(input);
  try {
    const eol = /^(hp|aruba)/i.test(input.manufacturer ?? "") ? "\r" : "\n";
    const shell = new Shell(await openShell(client), eol);
    const atPrompt = (line: string) => PROMPT.test(line);

    let banner = await shell.read((line) => atPrompt(line) || LOGIN_PROMPT.test(line) || PASSWORD_PROMPT.test(line) || PAGER.test(line), 10_000, 1500);
    if (/press any key/i.test(banner)) {
      // The shell has already pressed a key for it; wait for what follows.
      banner += await shell.read((line) => atPrompt(line) || LOGIN_PROMPT.test(line), 8_000, 1500);
    }
    const lastOf = (text: string) => plain(text).trim().split("\n").pop()?.trim() ?? "";

    if (inSession || LOGIN_PROMPT.test(lastOf(banner))) {
      // The switch asks for the login inside the session.
      if (!LOGIN_PROMPT.test(lastOf(banner))) {
        banner += await shell.read((line) => LOGIN_PROMPT.test(line), 15_000, 15_000);
        if (!LOGIN_PROMPT.test(lastOf(banner))) throw new CollectError("The device did not ask for a username.");
      }
      shell.type(input.username + eol);
      const reply = await shell.read((line) => PASSWORD_PROMPT.test(line), 8_000, 8_000);
      if (!PASSWORD_PROMPT.test(lastOf(reply))) throw new CollectError("The device did not ask for a password.");
      shell.type(input.password + eol);
      banner = await shell.read((line) => atPrompt(line) || LOGIN_PROMPT.test(line), 10_000, 3000);
      if (!atPrompt(lastOf(banner))) throw new CollectError("Login refused: check the username and password.");
    } else if (PASSWORD_PROMPT.test(lastOf(banner))) {
      throw new CollectError("The device asked for a second password inside the session.");
    }
    if (!atPrompt(lastOf(banner))) {
      banner += await shell.read(atPrompt, 25_000, 25_000);
      if (!atPrompt(lastOf(banner))) throw new CollectError("Logged in, but no command prompt appeared.");
    }
    let prompt = lastOf(banner);

    shell.send("show version");
    const version = await shell.read(atPrompt, 20_000);
    const family = detectFamily(banner + version, input.manufacturer ?? "");

    if ((family === "ios" || family === "sb") && prompt.endsWith(">")) {
      shell.send("enable");
      const asked = await shell.read((line) => PASSWORD_PROMPT.test(line) || atPrompt(line), 8_000);
      if (PASSWORD_PROMPT.test(lastOf(asked))) {
        shell.type((input.enablePassword || input.password) + eol);
        const after = await shell.read(atPrompt, 8_000, 3000);
        prompt = lastOf(after) || prompt;
      } else {
        prompt = lastOf(asked) || prompt;
      }
      if (!prompt.endsWith("#")) {
        throw new CollectError(
          input.enablePassword
            ? "The enable password was refused."
            : "This login needs enable mode. Link an Enable login to the device.",
        );
      }
    }

    shell.send(PAGING_OFF[family]);
    await shell.read(atPrompt, 8_000);

    const outputs: Record<string, string> = { "show version": version };
    for (const command of IDENTITY_COMMANDS[family]) {
      shell.send(command);
      outputs[command] = await shell.read(atPrompt, 20_000);
    }

    shell.send("show running-config");
    const raw = await shell.read(atPrompt, 120_000, 8000);
    if (!atPrompt(lastOf(raw))) throw new CollectError("The configuration did not finish printing in time.");
    const config = cleanConfig(raw, "show running-config", prompt);

    if (!shell.isClosed) shell.send("exit");
    return { family, prompt, outputs, config };
  } finally {
    client.end();
  }
}

/** Read one device, giving up after the time limit. */
export async function collectConfig(input: CollectInput): Promise<CollectResult> {
  const limit = input.timeoutMs ?? 180_000;
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      session(input),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CollectError("Gave up: the device took too long to answer.")), limit);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
