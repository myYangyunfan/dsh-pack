import z from "@deepseek-ai/schemastery";
import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import { dshHomeDisplay, resolveDshHome } from "@deepseek-ai/dsh-home-paths";
/** The public config schema. */
const Config = z.object({
	/** Upper bound on a single skill file the editor may load (bytes). */
	maxSkillBytes: z.number().min(1).default(524288),
	/** Upper bound on a single rule file the editor may load or write (bytes). */
	maxRuleBytes: z.number().min(1).default(1048576),
	/** Upper bound on a single JSON request body (bytes). */
	maxBodyBytes: z.number().min(1).default(1048576),
	/** Additional absolute composition-file paths the panel may edit (deployment-managed). */
	extraMcpFiles: z.array(z.string()).default([]),
	/** Force the whole panel read-only (no MCP toggle, no skill save, no rule edit). */
	readOnly: z.boolean().default(false)
});
/** Normalize raw config (for direct callers that bypass the Loader schema). */
function resolveBasicsConfig(config) {
	return {
		maxSkillBytes: config?.maxSkillBytes ?? 524288,
		maxRuleBytes: config?.maxRuleBytes ?? 1048576,
		maxBodyBytes: config?.maxBodyBytes ?? 1048576,
		extraMcpFiles: config?.extraMcpFiles ?? [],
		readOnly: config?.readOnly ?? false
	};
}
//#endregion
//#region src/wire.ts
/** One API failure with its wire code and HTTP status. */
var BasicsError = class extends Error {
	code;
	status;
	constructor(code, message, status = 400) {
		super(message);
		this.code = code;
		this.status = status;
	}
};
/** Read and parse the JSON request body (bounded; malformed → bad-request). */
async function readJsonBody(req, maxBodyBytes) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = Buffer.from(chunk);
		total += buffer.length;
		if (total > maxBodyBytes) throw new BasicsError("bad-request", "request body too large");
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text.trim() === "") return {};
	try {
		return JSON.parse(text);
	} catch {
		throw new BasicsError("bad-request", "request body is not valid JSON");
	}
}
/** Write a JSON response with the given status. */
function writeJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(payload);
}
/** Write the success envelope. */
function writeOk(res, value) {
	writeJson(res, 200, {
		ok: true,
		value
	});
}
/** Write the failure envelope for any thrown value (unknown → internal 500). */
function writeError(res, error) {
	if (error instanceof BasicsError) {
		writeJson(res, error.status, {
			ok: false,
			error: {
				code: error.code,
				message: error.message
			}
		});
		return;
	}
	writeJson(res, 500, {
		ok: false,
		error: {
			code: "internal",
			message: error instanceof Error ? error.message : String(error)
		}
	});
}
/** Narrow an unknown payload value to a non-empty string, else throw bad-request. */
function requireString(payload, key) {
	const value = payload?.[key];
	if (typeof value !== "string" || value === "") throw new BasicsError("bad-request", `missing or invalid "${key}"`);
	return value;
}
/** Narrow an unknown payload value to an optional non-empty string. */
function optionalString(payload, key) {
	const value = payload?.[key];
	return typeof value === "string" && value !== "" ? value : void 0;
}
/** Narrow an unknown payload value to a boolean. */
function requireBoolean(payload, key) {
	const value = payload?.[key];
	if (typeof value !== "boolean") throw new BasicsError("bad-request", `missing or invalid "${key}"`);
	return value;
}
//#endregion
//#region src/trust-fence.ts
function header(headers, name) {
	const value = headers[name];
	return typeof value === "string" ? value : void 0;
}
/** Normalized URL of a Host-header authority, or undefined when unparsable. */
function parseAuthority(authority) {
	try {
		return new URL(`http://${authority}`);
	} catch {
		return;
	}
}
/** Whether a normalized URL hostname names the local loopback authority. */
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
/** Canonical authority form: hostname, or hostname:port when a port was written. */
function canonicalAuthority(entry, entryUrl) {
	const port = entryUrl.port !== "" ? entryUrl.port : new URL(`https://${entry}`).port;
	return port === "" ? entryUrl.hostname : `${entryUrl.hostname}:${port}`;
}
/** Whether the request authority matches a trustedHosts entry (exact or port-less). */
function isTrustedAuthority(hostUrl, trustedHosts) {
	return trustedHosts.some((entry) => {
		const entryUrl = parseAuthority(entry);
		if (entryUrl === void 0) return false;
		return canonicalAuthority(entry, entryUrl) === entryUrl.hostname ? entryUrl.hostname === hostUrl.hostname : entryUrl.host === hostUrl.host;
	});
}
/**
* Decide whether one request may reach the plugin routes.
* @param request - node HTTP request facts (headers).
* @param trustedHosts - non-loopback authorities this deployment serves.
* @returns true when the Host is ours (loopback or trusted) and browser markers are same-origin.
*/
function isTrustedApiRequest(request, trustedHosts) {
	const host = header(request.headers, "host");
	if (host === void 0) return false;
	const hostUrl = parseAuthority(host);
	if (hostUrl === void 0) return false;
	if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false;
	if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
	const origin = header(request.headers, "origin");
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
//#endregion
//#region src/features/registry.ts
/** Merge every feature's methods; throw on a duplicate method name. */
function collectApi(features, fc) {
	const api = {};
	for (const feature of features) {
		const methods = feature.register(fc);
		for (const [method, handler] of Object.entries(methods)) {
			if (api[method] !== void 0) throw new Error(`basics-panel: duplicate API method "${method}" (from feature "${feature.id}")`);
			api[method] = handler;
		}
	}
	return api;
}
//#endregion
//#region src/atomic.ts
/**
* Shared filesystem helpers: atomic write (temp file + rename, so a reader
* never sees a half-written file) and case-aware path comparison for the
* write allowlist on Windows.
*/
/** Write `content` to `path` atomically (throws a plain Error on failure). */
async function atomicWrite(path, content) {
	const tmp = `${path}.dsh-basics-tmp-${process.pid}`;
	try {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(tmp, content, "utf8");
		await rename(tmp, path);
	} catch (error) {
		await rm(tmp, { force: true }).catch(() => {});
		throw error;
	}
}
/** Compare two absolute paths, case-insensitively on Windows. */
function samePath(left, right) {
	const a = resolve(left);
	const b = resolve(right);
	if (process.platform === "win32") return a.toLowerCase() === b.toLowerCase();
	return a === b;
}
//#endregion
//#region src/features/skills/frontmatter.ts
/**
* Skill-file frontmatter parsing and editing. A skill file is Markdown with a
* leading YAML frontmatter block delimited by `---` lines. This module splits
* the block from the body, parses it, and edits it through the `yaml` package
* Document API so unknown frontmatter keys and comments survive a save.
*
* Canonical keys (mirroring @deepseek-ai/dsh-skill-filesystem):
*   name, description, whenToUse?, metadata?, disable-model-invocation?,
*   user-invocable?
*/
/** The public skill-name grammar (mirror of dsh-skill's SKILL_NAME). */
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Whether a string is a valid kebab-case skill name. */
function isSkillName(name) {
	return SKILL_NAME_RE.test(name);
}
/**
* Split a raw skill file into its frontmatter text and body. Returns
* undefined when the file has no `---`-delimited frontmatter block.
*/
function splitSkillFile(raw) {
	const firstLineEnd = raw.indexOf("\n");
	if (firstLineEnd < 0) return void 0;
	if (raw.slice(0, firstLineEnd).replace(/\r$/, "") !== "---") return void 0;
	const start = firstLineEnd + 1;
	let lineStart = start;
	while (lineStart <= raw.length) {
		const nextNewline = raw.indexOf("\n", lineStart);
		const lineEnd = nextNewline < 0 ? raw.length : nextNewline;
		if (raw.slice(lineStart, lineEnd).replace(/\r$/, "") === "---") {
			const bodyStart = nextNewline < 0 ? raw.length : nextNewline + 1;
			return {
				frontmatter: raw.slice(start, lineStart),
				body: raw.slice(bodyStart)
			};
		}
		if (nextNewline < 0) return void 0;
		lineStart = nextNewline + 1;
	}
}
/**
* Validate an edit's frontmatter fields, returning the normalized patch to
* apply to the YAML node. Throws a TypeError with a Chinese message on an
* invalid field.
*/
function normalizeSkillPatch(edit) {
	const patch = {};
	if (edit.description !== void 0) {
		if (typeof edit.description !== "string" || edit.description.trim() === "") throw new TypeError("描述不能为空");
		patch.description = edit.description;
	}
	if (edit.whenToUse !== void 0) {
		if (edit.whenToUse === null || edit.whenToUse === "") patch.whenToUse = void 0;
		else patch.whenToUse = edit.whenToUse;
	}
	if (edit.metadata !== void 0) {
		if (edit.metadata === null) patch.metadata = void 0;
		else if (typeof edit.metadata !== "object" || Array.isArray(edit.metadata)) throw new TypeError("metadata 必须是对象");
		else patch.metadata = edit.metadata;
	}
	if (edit.modelInvocable !== void 0) patch["disable-model-invocation"] = edit.modelInvocable ? void 0 : true;
	if (edit.userInvocable !== void 0) patch["user-invocable"] = edit.userInvocable ? void 0 : false;
	return patch;
}
/** Apply a patch map to a frontmatter YAML node, preserving unknown keys and comments. */
function applyPatch(doc, patch) {
	let root = doc.contents;
	if (root === null) {
		doc.contents = doc.createNode({});
		root = doc.contents;
	}
	if (!isMap(root)) throw new TypeError("frontmatter 必须是 YAML 映射");
	for (const [key, value] of Object.entries(patch)) if (value === void 0) root.delete(key);
	else root.set(key, value);
}
/**
* Apply a skill edit to a raw skill file. The edit is validated, the
* frontmatter is patched in place (round-tripped through the yaml Document so
* unknown keys and comments survive), and the body is replaced when supplied.
* Returns the full edited file text.
*/
function applySkillEdit(raw, edit) {
	const parts = splitSkillFile(raw);
	if (parts === void 0) throw new TypeError("技能文件缺少 frontmatter 块");
	const patch = normalizeSkillPatch(edit);
	const doc = parseDocument(parts.frontmatter);
	if (doc.errors.length > 0) throw new TypeError("frontmatter YAML 解析失败");
	applyPatch(doc, patch);
	const data = doc.toJS();
	if (typeof data?.name !== "string" || !isSkillName(data.name)) throw new TypeError("技能 name 非法（必须为 kebab-case）");
	if (typeof data?.description !== "string" || data.description.trim() === "") throw new TypeError("技能 description 不能为空");
	return `---\n${doc.toString().trimEnd()}\n---\n${edit.body ?? parts.body}`;
}
//#endregion
//#region src/features/skills/skills-service.ts
/**
* Skills feature (host): list skills grouped by scope, load one skill for
* editing, and save an edit back to the skill file. Reads/writes go through
* the filesystem provider's own paths (resolved via `ctx.skills`), so the
* registry — not this plugin — is the authority on where a skill lives; a
* save re-resolves the path from the registry to avoid path spoofing.
*/
/** Map a provider `source` string to a scope key. */
function scopeOfSource(source) {
	switch (source) {
		case "project-dsh":
		case "project-agents": return "project";
		case "custom": return "custom";
		case "user-dsh":
		case "user-agents": return "user";
		case "bundled": return "bundled";
		case "runtime": return "runtime";
		default: return "other";
	}
}
/** Order of scope groups in the list. */
const SCOPE_ORDER = [
	"project",
	"custom",
	"user",
	"bundled",
	"runtime",
	"other"
];
/** Whether a definition may be edited through the panel. */
function isEditable(def) {
	return def.path !== void 0 && def.source !== "bundled" && def.source !== "runtime";
}
/** Whether a summary's source denotes an editable skill (path resolved later on open). */
function sourceEditable(source) {
	return source !== "bundled" && source !== "runtime";
}
/** Display location from a summary's resource base. */
function locationOf(summary) {
	if (summary.resourceBase?.kind === "directory" && summary.resourceBase.path !== void 0) return summary.resourceBase.path;
	if (summary.resourceBase?.kind === "url" && summary.resourceBase.url !== void 0) return summary.resourceBase.url;
}
function toRow(summary, readOnly) {
	const location = locationOf(summary);
	return {
		name: summary.name,
		description: summary.description,
		...summary.whenToUse !== void 0 ? { whenToUse: summary.whenToUse } : {},
		modelInvocable: summary.invocation.modelInvocable,
		userInvocable: summary.invocation.userInvocable,
		source: summary.source,
		provider: summary.provider,
		...location !== void 0 ? { location } : {},
		editable: !readOnly && sourceEditable(summary.source)
	};
}
/** Read the raw skill file body (untrimmed) plus its mtime, falling back to the definition's trimmed content. */
async function readRawBody(def) {
	if (def.path === void 0) return { body: def.content };
	try {
		const [raw, info] = await Promise.all([readFile(def.path, "utf8"), stat(def.path)]);
		return {
			body: splitSkillFile(raw)?.body ?? def.content,
			mtime: info.mtimeMs
		};
	} catch {
		return { body: def.content };
	}
}
/** Build the skills feature API. */
function registerSkills(fc) {
	const { ctx, resolved } = fc;
	const cwdOf = (payload) => {
		const cwd = optionalString(payload, "cwd");
		return cwd === void 0 ? fc.sessionCwdOf(payload) : cwd;
	};
	/** Resolve the viewing scope key (the live Agent) so scoped skill providers are included. */
	const scopeOf = (payload) => {
		const record = payload;
		const sessionId = typeof record?.sessionId === "string" ? record.sessionId : "";
		if (sessionId === "") return void 0;
		const agents = ctx.get("agents");
		if (agents === void 0 || typeof agents.get !== "function") return void 0;
		try {
			return agents.get(sessionId);
		} catch {
			return;
		}
	};
	const view = (payload) => {
		const cwd = cwdOf(payload);
		const scope = scopeOf(payload);
		return {
			cwd,
			...scope !== void 0 ? { scope } : {}
		};
	};
	const list = async (payload) => {
		const snapshot = await ctx.skills.snapshot(view(payload));
		const groups = /* @__PURE__ */ new Map();
		for (const summary of snapshot.skills) {
			const scope = scopeOfSource(summary.source);
			const bucket = groups.get(scope) ?? [];
			bucket.push(toRow(summary, resolved.readOnly));
			groups.set(scope, bucket);
		}
		return {
			groups: SCOPE_ORDER.filter((scope) => groups.has(scope)).map((scope) => ({
				scope,
				skills: groups.get(scope)
			})),
			complete: snapshot.complete
		};
	};
	const get = async (payload) => {
		const name = requireString(payload, "name");
		const def = await ctx.skills.get(name, view(payload));
		if (def === void 0) throw new BasicsError("not-found", `技能 "${name}" 不存在`, 404);
		const { body, mtime } = await readRawBody(def);
		return {
			name: def.name,
			description: def.description,
			...def.whenToUse !== void 0 ? { whenToUse: def.whenToUse } : {},
			...def.metadata !== void 0 ? { metadata: def.metadata } : {},
			modelInvocable: def.invocation.modelInvocable,
			userInvocable: def.invocation.userInvocable,
			body,
			...def.path !== void 0 ? { path: def.path } : {},
			source: def.source,
			provider: def.provider,
			editable: !resolved.readOnly && isEditable(def),
			...mtime !== void 0 ? { mtime } : {}
		};
	};
	const save = async (payload) => {
		if (resolved.readOnly) throw new BasicsError("read-only", "面板处于只读模式", 403);
		const name = requireString(payload, "name");
		const record = payload;
		const expectedMtime = typeof record?.expectedMtime === "number" ? record.expectedMtime : void 0;
		const edit = record?.edit ?? {};
		const def = await ctx.skills.get(name, view(payload));
		if (def === void 0) throw new BasicsError("not-found", `技能 "${name}" 不存在`, 404);
		if (!isEditable(def)) throw new BasicsError("skill-error", "该技能为只读（内置或运行时技能）", 403);
		const path = def.path;
		let raw;
		let mtime;
		try {
			raw = await readFile(path, "utf8");
			mtime = (await stat(path)).mtimeMs;
		} catch (error) {
			throw new BasicsError("fs-error", `无法读取技能文件: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		if (expectedMtime !== void 0 && mtime !== void 0 && Math.abs(expectedMtime - mtime) > 1) throw new BasicsError("conflict", "技能文件已被修改，请刷新后重试", 409);
		let next;
		try {
			next = applySkillEdit(raw, edit);
		} catch (error) {
			throw new BasicsError("skill-error", error instanceof Error ? error.message : String(error), 400);
		}
		if (Buffer.byteLength(next, "utf8") > resolved.maxSkillBytes) throw new BasicsError("skill-error", `技能文件超过大小上限 ${resolved.maxSkillBytes} 字节`, 400);
		try {
			await atomicWrite(path, next);
		} catch (error) {
			throw new BasicsError("fs-error", `无法写入技能文件: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		const info = await stat(path).catch(() => void 0);
		return {
			ok: true,
			...info !== void 0 ? { mtime: info.mtimeMs } : {}
		};
	};
	return {
		"skills.list": list,
		"skills.get": get,
		"skills.save": save
	};
}
//#endregion
//#region src/features/mcp/composition-scan.ts
/**
* Composition scanning: locate every file that may declare MCP servers and
* extract the `mcp-client` rows it holds. Sources are (a) the profile patch
* layers (home-level and per-profile), (b) agent-preset compositions (through
* the roster when present, else a user-root directory scan), and (c) any
* deployment-declared extra files. Shipped (system) presets are read-only.
*/
/** Whether a plugin module specifier names the MCP client bridge. */
function isMcpClientName$1(name) {
	return typeof name === "string" && /mcp-client/.test(name);
}
/**
* Extract every `mcp-client` row from a composition document (top-level YAML
* array). Handles both preset rows (`{id, name, config}`) and patch entries
* (`{insert: [{id, name, config}, ...]}`).
*/
function collectMcpRows(text) {
	const doc = parseDocument(text);
	if (doc.errors.length > 0) return [];
	const rows = [];
	const consider = (obj) => {
		if (!isMcpClientName$1(obj.name)) return;
		const config = obj.config ?? {};
		const serverName = typeof config.serverName === "string" ? config.serverName : "";
		const rowId = typeof obj.id === "string" ? obj.id : null;
		rows.push({
			rowId,
			serverName,
			disabled: obj.disabled === true,
			config
		});
	};
	const walk = (node) => {
		if (Array.isArray(node)) {
			for (const item of node) walk(item);
			return;
		}
		if (node !== null && typeof node === "object") {
			const obj = node;
			if (Array.isArray(obj.insert)) {
				for (const item of obj.insert) if (item !== null && typeof item === "object") consider(item);
			}
			consider(obj);
		}
	};
	walk(doc.toJS());
	return rows;
}
async function isFile(path) {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}
async function listDirs(dir) {
	try {
		return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
	} catch {
		return [];
	}
}
async function rowsOf(path) {
	try {
		return collectMcpRows(await readFile(path, "utf8"));
	} catch {
		return [];
	}
}
/** Resolve the agent-preset roster: the service when mounted, else the user root scan. */
async function listPresets(ctx) {
	const agentPresets = ctx.get("agentPresets");
	if (agentPresets !== void 0) try {
		return (await agentPresets.list()).map((row) => ({
			id: row.id,
			path: row.path,
			trust: row.trust
		}));
	} catch {}
	const root = join(resolveDshHome(), ".agent-presets");
	return (await listDirs(root)).map((id) => ({
		id,
		path: join(root, id, "agent.cordis.yml"),
		trust: "user"
	}));
}
/** Discover every composition source and its MCP rows. */
async function scanMcpSources(ctx, resolved) {
	const home = resolveDshHome();
	const sources = [];
	const homePatch = join(home, "cordis.patch.yml");
	if (await isFile(homePatch)) sources.push({
		scope: "profile",
		scopeLabel: "home",
		path: homePatch,
		readOnly: false,
		rows: await rowsOf(homePatch)
	});
	for (const profileName of await listDirs(join(home, "profiles"))) {
		const path = join(home, "profiles", profileName, "cordis.patch.yml");
		if (await isFile(path)) sources.push({
			scope: "profile",
			scopeLabel: profileName,
			path,
			readOnly: false,
			rows: await rowsOf(path)
		});
	}
	for (const preset of await listPresets(ctx)) sources.push({
		scope: "preset",
		scopeLabel: preset.id,
		path: preset.path,
		readOnly: preset.trust === "system",
		rows: await rowsOf(preset.path)
	});
	for (const extra of resolved.extraMcpFiles) if (await isFile(extra)) sources.push({
		scope: "profile",
		scopeLabel: "extra",
		path: extra,
		readOnly: false,
		rows: await rowsOf(extra)
	});
	return sources;
}
//#endregion
//#region src/features/mcp/yaml-edit.ts
/**
* Round-trip editing of a composition document: flip one row's `disabled`
* flag while preserving comments and every other key. Editing works on the
* yaml Document node tree (never on the plain JS value) so the file text
* other than the one flag is byte-stable.
*/
/** Read a scalar node as a string (empty for non-scalars). */
function scalarString(node) {
	if (!isScalar(node)) return "";
	const value = node.value;
	return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
/** Whether a plugin module specifier names the MCP client bridge. */
function isMcpClientName(name) {
	return /mcp-client/.test(name);
}
/**
* Locate the YAML mapping of the row matching `target` (by serverName, then
* by rowId), walking insert lists and direct rows alike.
*/
function findRowNode(node, target) {
	if (isSeq(node)) {
		for (const item of node.items) {
			const found = findRowNode(item, target);
			if (found !== void 0) return found;
		}
		return;
	}
	if (isMap(node)) {
		const insert = node.get("insert", true);
		if (isSeq(insert)) for (const item of insert.items) {
			if (!isMap(item)) continue;
			const found = considerRow(item, target);
			if (found !== void 0) return found;
		}
		return considerRow(node, target);
	}
}
function considerRow(map, target) {
	if (!isMcpClientName(scalarString(map.get("name", true)))) return void 0;
	const config = map.get("config", true);
	const serverName = isMap(config) ? scalarString(config.get("serverName", true)) : "";
	if (serverName !== "" && serverName === target.serverName) return map;
	if (target.rowId != null && scalarString(map.get("id", true)) === target.rowId) return map;
}
/**
* Flip one row's `disabled` flag in a composition document. `disabled === true`
* adds the flag; `false` removes it (the Loader default). Returns the edited
* text, or the original text with `ok: false` when the row or document is
* unparsable/unfound.
*/
function setRowDisabled(text, target, disabled) {
	const doc = parseDocument(text);
	if (doc.errors.length > 0) return {
		ok: false,
		text
	};
	const row = findRowNode(doc.contents, target);
	if (row === void 0) return {
		ok: false,
		text
	};
	if (disabled) row.set("disabled", true);
	else row.delete("disabled");
	return {
		ok: true,
		text: doc.toString()
	};
}
/**
* Update one row's `config` mapping in place. A null/absent patch value is
* skipped; an explicit null deletes the key. Values are converted through the
* document's node factory so nested objects/arrays serialize correctly.
*/
function setRowConfig(text, target, patch) {
	const doc = parseDocument(text);
	if (doc.errors.length > 0) return {
		ok: false,
		text
	};
	const row = findRowNode(doc.contents, target);
	if (row === void 0) return {
		ok: false,
		text
	};
	const rawConfig = row.get("config", true);
	const config = isMap(rawConfig) ? rawConfig : doc.createNode({});
	if (!isMap(rawConfig)) row.set("config", config);
	for (const [key, value] of Object.entries(patch)) {
		if (value === void 0) continue;
		if (value === null) config.delete(key);
		else config.set(key, doc.createNode(value));
	}
	return {
		ok: true,
		text: doc.toString()
	};
}
/**
* Append a new `mcp-client` row to a composition document. The row lands
* inside an existing top-level `insert` list when one is present, otherwise a
* fresh `insert` block is created; an empty document is seeded with a fresh
* `insert` block. Returns the edited text, or the original text with
* `ok: false` when the document shape is unsupported.
*/
function addRow(text, row) {
	const doc = parseDocument(text);
	if (doc.errors.length > 0) return {
		ok: false,
		text
	};
	const node = doc.createNode(row);
	const contents = doc.contents;
	if (contents === null) {
		doc.contents = doc.createNode([{ insert: [row] }]);
		return {
			ok: true,
			text: doc.toString()
		};
	}
	if (isSeq(contents)) {
		let insert;
		for (const item of contents.items) if (isMap(item)) {
			const candidate = item.get("insert", true);
			if (isSeq(candidate)) {
				insert = candidate;
				break;
			}
		}
		if (insert !== void 0) insert.items.push(node);
		else contents.items.push(doc.createNode({ insert: [row] }));
		return {
			ok: true,
			text: doc.toString()
		};
	}
	if (isMap(contents)) {
		const existing = contents.get("insert", true);
		if (isSeq(existing)) existing.items.push(node);
		else contents.set("insert", doc.createNode([row]));
		return {
			ok: true,
			text: doc.toString()
		};
	}
	return {
		ok: false,
		text
	};
}
//#endregion
//#region src/features/mcp/secret-mask.ts
/**
* Secret masking for MCP server config. The panel never ships a raw secret
* across the wire: env values, header values, URL userinfo passwords, and
* the value that follows a sensitive command-line flag are replaced with a
* fixed marker. The host keeps the raw config in memory only.
*/
/** The display marker for a masked secret. */
const MASK = "••••";
/** Command-line flags whose following argument is a secret. */
const SENSITIVE_FLAG = /^--?(password|passwd|pass|token|secret|api[-_]?key|authorization)$/i;
/** Mask every value in an env/header-style map, keeping the keys. */
function maskValues(map) {
	if (map === void 0) return void 0;
	const out = {};
	for (const key of Object.keys(map)) out[key] = MASK;
	return out;
}
/** Mask the argument that follows a sensitive flag; everything else verbatim. */
function maskArgs(args) {
	if (args === void 0) return void 0;
	const out = [...args];
	for (let i = 0; i < out.length; i += 1) {
		const token = out[i];
		if (token !== void 0 && SENSITIVE_FLAG.test(token) && i + 1 < out.length) {
			out[i + 1] = MASK;
			i += 1;
		}
	}
	return out;
}
/** Mask the password in a URL's userinfo (e.g. http://user:pass@host). */
function maskUrl(url) {
	if (url === void 0) return void 0;
	try {
		const parsed = new URL(url);
		if (parsed.password !== "") {
			parsed.password = MASK;
			return parsed.toString();
		}
		return url;
	} catch {
		return url;
	}
}
//#endregion
//#region src/features/mcp/mcp-service.ts
/**
* MCP feature (host): list every MCP server grouped by source scope, report
* its masked config and live runtime status, and toggle a server on/off by
* flipping the `disabled` flag in its source file (profile patches hot-reload;
* preset compositions take effect for new sessions).
*/
function maskedView(row, editable, mounted, toolCount) {
	const c = row.config;
	const transport = c.transport === "streamable-http" ? "streamable-http" : c.transport === "stdio" ? "stdio" : "unknown";
	return {
		rowId: row.rowId,
		serverName: row.serverName,
		transport,
		disabled: row.disabled,
		editable,
		...typeof c.command === "string" ? { command: c.command } : {},
		...Array.isArray(c.args) ? { args: maskArgs(c.args) } : {},
		...typeof c.env === "object" && c.env !== null ? { env: maskValues(c.env) } : {},
		...typeof c.cwd === "string" && c.cwd !== "" ? { cwd: c.cwd } : {},
		...typeof c.url === "string" ? { url: maskUrl(c.url) } : {},
		...typeof c.headers === "object" && c.headers !== null ? { headers: maskValues(c.headers) } : {},
		...typeof c.toolCallTimeoutMs === "number" ? { toolCallTimeoutMs: c.toolCallTimeoutMs } : {},
		runtime: {
			mounted,
			toolCount
		}
	};
}
/** Restore masked placeholders against the raw config so unchanged secrets survive a save. */
function resolveMaskedPatch(patch, raw) {
	const out = { ...patch };
	const rawArgs = Array.isArray(raw.args) ? raw.args : void 0;
	if (Array.isArray(out.args) && rawArgs !== void 0) out.args = out.args.map((value, index) => value === "••••" && rawArgs[index] !== void 0 ? rawArgs[index] : value);
	const rawEnv = typeof raw.env === "object" && raw.env !== null ? raw.env : void 0;
	if (out.env !== null && out.env !== void 0 && rawEnv !== void 0) {
		const env = { ...out.env };
		for (const key of Object.keys(env)) if (env[key] === "••••" && rawEnv[key] !== void 0) env[key] = rawEnv[key];
		out.env = env;
	}
	if (typeof out.url === "string" && out.url.includes("••••") && typeof raw.url === "string") out.url = raw.url;
	return out;
}
/** Cross-reference the loader tree and tool registry for live status. */
function runtimeFacts(ctx) {
	const mountedByServer = /* @__PURE__ */ new Map();
	try {
		const loader = ctx.get("loader");
		if (loader !== void 0 && typeof loader.entries === "function") for (const entry of loader.entries()) {
			const name = entry.options?.name ?? "";
			if (!/mcp-client/.test(name)) continue;
			const cfg = entry.options?.config;
			const serverName = cfg !== void 0 && typeof cfg.serverName === "string" ? cfg.serverName : "";
			if (serverName !== "") mountedByServer.set(serverName, !entry.disabled);
		}
	} catch {}
	let toolNames = [];
	try {
		toolNames = ctx.tools.schemas().map((schema) => schema.name);
	} catch {
		toolNames = [];
	}
	return {
		mountedByServer,
		toolNames
	};
}
function toolCountFor(serverName, toolNames) {
	const prefix = `mcp__${serverName}__`;
	let count = 0;
	for (const name of toolNames) if (name.startsWith(prefix)) count += 1;
	return count;
}
/** Build the MCP feature API. */
function registerMcp(fc) {
	const { ctx, resolved } = fc;
	const list = async () => {
		const sources = await scanMcpSources(ctx, resolved);
		const { mountedByServer, toolNames } = runtimeFacts(ctx);
		return { groups: sources.map((source) => ({
			scope: source.scope,
			scopeLabel: source.scopeLabel,
			path: source.path,
			readOnly: source.readOnly,
			servers: source.rows.map((row) => {
				return maskedView(row, !resolved.readOnly && !source.readOnly, mountedByServer.get(row.serverName) ?? false, toolCountFor(row.serverName, toolNames));
			})
		})) };
	};
	const setEnabled = async (payload) => {
		if (resolved.readOnly) throw new BasicsError("read-only", "面板处于只读模式", 403);
		const path = requireString(payload, "path");
		const serverName = requireString(payload, "serverName");
		const rowId = optionalString(payload, "rowId") ?? null;
		const enabled = requireBoolean(payload, "enabled");
		const source = (await scanMcpSources(ctx, resolved)).find((s) => samePath(s.path, path) && !s.readOnly);
		if (source === void 0) throw new BasicsError("forbidden", "该文件不在可编辑范围内", 403);
		if (source.rows.find((r) => r.serverName === serverName || rowId !== null && r.rowId === rowId) === void 0) throw new BasicsError("not-found", `未找到 MCP 服务器 "${serverName}"`, 404);
		let text;
		try {
			text = await readFile(path, "utf8");
		} catch (error) {
			throw new BasicsError("fs-error", `无法读取配置: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		const result = setRowDisabled(text, {
			rowId,
			serverName
		}, !enabled);
		if (!result.ok) throw new BasicsError("mcp-error", `配置中未找到服务器 "${serverName}" 对应的行`, 400);
		try {
			await atomicWrite(path, result.text);
		} catch (error) {
			throw new BasicsError("fs-error", `无法写入配置: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		return {
			ok: true,
			disabled: !enabled,
			takesEffect: source.scope === "preset" ? "new-session" : "live"
		};
	};
	const save = async (payload) => {
		if (resolved.readOnly) throw new BasicsError("read-only", "面板处于只读模式", 403);
		const path = requireString(payload, "path");
		const serverName = requireString(payload, "serverName");
		const rowId = optionalString(payload, "rowId") ?? null;
		const patch = payload?.patch ?? {};
		const source = (await scanMcpSources(ctx, resolved)).find((s) => samePath(s.path, path) && !s.readOnly);
		if (source === void 0) throw new BasicsError("forbidden", "该文件不在可编辑范围内", 403);
		const row = source.rows.find((r) => r.serverName === serverName || rowId !== null && r.rowId === rowId);
		if (row === void 0) throw new BasicsError("not-found", `未找到 MCP 服务器 "${serverName}"`, 404);
		let text;
		try {
			text = await readFile(path, "utf8");
		} catch (error) {
			throw new BasicsError("fs-error", `无法读取配置: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		const result = setRowConfig(text, {
			rowId,
			serverName
		}, resolveMaskedPatch(patch, row.config));
		if (!result.ok) throw new BasicsError("mcp-error", `配置中未找到服务器 "${serverName}" 对应的行`, 400);
		try {
			await atomicWrite(path, result.text);
		} catch (error) {
			throw new BasicsError("fs-error", `无法写入配置: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		return { ok: true };
	};
	const create = async (payload) => {
		if (resolved.readOnly) throw new BasicsError("read-only", "面板处于只读模式", 403);
		const serverName = requireString(payload, "serverName");
		const transport = requireString(payload, "transport");
		if (transport !== "stdio" && transport !== "streamable-http") throw new BasicsError("bad-request", "非法的传输方式 \"transport\"（仅 stdio / streamable-http）");
		const record = payload;
		const command = optionalString(payload, "command");
		const url = optionalString(payload, "url");
		const cwd = optionalString(payload, "cwd");
		const argsValue = record?.args;
		const args = Array.isArray(argsValue) ? argsValue.filter((value) => typeof value === "string") : void 0;
		const envValue = record?.env;
		const env = envValue !== null && typeof envValue === "object" && !Array.isArray(envValue) ? envValue : void 0;
		const toolCallTimeoutMs = typeof record?.toolCallTimeoutMs === "number" ? record.toolCallTimeoutMs : void 0;
		const sources = await scanMcpSources(ctx, resolved);
		if (sources.some((source) => source.rows.some((row) => row.serverName === serverName))) throw new BasicsError("conflict", `MCP 服务器 "${serverName}" 已存在`, 409);
		const pathParam = optionalString(payload, "path");
		let target;
		if (pathParam !== void 0) {
			const source = sources.find((candidate) => samePath(candidate.path, pathParam) && !candidate.readOnly);
			if (source === void 0) throw new BasicsError("forbidden", "该文件不在可编辑范围内", 403);
			target = source.path;
		} else target = sources.find((source) => source.scope === "profile" && !source.readOnly)?.path ?? join(resolveDshHome(), "cordis.patch.yml");
		const config = {
			serverName,
			transport
		};
		if (command !== void 0) config.command = command;
		if (url !== void 0) config.url = url;
		if (cwd !== void 0) config.cwd = cwd;
		if (args !== void 0) config.args = args;
		if (env !== void 0) config.env = env;
		if (toolCallTimeoutMs !== void 0) config.toolCallTimeoutMs = toolCallTimeoutMs;
		let text = "";
		try {
			text = await readFile(target, "utf8");
		} catch {
			text = "";
		}
		const result = addRow(text, {
			id: `mcp-${serverName}`,
			name: "@deepseek-ai/dsh-mcp-client",
			config
		});
		if (!result.ok) throw new BasicsError("mcp-error", "无法解析 MCP 组合文件以追加新服务器", 400);
		try {
			await atomicWrite(target, result.text);
		} catch (error) {
			throw new BasicsError("fs-error", `无法写入配置: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		return {
			ok: true,
			serverName,
			path: target
		};
	};
	return {
		"mcp.list": list,
		"mcp.setEnabled": setEnabled,
		"mcp.save": save,
		"mcp.create": create
	};
}
//#endregion
//#region src/features/rules/scan.ts
/**
* Rule-file discovery (host, pure functions): mirrors the authoritative
* discovery of @deepseek-ai/dsh-agent-instructions — a fixed user-global
* `AGENTS.md` under the harness home, plus the candidate instruction files on
* the project-root-to-cwd directory chain. The panel never trusts a
* client-supplied path: every read/save/create re-resolves candidates from
* these functions, and the service re-checks the resolved path against the
* freshly discovered set.
*
* Candidates mirror the DSH defaults:
*   base:  AGENTS.md, CLAUDE.md
*   local: AGENTS.local.md, CLAUDE.local.md
*   project root marker: .git
*/
/** The fixed user-global rule file name (mirror of dsh-agent-instructions' USER_GLOBAL_FILE). */
const RULES_GLOBAL_FILE = "AGENTS.md";
/** Ordered base candidates per directory (highest precedence first). */
const RULES_BASE_CANDIDATES = ["AGENTS.md", "CLAUDE.md"];
/** Ordered local-overlay candidates per directory (loaded after the base files). */
const RULES_LOCAL_CANDIDATES = ["AGENTS.local.md", "CLAUDE.local.md"];
/** Every candidate file the panel may create. */
const RULES_ALL_CANDIDATES = [...RULES_BASE_CANDIDATES, ...RULES_LOCAL_CANDIDATES];
/** Directory entries that identify the project root while walking upward. */
const RULES_ROOT_MARKERS = [".git"];
/** Probe whether a path exists on the host filesystem. */
async function fileExists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}
/**
* Walk upward from `cwd` to the first directory containing a root marker.
* @returns the discovered project root, or `cwd` itself when no marker exists.
*/
async function findProjectRoot(cwd, markers = RULES_ROOT_MARKERS, exists = fileExists) {
	let dir = resolve(cwd);
	for (;;) {
		for (const marker of markers) if (await exists(join(dir, marker))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return resolve(cwd);
		dir = parent;
	}
}
/**
* Build the inclusive root-to-cwd directory chain.
* @param root - project root directory.
* @param cwd - most-specific directory in the chain.
* @returns directories ordered from broadest (root) to most specific (cwd).
*/
function ancestorChain(root, cwd) {
	const chain = [];
	let dir = resolve(cwd);
	const rootResolved = resolve(root);
	for (;;) {
		chain.unshift(dir);
		if (dir === rootResolved) break;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return chain;
}
/**
* Discover every existing rule file for a session cwd: the user-global file
* first, then the root-to-cwd chain candidates.
* @param options - cwd, harness home, display form of the home (e.g. `~/.dsh`), probe.
* @returns discovered files in precedence order (global first, then broadest→most specific).
*/
async function discoverRuleFiles(options) {
	const exists = options.exists ?? fileExists;
	const displayHome = options.displayHome ?? options.dshHome;
	const files = [];
	const globalPath = join(options.dshHome, RULES_GLOBAL_FILE);
	if (await exists(globalPath)) files.push({
		scope: "global",
		fileName: RULES_GLOBAL_FILE,
		absolutePath: globalPath,
		displayPath: `${displayHome.replaceAll("\\", "/")}/${RULES_GLOBAL_FILE}`,
		directory: options.dshHome
	});
	const cwd = resolve(options.cwd);
	const root = options.projectRoot ?? await findProjectRoot(cwd, RULES_ROOT_MARKERS, exists);
	for (const dir of ancestorChain(root, cwd)) for (const candidate of [...RULES_BASE_CANDIDATES, ...RULES_LOCAL_CANDIDATES]) {
		const absolutePath = join(dir, candidate);
		if (await exists(absolutePath)) files.push({
			scope: "project",
			fileName: candidate,
			absolutePath,
			displayPath: relative(root, absolutePath).replaceAll("\\", "/"),
			directory: dir
		});
	}
	return files;
}
/**
* Resolve the target path of a create request against the allowlist.
* @returns the resolved target, or undefined when the scope/file combo is not allowed.
*   - `global` allows only AGENTS.md under the harness home;
*   - `project` places the file at the project root;
*   - `cwd` places the file at the current working directory.
*/
async function createRulePath(options) {
	const { scope, fileName } = options;
	if (!RULES_ALL_CANDIDATES.includes(fileName)) return void 0;
	const displayHome = options.displayHome ?? options.dshHome;
	const exists = options.exists ?? fileExists;
	if (scope === "global") {
		if (fileName !== "AGENTS.md") return void 0;
		return {
			scope: "global",
			fileName,
			absolutePath: join(options.dshHome, fileName),
			displayPath: `${displayHome.replaceAll("\\", "/")}/${fileName}`,
			directory: options.dshHome
		};
	}
	if (scope === "cwd") {
		const directory = resolve(options.cwd);
		return {
			scope: "project",
			fileName,
			absolutePath: join(directory, fileName),
			displayPath: fileName,
			directory
		};
	}
	const directory = await findProjectRoot(resolve(options.cwd), RULES_ROOT_MARKERS, exists);
	return {
		scope: "project",
		fileName,
		absolutePath: join(directory, fileName),
		displayPath: fileName,
		directory
	};
}
/** The starter content written for a newly created rule file. */
function ruleTemplate(fileName) {
	return `# ${fileName}

此文件由 dsh-basics-panel 创建，作为 DSH 的规则/指令文件加载。

> 作用域内规则适用于该作用域的所有会话；直接用户指令优先于一切指令。

## 规则

1.
`;
}
//#endregion
//#region src/features/rules/rules-service.ts
/**
* Rules feature (host): list every DSH rule file (the user-global AGENTS.md
* plus the project-root-to-cwd instruction chain), load one rule for editing,
* save an edit back, and create a new rule file. Every read/save/create
* re-resolves candidates from the filesystem discovery (never from a
* client-supplied path alone), mirroring how @deepseek-ai/dsh-agent-instructions
* finds instruction files. Rule baselines load at session start, so saves
* take effect for new sessions.
*/
/** Build the rules feature API. */
function registerRules(fc) {
	const { ctx, resolved } = fc;
	const cwdOf = (payload) => {
		const record = payload;
		return (typeof record?.cwd === "string" && record.cwd !== "" ? record.cwd : void 0) ?? fc.sessionCwdOf(payload);
	};
	const homeOf = () => {
		const dshHome = resolveDshHome();
		return {
			dshHome,
			displayHome: dshHomeDisplay(dshHome)
		};
	};
	/** Re-resolve a rule key against the fresh discovery; reject anything else. */
	const findRule = async (key, cwd) => {
		const { dshHome, displayHome } = homeOf();
		const rule = (await discoverRuleFiles({
			cwd,
			dshHome,
			displayHome
		})).find((candidate) => samePath(candidate.absolutePath, key));
		if (rule === void 0) throw new BasicsError("forbidden", "该规则文件不在可编辑范围内", 403);
		return rule;
	};
	const list = async (payload) => {
		const cwd = cwdOf(payload);
		const { dshHome, displayHome } = homeOf();
		const projectRoot = await findProjectRoot(cwd);
		const rules = await discoverRuleFiles({
			cwd,
			dshHome,
			displayHome,
			projectRoot
		});
		const rows = await Promise.all(rules.map(async (rule) => {
			const info = await stat(rule.absolutePath).catch(() => void 0);
			return {
				key: rule.absolutePath,
				scope: rule.scope,
				fileName: rule.fileName,
				displayPath: rule.displayPath,
				directory: rule.directory,
				...info !== void 0 ? {
					size: info.size,
					mtime: info.mtimeMs
				} : {},
				editable: !resolved.readOnly
			};
		}));
		const globals = rows.filter((row) => row.scope === "global");
		const projects = rows.filter((row) => row.scope === "project");
		const groups = [];
		if (globals.length > 0) groups.push({
			scope: "global",
			rules: globals
		});
		if (projects.length > 0) groups.push({
			scope: "project",
			rules: projects
		});
		return {
			groups,
			cwd,
			projectRoot
		};
	};
	const get = async (payload) => {
		const key = requireString(payload, "key");
		const cwd = cwdOf(payload);
		const rule = await findRule(key, cwd);
		let raw;
		let mtime;
		try {
			const [content, info] = await Promise.all([readFile(rule.absolutePath, "utf8"), stat(rule.absolutePath)]);
			raw = content;
			mtime = info.mtimeMs;
		} catch (error) {
			throw new BasicsError("fs-error", `无法读取规则文件: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		if (Buffer.byteLength(raw, "utf8") > resolved.maxRuleBytes) throw new BasicsError("rule-error", `规则文件超过大小上限 ${resolved.maxRuleBytes} 字节，无法编辑`, 400);
		return {
			key: rule.absolutePath,
			scope: rule.scope,
			fileName: rule.fileName,
			displayPath: rule.displayPath,
			content: raw,
			...mtime !== void 0 ? { mtime } : {},
			editable: !resolved.readOnly
		};
	};
	const save = async (payload) => {
		if (resolved.readOnly) throw new BasicsError("read-only", "面板处于只读模式", 403);
		const key = requireString(payload, "key");
		const record = payload;
		const content = record?.content;
		if (typeof content !== "string") throw new BasicsError("bad-request", "缺少规则内容 \"content\"");
		const expectedMtime = typeof record?.expectedMtime === "number" ? record.expectedMtime : void 0;
		const cwd = cwdOf(payload);
		const rule = await findRule(key, cwd);
		let mtime;
		try {
			mtime = (await stat(rule.absolutePath)).mtimeMs;
		} catch (error) {
			throw new BasicsError("fs-error", `无法读取规则文件: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		if (expectedMtime !== void 0 && mtime !== void 0 && Math.abs(expectedMtime - mtime) > 1) throw new BasicsError("conflict", "规则文件已被修改，请刷新后重试", 409);
		if (Buffer.byteLength(content, "utf8") > resolved.maxRuleBytes) throw new BasicsError("rule-error", `规则文件超过大小上限 ${resolved.maxRuleBytes} 字节`, 400);
		try {
			await atomicWrite(rule.absolutePath, content);
		} catch (error) {
			throw new BasicsError("fs-error", `无法写入规则文件: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		const info = await stat(rule.absolutePath).catch(() => void 0);
		return {
			ok: true,
			...info !== void 0 ? { mtime: info.mtimeMs } : {}
		};
	};
	const create = async (payload) => {
		if (resolved.readOnly) throw new BasicsError("read-only", "面板处于只读模式", 403);
		const scope = requireString(payload, "scope");
		const fileName = requireString(payload, "fileName");
		if (scope !== "global" && scope !== "project" && scope !== "cwd") throw new BasicsError("bad-request", "非法的规则作用域 \"scope\"");
		const cwd = cwdOf(payload);
		const { dshHome, displayHome } = homeOf();
		const target = await createRulePath({
			cwd,
			dshHome,
			displayHome,
			scope,
			fileName
		});
		if (target === void 0) throw new BasicsError("forbidden", "不允许创建该规则文件", 403);
		try {
			await stat(target.absolutePath);
			throw new BasicsError("conflict", "规则文件已存在，请改为编辑", 409);
		} catch (error) {
			if (error instanceof BasicsError) throw error;
		}
		try {
			await atomicWrite(target.absolutePath, ruleTemplate(target.fileName));
		} catch (error) {
			throw new BasicsError("fs-error", `无法创建规则文件: ${error instanceof Error ? error.message : String(error)}`, 400);
		}
		const info = await stat(target.absolutePath).catch(() => void 0);
		return {
			ok: true,
			key: target.absolutePath,
			scope: target.scope,
			fileName: target.fileName,
			displayPath: target.displayPath,
			...info !== void 0 ? { mtime: info.mtimeMs } : {}
		};
	};
	return {
		"rules.list": list,
		"rules.get": get,
		"rules.save": save,
		"rules.create": create
	};
}
//#endregion
//#region src/index.ts
/**
* dsh-basics-panel host half: a single fenced /basics JSON API that merges
* every feature backend's methods. The route passes the same browser-trust
* fence as the /api gateway (loopback or `webRuntime.trustedHosts`), and each
* feature re-resolves its own authorities (the skill registry for skill
* paths, the composition scan for MCP files) so the panel never trusts a
* client-supplied path alone.
*/
/** Plugin identity for cordis.yml rows. */
const name = "dsh-basics-panel";
/** Services required before mounting. */
const inject = [
	"webServer",
	"webRuntime",
	"sessions",
	"skills",
	"tools"
];
/**
* Resolve a session's authoritative working directory. The session header
* wins; the client summary cwd is the fallback while the session is still
* hydrating; the process cwd is the last resort.
*/
function sessionCwdOf(ctx, payload) {
	const record = payload;
	const sessionId = typeof record?.sessionId === "string" ? record.sessionId : "";
	if (sessionId !== "") {
		const headerCwd = ctx.sessions.get(sessionId)?.header.cwd;
		if (headerCwd !== void 0 && headerCwd !== "") return headerCwd;
	}
	const clientCwd = typeof record?.cwd === "string" ? record.cwd : "";
	if (clientCwd !== "") return clientCwd;
	return process.cwd();
}
/**
* Plugin body: mount the fenced routes over the merged feature APIs.
* @param ctx - host plugin context (webServer, webRuntime, sessions, skills, tools).
* @param config - deployment limits; the Loader validates against {@link Config}.
*/
function apply(ctx, config) {
	const resolved = resolveBasicsConfig(config);
	const api = collectApi([
		{
			id: "skills",
			register: registerSkills
		},
		{
			id: "mcp",
			register: registerMcp
		},
		{
			id: "rules",
			register: registerRules
		}
	], {
		ctx,
		resolved,
		sessionCwdOf: (payload) => sessionCwdOf(ctx, payload)
	});
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/basics/api",
		handler: async (req, res) => {
			if (!isTrustedApiRequest(req, ctx.webRuntime.trustedHosts)) {
				writeError(res, new BasicsError("forbidden", "forbidden", 403));
				return;
			}
			if (req.method !== "POST") {
				writeError(res, new BasicsError("method-error", "method not allowed", 405));
				return;
			}
			const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
			const method = pathname.startsWith("/basics/api/") ? pathname.slice(12) : void 0;
			if (method === void 0 || method.includes("/")) {
				writeError(res, new BasicsError("not-found", "unknown basics API method", 404));
				return;
			}
			try {
				const payload = await readJsonBody(req, resolved.maxBodyBytes);
				const handler = api[method];
				if (handler === void 0) throw new BasicsError("not-found", `unknown basics API method "${method}"`, 404);
				writeOk(res, await handler(payload));
			} catch (error) {
				writeError(res, error);
			}
		}
	}), "dsh-basics-panel: /basics/api routes");
}
//#endregion
export { Config, apply, inject, name };
