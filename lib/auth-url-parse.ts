export type ParsedAuthUrl =
  | { kind: 'error'; message: string }
  | { kind: 'code'; code: string }
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'unknown' };

/**
 * Extrait les parametres d'une URL sans jamais utiliser new URL() :
 * certains formats de deep link (seriousapp://) font echouer le parseur WHATWG.
 */
function safeParams(url: string, sep: '?' | '#'): URLSearchParams {
  const idx = url.indexOf(sep);
  if (idx === -1) return new URLSearchParams('');
  const raw = url.slice(idx + 1);
  return new URLSearchParams(sep === '#' ? raw : raw.split('#')[0]);
}

function decodeSafe(value: string): string {
  // URLSearchParams.get() decode deja : on se protege d un double decodage
  // (une valeur contenant un pourcent litteral ferait crasher decodeURIComponent).
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function firstPair(...pairs: Array<[URLSearchParams, string]>): string | null {
  for (const [params, key] of pairs) {
    const value = params.get(key);
    if (value) return value;
  }
  return null;
}

/**
 * Normalise le retour d'authentification Supabase, quel que soit le flow :
 *   - PKCE      : seriousapp://auth-callback?code=...
 *   - implicite : seriousapp://auth-callback#access_token=...&refresh_token=...
 *   - erreur    : ?error=... / #error=...
 */
export function parseAuthUrl(url: string | null | undefined): ParsedAuthUrl {
  if (!url) return { kind: 'unknown' };

  const query = safeParams(url, '?');
  const hash = safeParams(url, '#');

  const error = firstPair(
    [query, 'error_description'],
    [hash, 'error_description'],
    [query, 'error'],
    [hash, 'error']
  );
  if (error) {
    return { kind: 'error', message: decodeSafe(error) };
  }

  const code = query.get('code');
  if (code) return { kind: 'code', code };

  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  if (accessToken && refreshToken) {
    return { kind: 'tokens', accessToken, refreshToken };
  }

  return { kind: 'unknown' };
}
