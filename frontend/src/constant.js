const PRODUCTION_ADMIN_PATH = "https://eggbucketretailadmin.onrender.com/api/admin";
const LOCAL_ADMIN_PATH = "/api/admin";

const configuredAdminPath = import.meta.env.VITE_ADMIN_PATH?.trim();
const isLocalhostUrl = (url = "") => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url);

export const ADMIN_PATH =
  configuredAdminPath && !(import.meta.env.PROD && isLocalhostUrl(configuredAdminPath))
    ? configuredAdminPath
    : import.meta.env.PROD
      ? PRODUCTION_ADMIN_PATH
      : LOCAL_ADMIN_PATH;
