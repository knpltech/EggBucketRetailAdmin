const PRODUCTION_ADMIN_PATH = "https://eggbucketretailadmin.onrender.com/api/admin";
const LOCAL_ADMIN_PATH = "/api/admin";

const configuredAdminPath = import.meta.env.VITE_ADMIN_PATH?.trim();
const isHttpUrl = (url = "") => /^https?:\/\//i.test(url);
const isLocalhostUrl = (url = "") => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url);
const isValidProductionUrl = (url = "") => isHttpUrl(url) && !isLocalhostUrl(url);

export const ADMIN_PATH =
  configuredAdminPath && (!import.meta.env.PROD || isValidProductionUrl(configuredAdminPath))
    ? configuredAdminPath
    : import.meta.env.PROD
      ? PRODUCTION_ADMIN_PATH
      : LOCAL_ADMIN_PATH;
