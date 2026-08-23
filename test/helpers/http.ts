export const getSetCookies = (headers: Record<string, unknown>): string[] => {
  const value = headers["set-cookie"];

  if (Array.isArray(value)) {
    return value.filter((cookie): cookie is string => typeof cookie === "string");
  }

  return typeof value === "string" ? [value] : [];
};

export const getCookiePair = (setCookie: string): string => setCookie.split(";", 1)[0] ?? "";

export const getCookieValue = (cookiePair: string): string => {
  const separator = cookiePair.indexOf("=");
  return separator >= 0 ? cookiePair.slice(separator + 1) : "";
};
