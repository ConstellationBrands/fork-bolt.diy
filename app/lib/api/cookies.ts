function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | null) {
  const cookies: Record<string, string> = {};

  if (!cookieHeader) {
    return cookies;
  }

  // Split the cookie string by semicolons and spaces
  const items = cookieHeader.split(';').map((cookie) => cookie.trim());

  items.forEach((item) => {
    const [name, ...rest] = item.split('=');

    if (!name || rest.length === 0) {
      return;
    }

    // Decode the name and value, and join value parts in case it contains '='
    const decodedName = safeDecodeURIComponent(name.trim());
    const decodedValue = safeDecodeURIComponent(rest.join('=').trim());

    if (decodedName === null || decodedValue === null) {
      return;
    }

    cookies[decodedName] = decodedValue;
  });

  return cookies;
}

export function getApiKeysFromCookie(cookieHeader: string | null): Record<string, string> {
  const cookies = parseCookies(cookieHeader);

  if (!cookies.apiKeys) {
    return {};
  }

  try {
    const parsed = JSON.parse(cookies.apiKeys) as Record<string, string>;

    // Strip blank values
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => v && v.trim()));
  } catch {
    return {};
  }
}

export function getProviderSettingsFromCookie(cookieHeader: string | null): Record<string, any> {
  const cookies = parseCookies(cookieHeader);

  if (!cookies.providers) {
    return {};
  }

  try {
    const parsed = JSON.parse(cookies.providers) as Record<string, any>;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}
