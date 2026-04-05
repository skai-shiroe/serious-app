import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

Deno.serve(async (req: any) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const payload = await req.json()
    const coachingPost = payload.record 

    if (!coachingPost) {
      return new Response("Aucun enregistrement de coaching trouvé", { status: 400 })
    }

    // Récupérer tous les profils avec un token push valide
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('push_token')
      .not('push_token', 'is', null)

    if (error || !profiles) throw error

    const notifications: any[] = []

    for (const profile of profiles) {
      if (profile.push_token) {
        notifications.push({
          to: profile.push_token,
          title: "✨ Nouveau Conseil de Coaching !",
          body: `Découvrez notre nouveau conseil : "${coachingPost.title}"`,
          data: { 
            type: "coaching",
            id: coachingPost.id
          },
        })
      }
    }

    // L'API Expo accepte des lots contenant jusqu'à 100 messages maximum
    const EXPO_CHUNK_SIZE = 100
    const chunks = []
    
    for (let i = 0; i < notifications.length; i += EXPO_CHUNK_SIZE) {
      chunks.push(notifications.slice(i, i + EXPO_CHUNK_SIZE))
    }

    let successCount = 0

    // Envoi de chaque lot de notifications
    for (const chunk of chunks) {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      })
      
      const responseJson = await res.json()
      console.log('Réponse Expo API pour le lot:', responseJson)
      // Si la requête globale est réussie, l'API renvoie { data: [...] }
      if (responseJson.data) {
        successCount += responseJson.data.length
      }
    }

    return new Response(JSON.stringify({ success: true, count: successCount }), {
      headers: { "Content-Type": "application/json" },
    })

  } catch (err) {
    console.error(err)
    return new Response(String(err), { status: 500 })
  }
})
