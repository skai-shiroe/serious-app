import { supabase } from '@/lib/supabase';
import { parseAuthUrl } from '@/lib/auth-url-parse';

export type AuthUrlResult =
  | { status: 'session' }
  | { status: 'already-handled' }
  | { status: 'error'; message: string }
  | { status: 'none' };

// Un meme code / access_token ne doit jamais etre traite deux fois :
// le deep link (listener Linking) ET le retour de openAuthSessionAsync
// peuvent le fournir en double.
let handledCode: string | null = null;
let handledToken: string | null = null;
let codeExchange: { value: string; promise: Promise<AuthUrlResult> } | null = null;
let tokenExchange: { value: string; promise: Promise<AuthUrlResult> } | null = null;

export function resetAuthUrlGuard() {
  handledCode = null;
  handledToken = null;
  codeExchange = null;
  tokenExchange = null;
}

/**
 * Termine une connexion a partir d'une URL de retour Supabase.
 * Gere le flow PKCE (code) et le flow implicite (tokens dans le fragment).
 */
export async function completeAuthFromUrl(url: string | null): Promise<AuthUrlResult> {
  const parsed = parseAuthUrl(url);

  switch (parsed.kind) {
    case 'error':
      resetAuthUrlGuard();
      return { status: 'error', message: parsed.message };

    case 'code': {
      if (parsed.code === handledCode) return { status: 'already-handled' };
      if (codeExchange?.value === parsed.code) return codeExchange.promise;

      const pending = (async (): Promise<AuthUrlResult> => {
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
          if (error) return { status: 'error', message: error.message };
          handledCode = parsed.code;
          return { status: 'session' };
        } catch (error: any) {
          return { status: 'error', message: error?.message || 'Impossible de terminer la connexion.' };
        }
      })();
      codeExchange = { value: parsed.code, promise: pending };
      const result = await pending;
      if (codeExchange?.promise === pending) codeExchange = null;
      if (result.status !== 'session') {
        handledCode = null;
      }
      return result;
    }

    case 'tokens': {
      if (parsed.accessToken === handledToken) return { status: 'already-handled' };
      if (tokenExchange?.value === parsed.accessToken) return tokenExchange.promise;

      const pending = (async (): Promise<AuthUrlResult> => {
        try {
          const { error } = await supabase.auth.setSession({
            access_token: parsed.accessToken,
            refresh_token: parsed.refreshToken,
          });
          if (error) return { status: 'error', message: error.message };
          handledToken = parsed.accessToken;
          return { status: 'session' };
        } catch (error: any) {
          return { status: 'error', message: error?.message || 'Impossible de terminer la connexion.' };
        }
      })();
      tokenExchange = { value: parsed.accessToken, promise: pending };
      const result = await pending;
      if (tokenExchange?.promise === pending) tokenExchange = null;
      if (result.status !== 'session') {
        handledToken = null;
      }
      return result;
    }

    default:
      return { status: 'none' };
  }
}
