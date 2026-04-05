import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

Deno.serve(async (req: any) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const payload = await req.json()
    const match = payload.record 

    if (!match) {
      return new Response("Aucun enregistrement de match trouvé", { status: 400 })
    }

    const userId1 = match.user_id_1
    const userId2 = match.user_id_2

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('user_id, first_name, push_token')
      .in('user_id', [userId1, userId2])

    if (error || !profiles) throw error

    const profile1 = (profiles as any[]).find((p: any) => p.user_id === userId1)
    const profile2 = (profiles as any[]).find((p: any) => p.user_id === userId2)

    const notifications: any[] = []

    if (profile1?.push_token) {
      notifications.push({
        to: profile1.push_token,
        title: "🎉 Nouveau Match !",
        body: `Vous avez un nouveau match avec ${profile2?.first_name || "quelqu'un"} !`,
        data: { type: "match" },
      })
    }

    if (profile2?.push_token) {
      notifications.push({
        to: profile2.push_token,
        title: "🎉 Nouveau Match !",
        body: `Vous avez un nouveau match avec ${profile1?.first_name || "quelqu'un"} !`,
        data: { type: "match" },
      })
    }

    if (notifications.length > 0) {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notifications),
      })
      console.log('Réponse Expo API:', await res.json())
    }

    return new Response(JSON.stringify({ success: true, count: notifications.length }), {
      headers: { "Content-Type": "application/json" },
    })

  } catch (err) {
    console.error(err)
    return new Response(String(err), { status: 500 })
  }
})
