import NodeCache from "node-cache";

const DEFAULT_TTL_SECONDS = 300;

const globToRegExp = (pattern = "*") => {
	const escaped = String(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const regexPattern = `^${escaped.replace(/\*/g, ".*")}$`;
	return new RegExp(regexPattern);
};

class HybridCache {
	constructor() {
		this.memory = new NodeCache({
			stdTTL: DEFAULT_TTL_SECONDS,
			checkperiod: DEFAULT_TTL_SECONDS + 20,
			useClones: false,
		});
	}

	deserialize(raw) {
		if (raw === null || raw === undefined) return undefined;
		try {
			return JSON.parse(raw);
		} catch {
			return undefined;
		}
	}

	serialize(value) {
		return JSON.stringify(value);
	}

	// Synchronous API (existing usage)
	get(key) {
		return this.memory.get(key);
	}

	set(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
		return this.memory.set(key, value, ttlSeconds);
	}

	del(keyOrKeys) {
		return this.memory.del(keyOrKeys);
	}

	keys() {
		return this.memory.keys();
	}

	// Asynchronous API
	async getAsync(key) {
		return this.memory.get(key);
	}

	async setAsync(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
		return this.memory.set(key, value, ttlSeconds);
	}

	async delAsync(keyOrKeys) {
		return this.memory.del(keyOrKeys);
	}

	async keysAsync(pattern = "*") {
		const matcher = globToRegExp(pattern);
		return this.memory.keys().filter((key) => matcher.test(key));
	}
}

const cache = new HybridCache();

export default cache;
