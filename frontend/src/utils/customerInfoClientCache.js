import axios from "axios";
import { ADMIN_PATH } from "../constant";

const CACHE_KEY = "eggbucket:admin:user-info:all:v1";
const AI_SUGGESTIONS_CACHE_KEY = "eggbucket:admin:ai-suggestions:d1d3:v1";
const CACHE_TTL_MS = 2 * 60 * 1000;

let memoryPayload = null;
let memoryExpiresAt = 0;
let inFlightRequest = null;

const isFresh = (expiresAt) => Number(expiresAt) > Date.now();

const readSessionPayload = () => {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw);
    if (!cached || !isFresh(cached.expiresAt)) return null;

    memoryPayload = cached.payload;
    memoryExpiresAt = cached.expiresAt;
    return cached.payload;
  } catch {
    return null;
  }
};

const writePayload = (payload) => {
  const expiresAt = Date.now() + CACHE_TTL_MS;
  memoryPayload = payload;
  memoryExpiresAt = expiresAt;

  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        payload,
        expiresAt,
      }),
    );
  } catch {
    // Ignore storage errors; the in-memory cache still prevents duplicate reads.
  }
};

export const getCachedUserInfo = async () => {
  if (memoryPayload && isFresh(memoryExpiresAt)) return memoryPayload;

  const sessionPayload = readSessionPayload();
  if (sessionPayload) return sessionPayload;

  if (!inFlightRequest) {
    inFlightRequest = axios
      .get(`${ADMIN_PATH}/user-info`)
      .then((response) => {
        writePayload(response.data);
        return response.data;
      })
      .finally(() => {
        inFlightRequest = null;
      });
  }

  return inFlightRequest;
};

export const getCachedAISuggestionCandidates = async () => {
  const readAISessionPayload = () => {
    try {
      const raw = sessionStorage.getItem(AI_SUGGESTIONS_CACHE_KEY);
      if (!raw) return null;

      const cached = JSON.parse(raw);
      if (!cached || !isFresh(cached.expiresAt)) return null;

      return cached.payload;
    } catch {
      return null;
    }
  };

  const sessionPayload = readAISessionPayload();
  if (sessionPayload) return sessionPayload;

  const response = await axios.get(`${ADMIN_PATH}/ai-suggestions/candidates`);
  const payload = response.data;
  const expiresAt = Date.now() + CACHE_TTL_MS;

  try {
    sessionStorage.setItem(
      AI_SUGGESTIONS_CACHE_KEY,
      JSON.stringify({
        payload,
        expiresAt,
      }),
    );
  } catch {
    // Ignore storage errors; the backend cache still reduces reads.
  }

  return payload;
};

export const patchCachedUserInfoCustomer = (customerId, updater) => {
  if (!customerId || typeof updater !== "function") return;

  const patchRows = (rows) => {
    if (!Array.isArray(rows)) return rows;
    return rows.map((row) => (row.id === customerId ? updater(row) : row));
  };

  const payload = memoryPayload || readSessionPayload();
  if (payload) {
    const nextPayload = Array.isArray(payload)
      ? patchRows(payload)
      : {
          ...payload,
          customers: patchRows(payload.customers),
        };

    writePayload(nextPayload);
  }

  try {
    const raw = sessionStorage.getItem(AI_SUGGESTIONS_CACHE_KEY);
    if (!raw) return;

    const cached = JSON.parse(raw);
    if (!cached || !isFresh(cached.expiresAt)) return;

    sessionStorage.setItem(
      AI_SUGGESTIONS_CACHE_KEY,
      JSON.stringify({
        ...cached,
        payload: patchRows(cached.payload),
      }),
    );
  } catch {
    // Ignore storage errors; local React state is already updated.
  }
};

export const invalidateClientUserInfoCache = () => {
  try {
    sessionStorage.removeItem(CACHE_KEY);
    memoryPayload = null;
    memoryExpiresAt = 0;
  } catch (err) {
    console.error("Failed to invalidate cache", err);
  }
};
