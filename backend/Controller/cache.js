import NodeCache from "node-cache";
import { createClient } from "redis";

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

		this.redisClient = null;
		this.redisReady = false;
		this.connectPromise = null;

		const redisUrl = process.env.REDIS_URL;
		const redisEnabled = String(process.env.REDIS_ENABLED || "true") !== "false";

		if (!redisEnabled || !redisUrl) {
			return;
		}

		this.redisClient = createClient({ url: redisUrl });

		this.redisClient.on("ready", () => {
			this.redisReady = true;
			console.log("[cache] Redis connected");
		});

		this.redisClient.on("end", () => {
			this.redisReady = false;
			console.warn("[cache] Redis connection closed");
		});

		this.redisClient.on("error", (error) => {
			this.redisReady = false;
			console.warn("[cache] Redis error, using memory cache fallback:", error.message);
		});

		this.connectPromise = this.redisClient.connect().catch((error) => {
			this.redisReady = false;
			console.warn("[cache] Redis unavailable, using memory cache fallback:", error.message);
		});
	}

	async ensureRedisReady() {
		if (!this.redisClient) return false;
		if (this.redisReady) return true;

		if (this.connectPromise) {
			await this.connectPromise;
		}

		return this.redisReady;
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

	// Asynchronous API (Redis-backed)
	async getAsync(key) {
		const memoryValue = this.memory.get(key);
		if (memoryValue !== undefined) {
			return memoryValue;
		}

		const redisAvailable = await this.ensureRedisReady();
		if (!redisAvailable) {
			return undefined;
		}

		try {
			const raw = await this.redisClient.get(key);
			const parsed = this.deserialize(raw);
			if (parsed !== undefined) {
				this.memory.set(key, parsed, DEFAULT_TTL_SECONDS);
			}
			return parsed;
		} catch (error) {
			console.warn("[cache] Redis get failed:", error.message);
			return undefined;
		}
	}

	async setAsync(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
		this.memory.set(key, value, ttlSeconds);

		const redisAvailable = await this.ensureRedisReady();
		if (!redisAvailable) {
			return true;
		}

		try {
			await this.redisClient.setEx(key, ttlSeconds, this.serialize(value));
			return true;
		} catch (error) {
			console.warn("[cache] Redis set failed:", error.message);
			return false;
		}
	}

	async delAsync(keyOrKeys) {
		this.memory.del(keyOrKeys);

		const redisAvailable = await this.ensureRedisReady();
		if (!redisAvailable) {
			return 0;
		}

		try {
			if (Array.isArray(keyOrKeys)) {
				if (keyOrKeys.length === 0) return 0;
				return this.redisClient.del(keyOrKeys);
			}

			return this.redisClient.del(String(keyOrKeys));
		} catch (error) {
			console.warn("[cache] Redis delete failed:", error.message);
			return 0;
		}
	}

	async keysAsync(pattern = "*") {
		const redisAvailable = await this.ensureRedisReady();
		if (redisAvailable) {
			const keys = [];
			try {
				for await (const key of this.redisClient.scanIterator({ MATCH: pattern })) {
					keys.push(key);
				}
			} catch (error) {
				console.warn("[cache] Redis keys scan failed:", error.message);
			}

			// Keep memory cache aligned with Redis key space for consistency
			const localKeys = this.memory.keys().filter((key) => !keys.includes(key));
			if (localKeys.length > 0) {
				this.memory.del(localKeys);
			}

			return keys;
		}

		const matcher = globToRegExp(pattern);
		return this.memory.keys().filter((key) => matcher.test(key));
	}
}

const cache = new HybridCache();

export default cache;
