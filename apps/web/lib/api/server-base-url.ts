import "server-only";

const DEFAULT_API_SERVER_BASE_URL = "http://localhost:3000/api/v1";

export function getApiServerBaseUrl() {
  const configured = process.env.API_SERVER_BASE_URL?.trim();
  return (configured || DEFAULT_API_SERVER_BASE_URL).replace(/\/+$/, "");
}
