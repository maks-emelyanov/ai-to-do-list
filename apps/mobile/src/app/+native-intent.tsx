export function redirectSystemPath({ path }: { initial: boolean; path: string }) {
  try {
    const url = new URL(path, 'mobile://');
    const pathWithHost = `${url.hostname}${url.pathname}`;
    const isFirebaseAuthPath =
      url.pathname.includes('/__/auth/') || pathWithHost.includes('__/auth/');

    if (
      isFirebaseAuthPath ||
      url.pathname === '/auth/provider-callback' ||
      url.pathname === '/provider-callback' ||
      (url.hostname === 'auth' && url.pathname === '/provider-callback')
    ) {
      // Let Firebase auth callbacks resolve in JS while Router lands on a valid screen.
      return '/';
    }

    return path;
  } catch {
    return path;
  }
}
