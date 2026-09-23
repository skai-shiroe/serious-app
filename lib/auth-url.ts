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

export function resetAuthUrlGuard() {
  handledCode = null;
  handledToken = null;
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
      handledCode = parsed.code;
      const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
      if (error) {
        handledCode = null;
        return { status: 'error', message: error.message };
      }
      return { status: 'session' };
    }

    case 'tokens': {
      if (parsed.accessToken === handledToken) return { status: 'already-handled' };
      handledToken = parsed.accessToken;
      const { error } = await supabase.auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken,
      });
      if (error) {
        handledToken = null;
        return { status: 'error', message: error.message };
      }
      return { status: 'session' };
    }

    default:
      return { status: 'none' };
  }
}
