import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

Deno.serve(async (req: any) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const payload = await req.json()
    const message = payload.record

    if (!message) {
      return new Response("Aucun message trouvé", { status: 400 })
    }

    const { sender_id, match_id } = message

    const { data: matchData, error: matchError } = await supabase
      .from('matches')
      .select('user_id_1, user_id_2')
      .eq('id', match_id)
      .single()

    if (matchError || !matchData) throw matchError

    const recipientId = matchData.user_id_1 === sender_id ? matchData.user_id_2 : matchData.user_id_1

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, first_name, push_token')
      .in('user_id', [sender_id, recipientId])

    if (profilesError || !profiles) throw profilesError

    const senderProfile = (profiles as any[]).find((p: any) => p.user_id === sender_id)
    const recipientProfile = (profiles as any[]).find((p: any) => p.user_id === recipientId)

    if (recipientProfile?.push_token) {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: recipientProfile.push_token,
          title: "💬 Nouveau message",
          body: `${senderProfile?.first_name || "Quelqu'un"} vous a envoyé un message`,
          data: { type: "message", match_id: match_id },
        }),
      })

      console.log('Réponse Expo API:', await res.json())
      
      return new Response(JSON.stringify({ success: true, notified: true }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify({ success: true, notified: false, reason: "Aucun token push pour l'utilisateur" }), {
      headers: { "Content-Type": "application/json" },
    })

  } catch (err) {
    console.error(err)
    return new Response(String(err), { status: 500 })
  }
})
