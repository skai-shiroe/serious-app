// Suppression de compte — exigence Google Play + App Store : l'utilisateur
// doit pouvoir supprimer son compte DANS l'app. 
//
// Purge les fichiers Storage et les données avant de supprimer l'identité Auth.
// Toute erreur de purge laisse le compte Auth actif pour permettre une reprise.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const fail = (step: string, message: string, status = 500) =>
  json({ error: message, step }, status)

Deno.serve(async (req: any) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceKey) {
      return fail('env', 'Variables d\'environnement manquantes (SUPABASE_URL / SERVICE_ROLE_KEY)', 500)
    }

    // 1. Identite de l'appelant : le JWT du client, valide cote serveur.
    //    getUser(token) EST obligatoire : sans argument, auth-js tente de
    //    lire une session dans un stockage local absent sous Deno Edge
    //    Runtime et echoue avec "Auth session missing!" sans meme appeler
    //    le serveur.
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return fail('auth', 'Non authentifié', 401)
    }
    const asUser = createClient(supabaseUrl, serviceKey)
    const {
      data: { user },
      error: userError,
    } = await asUser.auth.getUser(token)

    if (userError || !user) {
      return fail('auth', userError?.message || 'Non authentifié', 401)
    }

    const uid = user.id
    const admin = createClient(supabaseUrl, serviceKey)

    const isBenign = (e: any) => e?.code === '42P01' || e?.code === 'PGRST204' || e?.code === '42703'
    const purgeErrors: string[] = []
    const drop = async (table: string, apply: (q: any) => any) => {
      try {
        const { error } = await apply(admin.from(table).delete())
        if (error && !isBenign(error)) {
          console.warn(`[delete-account] ${table}:`, error.message)
          purgeErrors.push(`${table}: ${error.message}`)
        }
      } catch (e) {
        console.warn(`[delete-account] ${table}:`, (e as any)?.message)
        purgeErrors.push(`${table}: ${(e as any)?.message}`)
      }
    }

    const purgeStorageFolder = async (bucket: string, folder: string, depth = 0): Promise<void> => {
      if (depth > 8) throw new Error(`${bucket}/${folder}: profondeur de dossiers inattendue`)
      for (;;) {
        const { data: entries, error } = await admin.storage.from(bucket).list(folder, { limit: 100, offset: 0 })
        if (error) throw new Error(`${bucket}/${folder}: ${error.message}`)
        if (!entries?.length) return

        const files: string[] = []
        for (const entry of entries) {
          const path = `${folder}/${entry.name}`
          if (entry.id == null) await purgeStorageFolder(bucket, path, depth + 1)
          else files.push(path)
        }
        if (files.length) {
          const { error: removeError } = await admin.storage.from(bucket).remove(files)
          if (removeError) throw new Error(`${bucket}/${folder}: ${removeError.message}`)
        } else if (entries.every((entry: any) => entry.id == null)) {
          // Recursive removal should have emptied all folders. Re-list to
          // allow Storage to remove their now-empty prefixes.
          continue
        }
      }
    }

    // Storage is purged first: if it fails, no profile or Auth identity is
    // removed and the user can retry. Both buckets store objects below uid/.
    try {
      await purgeStorageFolder('avatars', uid)
      await purgeStorageFolder('verifications', uid)
    } catch (e: any) {
      return fail('purge-storage', e?.message || 'Impossible de supprimer les fichiers du compte')
    }

    // Conversations de l'utilisateur : leurs messages partent avec.
    const { data: matches, error: matchesError } = await admin
      .from('matches')
      .select('id')
      .or(`user_id_1.eq.${uid},user_id_2.eq.${uid}`)
    if (matchesError) {
      return fail('fetch-matches', matchesError.message)
    }
    const matchIds = (matches || []).map((m: any) => m.id)

    if (matchIds.length > 0) {
      await drop('messages', (q) => q.in('match_id', matchIds))
    }
    await drop('messages', (q) => q.eq('sender_id', uid))
    await drop('matches', (q) => q.or(`user_id_1.eq.${uid},user_id_2.eq.${uid}`))
    await drop('swipes', (q) => q.or(`swiper_id.eq.${uid},swiped_id.eq.${uid}`))
    await drop('presence', (q) => q.eq('user_id', uid))
    await drop('coaching_favorites', (q) => q.eq('user_id', uid))
    await drop('coaching_likes', (q) => q.eq('user_id', uid))
    await drop('coaching_comments', (q) => q.eq('user_id', uid))
    await drop('verifications', (q) => q.eq('user_id', uid))
    await drop('push_throttle', (q) => q.eq('user_id', uid))
    await drop('user_blocks', (q) => q.or(`user_id.eq.${uid},blocked_user_id.eq.${uid}`))
    await drop('user_reports', (q) => q.or(`reporter_id.eq.${uid},reported_user_id.eq.${uid}`))
    await drop('profiles', (q) => q.eq('user_id', uid))

    if (purgeErrors.length) {
      return fail('purge-data', purgeErrors.join('; '))
    }

    // 2. Derniere etape : auth.users. Les FK restantes vers auth.users
    //    (s'il en existe) cascade ; sinon les lignes sont deja parties.
    const { error: deleteError } = await admin.auth.admin.deleteUser(uid)
    if (deleteError) {
      return fail('delete-auth-user', deleteError.message)
    }

    return json({ ok: true })
  } catch (e) {
    console.error('[delete-account]', e)
    return fail('unhandled', (e as any)?.message || 'Erreur inattendue')
  }
})
