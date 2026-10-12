// Suppression de compte — exigence Google Play + App Store : l'utilisateur
// doit pouvoir supprimer son compte DANS l'app. 
//
// Strategie : on identifie l'appelant via son JWT (header Authorization),
// on supprime ses donnees dans les tables connues (best effort : le schema
// peut evoluer, une table absente ne doit pas bloquer la suppression), puis
// on supprime auth.users via la service role. Les tables de moderation
// (user_blocks, user_reports) cascadent deja via leurs FK.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

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

    // 1. Identite de l'appelant : le JWT du client, valide cote serveur.
    const authHeader = req.headers.get('Authorization') ?? ''
    const asUser = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await asUser.auth.getUser()

    if (userError || !user) {
      return json({ error: 'Non authentifié' }, 401)
    }

    const uid = user.id
    const admin = createClient(supabaseUrl, serviceKey)

    // Best effort : on ignore les tables/colonnes absentes du schema actuel
    // (code 42P01 table inexistante, PGRST204 colonne inconnue).
    const isBenign = (e: any) => e?.code === '42P01' || e?.code === 'PGRST204'
    const drop = async (table: string, apply: (q: any) => any) => {
      try {
        const { error } = await apply(admin.from(table).delete())
        if (error && !isBenign(error)) {
          console.warn(`[delete-account] ${table}:`, error.message)
        }
      } catch (e) {
        console.warn(`[delete-account] ${table}:`, (e as any)?.message)
      }
    }

    // Conversations de l'utilisateur : leurs messages partent avec.
    const { data: matches } = await admin
      .from('matches')
      .select('id')
      .or(`user_id_1.eq.${uid},user_id_2.eq.${uid}`)
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
    await drop('push_log', (q) => q.eq('user_id', uid))
    await drop('push_throttle', (q) => q.eq('user_id', uid))
    await drop('user_blocks', (q) => q.or(`user_id.eq.${uid},blocked_user_id.eq.${uid}`))
    await drop('user_reports', (q) => q.or(`reporter_id.eq.${uid},reported_user_id.eq.${uid}`))
    await drop('profiles', (q) => q.eq('user_id', uid))

    // 2. Derniere etape : auth.users. Les FK restantes vers auth.users
    //    (s'il en existe) cascade ; sinon les lignes sont deja parties.
    const { error: deleteError } = await admin.auth.admin.deleteUser(uid)
    if (deleteError) {
      return json({ error: deleteError.message }, 500)
    }

    return json({ ok: true })
  } catch (e) {
    console.error('[delete-account]', e)
    return json({ error: (e as any)?.message || 'Erreur inattendue' }, 500)
  }
})