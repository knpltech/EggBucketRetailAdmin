import axios from "axios";
import { ADMIN_PATH } from "../constant";

const CACHE_KEY = "eggbucket:admin:user-info:all:v1";
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

export const patchCachedUserInfoCustomer = (customerId, updater) => {
  if (!customerId || typeof updater !== "function") return;

  const payload = memoryPayload || readSessionPayload();
  if (!payload) return;

  const patchRows = (rows) => {
    if (!Array.isArray(rows)) return rows;
    return rows.map((row) => (row.id === customerId ? updater(row) : row));
  };

  const nextPayload = Array.isArray(payload)
    ? patchRows(payload)
    : {
        ...payload,
        customers: patchRows(payload.customers),
      };

  writePayload(nextPayload);
};
