export const getCookies = () => {
  try {
    const cookies = document.cookie.split(";").reduce((res, c) => {
      const [key, val] = c.trim().split("=").map(decodeURIComponent);
      try {
        return Object.assign(res, { [key]: JSON.parse(val) });
      } catch (e) {
        return Object.assign(res, { [key]: val });
      }
    }, {} as Record<string, string>);
    return cookies;
  } catch {
    return {} as Record<string, string>;
  }
};

export const getCookie = (key: string): string => {
  const cookieList = getCookies();
  return Object.prototype.hasOwnProperty.call(cookieList, key)
    ? cookieList[key]
    : "";
};

export const setCookie = (key: string, value: string, expDays = 6) => {
  const date = new Date();
  date.setTime(date.getTime() + expDays * 24 * 60 * 60 * 1000);
  document.cookie = `${key}=${value}; expires=${date.toUTCString()}; path=/`;
};
