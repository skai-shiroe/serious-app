import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  KeyboardAvoidingView, 
  Platform, 
  useColorScheme,
  ActivityIndicator,
  Keyboard,
  AppState
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useProfileSheet } from '@/contexts/ProfileSheetContext';
import { ArrowLeft, Send, Check, CheckCheck, WifiOff } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getUser } from '@/lib/session';
import { fetchBlockedIds } from '@/lib/moderation';
import { IMAGE_CACHE_POLICY, photoSource, prefetchImages } from '@/lib/images';
import { isRecentlySeen } from '@/hooks/use-presence';
import { notifyUnreadChanged } from '@/hooks/use-unread-count';
import { EmptyState } from '@/components/empty-state';
import {
  CertifiedPhotoBadge,
  IdentityVerifiedIcon,
  isFullyVerified,
} from '@/components/verified-badge';

// Helper pour le temps relatif simplifié
const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/** « Vu à 14:32 » / « Hier à 14:32 » / « Vu le 12/10 » pour l'en-tete. */
const formatSeenAt = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const time = formatTime(dateString);
  if (date.toDateString() === now.toDateString()) return `Vu à ${time}`;
  const yesterday = new Date(now.getTime() - 86400000);
  if (date.toDateString() === yesterday.toDateString()) return `Hier à ${time}`;
  return `Vu le ${date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })}`;
};

/** Ecart mini entre deux evenements broadcast « en train d'ecrire ». */
const TYPING_THROTTLE_MS = 2000;
/** Sans nouveau signal, l'indicateur s'efface tout seul apres ce delai. */
const TYPING_LINGER_MS = 3500;

interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  read: boolean;
  /**
   * Accuse de reception « remis » (2 coches grises) — UNIQUEMENT EN MEMOIRE :
   * jamais ecrit en base, donc aucune migration SQL. Vrai des que le
   * destinataire etait/est devenu en ligne ou a renvoye un signal realtime.
   */
  delivered?: boolean;
  created_at: string;
  /** 'text' (defaut) ou 'sticker' (content = 'sticker:<nom>'). */
  type?: string;
}

export default function ChatScreen() {
  // La liste des discussions transmet le partenaire : l'en-tete s'affiche des
  // l'ouverture (instantane) pendant que le chargement se fait derriere.
  const params = useLocalSearchParams<{
    id: string;
    partnerUserId?: string;
    partnerName?: string;
    partnerPhotos?: string;
    partnerVerified?: string;
  }>();
  const matchId = params.id;
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { openProfileSheet, updateProfileSheet } = useProfileSheet();

  const [currentUser, setCurrentUser] = useState<any>(null);
  // Utilise par le listener realtime : evite de remettre currentUser dans les
  // deps de l'effet d'init (ce qui relancait TOUTE l'init une 2e fois).
  const currentUserRef = useRef<any>(null);
  const [partner, setPartner] = useState<any>(() => {
    if (!params.partnerName) return null;
    let photos: string[] = [];
    try {
      photos = JSON.parse(params.partnerPhotos || '[]');
    } catch {
      photos = [];
    }
    return {
      user_id: params.partnerUserId,
      first_name: params.partnerName,
      photos,
      identity_verified:
        params.partnerVerified === 'id' || params.partnerVerified === 'full',
      genotype_verified: params.partnerVerified === 'full',
    };
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [isPartnerOnline, setIsPartnerOnline] = useState(false);
  // Distingue « conversation vide » de « chargement echoue »
  const [loadError, setLoadError] = useState<string | null>(null);
  // Incremente pour relancer l'initialisation apres un echec
  const [reloadKey, setReloadKey] = useState(0);
  // Blocage bilatral avec le partenaire : l'envoi est coupe dans les deux sens.
  const [chatBlocked, setChatBlocked] = useState(false);
  // Vrai pendant que le partenaire tape (signal broadcast, auto-efface apres
  // TYPING_LINGER_MS sans nouveau signal).
  const [partnerTyping, setPartnerTyping] = useState(false);
  // Dernier heartbeat connu du partenaire, pour « Vu à HH:MM » hors ligne.
  const [partnerLastSeen, setPartnerLastSeen] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  // Canal broadcast de frappe (cree dans un effet dedie, ferme au demontage).
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Throttle d'envoi : trace du dernier evenement broadcast envoye.
  const lastTypingSentRef = useRef<{ at: number; event: 'typing' | 'stop' }>({
    at: 0,
    event: 'stop',
  });

  const themeColors = {
    text: isDark ? '#ffffff' : '#111827',
    textMuted: isDark ? '#9ca3af' : '#6b7280',
    bg: isDark ? '#111827' : '#f9fafb',
    headerBg: isDark ? '#1f2937' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
    inputBg: isDark ? '#374151' : '#ffffff',
    bubbleThem: isDark ? '#374151' : '#f3f4f6',
  };

  /** Envoie un evenement broadcast « frappe » (best effort, sans garantie). */
  const sendTypingEvent = (event: 'typing' | 'stop') => {
    const channel = typingChannelRef.current;
    if (!channel) return;
    lastTypingSentRef.current = { at: Date.now(), event };
    void channel.send({
      type: 'broadcast',
      event,
      payload: { user_id: currentUserRef.current?.id ?? '' },
    });
  };

  /**
   * Passe a « remis » (2 coches grises) tous mes messages encore sur « envoye ».
   * Appele quand le partenaire est en ligne ou nous renvoie un signal realtime.
   * Rien n'est ecrit en base : c'est un etat d'affichage uniquement.
   */
  const markPendingDelivered = () => {
    setMessages((prev) => {
      if (!prev.some((m) => m.sender_id === currentUserRef.current?.id && !m.read && !m.delivered)) {
        return prev;
      }
      return prev.map((m) =>
        m.sender_id === currentUserRef.current?.id && !m.read && !m.delivered
          ? { ...m, delivered: true }
          : m
      );
    });
  };

  // Initialisation
  useEffect(() => {
    const initChat = async () => {
      try {
        setLoadError(null);
        const user = await getUser();

        if (!user) {
          setLoadError('Session expirée. Reconnectez-vous pour continuer.');
          return;
        }

        setCurrentUser(user);
        currentUserRef.current = user;

        // 1 + 3 en PARALLELE : le match sert a trouver le partenaire,
        // l'historique ne depend que du matchId. Avant : 4 requetes en
        // serie + une 2e passe complete (currentUser dans les deps) => 2x
        // plus de travail a chaque ouverture.
        const [matchResult, historyResult, blockedIds] = await Promise.all([
          supabase.from('matches').select('*').eq('id', matchId).maybeSingle(),
          supabase
            .from('messages')
            .select('*')
            .eq('match_id', matchId)
            .order('created_at', { ascending: false })
            .limit(200),
          // Blocages bilateraux en parallele : aucune latence ajoutee.
          fetchBlockedIds(user.id),
        ]);

        const { data: match, error: matchError } = matchResult;
        if (matchError) throw matchError;

        // (maybeSingle : un match supprimé ne doit pas passer pour un chat vide)
        if (!match) {
          setLoadError("Cette conversation n'existe plus.");
          return;
        }

        // 3. Historique des que dispo : la liste se remplit pendant que le
        //    profil du partenaire finit d'etre charge.
        const { data: history, error: historyError } = historyResult;
        if (historyError) throw historyError;

        // Reçu du plus récent au plus ancien : on remet dans l'ordre du chat.
        setMessages((history || []).slice().reverse());

        // 2. Récupérer le profil du partenaire
        const partnerId = match.user_id_1 === user.id ? match.user_id_2 : match.user_id_1;
        setChatBlocked(blockedIds.has(partnerId));
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('user_id, first_name, photos, identity_verified, genotype_verified')
          .eq('user_id', partnerId)
          .maybeSingle();

        if (profileError) throw profileError;

        setPartner(profile);

        // Avatar du partenaire en cache des l'arrivee : pas de flash gris
        if (profile?.photos?.length) prefetchImages(profile.photos);

        // 4. Marquer comme lu EN ARRIERE-PLAN : ca ne bloque plus
        //    l'affichage de la conversation.
        supabase
          .from('messages')
          .update({ read: true })
          .eq('match_id', matchId)
          .neq('sender_id', user.id)
          .eq('read', false)
          .then(() => {
            // Le badge non-lus de l'onglet Messages se met a jour tout de
            // suite (l'UPDATE realtime de la table messages n'est pas
            // toujours dans la publication Supabase).
            notifyUnreadChanged();
          });
      } catch {
        setLoadError(
          'Impossible de charger la conversation. Vérifiez votre connexion puis réessayez.'
        );
      } finally {
        setLoading(false);
      }
    };

    initChat();

    // 5. Realtime Subscription
    const channel = supabase
      .channel(`chat:${matchId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages',
        filter: `match_id=eq.${matchId}` 
      }, (payload) => {
        const newMessage = payload.new as Message;
        // Dedup par id : le message peut deja etre la (insertion optimiste
        // de l'envoi local) — dans ce cas on ne l'ajoute pas une 2e fois.
        setMessages(prev =>
          prev.some(m => m.id === newMessage.id) ? prev : [...prev, newMessage]
        );
        
        // Message du partenaire : il n'est plus en train d'ecrire, et mes
        // messages en attente sont considers remis (2 coches grises).
        if (newMessage.sender_id !== currentUserRef.current?.id) {
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          setPartnerTyping(false);
          markPendingDelivered();
          supabase
            .from('messages')
            .update({ read: true })
            .eq('id', newMessage.id)
            .then(() => notifyUnreadChanged());
        }
      })
      .on('postgres_changes', {
        // Changement d'etat de lecture cote partenaire (read=false -> true).
        // Si la publication Supabase n'inclut pas les UPDATE, le fallback
        // AppState ci-dessous rattrape l'ecart au retour au premier plan.
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `match_id=eq.${matchId}`,
      }, (payload) => {
        const updated = payload.new as Message;
        if (!updated?.id) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === updated.id
              ? { ...m, read: updated.read, delivered: updated.read || m.delivered }
              : m
          )
        );
        notifyUnreadChanged();
      })
      .subscribe();

    // Fallback realtime : re-synchrone l'historique au retour au premier plan
    // (certains UPDATE realtime ont pu etre manques pendant l'arriere-plan).
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const resync = async () => {
        try {
          const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('match_id', matchId)
            .order('created_at', { ascending: true });
          if (error || !data) return;
          setMessages((prev) => {
            const localById = new Map(prev.map((m) => [m.id, m]));
            return (data as Message[]).map((m) => {
              const local = localById.get(m.id);
              return { ...m, delivered: m.read || local?.read || local?.delivered || false };
            });
          });
        } catch {}
      };
      void resync();
    });

    return () => {
      appStateSubscription.remove();
      supabase.removeChannel(channel);
    };
    // Deps SANS currentUser : setCurrentUser(user) declenchait une seconde
    // passe complete de l'init (double requetes + double abonnement realtime).
  }, [matchId, reloadKey]);

  // Presence du partenaire en TEMPS REEL : un seul abonnement, plus aucune
  // lecture toutes les 30 s. Le heartbeat d'ecriture est desormais global
  // (hooks/use-presence) : il fonctionne meme hors de l'ecran de chat.
  useEffect(() => {
    if (!partner?.user_id) return;

    let cancelled = false;
    const apply = (lastSeen?: string | null) => {
      if (cancelled) return;
      setPartnerLastSeen(lastSeen ?? null);
      const online = isRecentlySeen(lastSeen);
      setIsPartnerOnline(online);
      // Le destinataire est actif : mes messages en attente sont remis
      if (online) markPendingDelivered();
    };

    supabase
      .from('presence')
      .select('last_seen')
      .eq('user_id', partner.user_id)
      .maybeSingle()
      .then(({ data }) => apply(data?.last_seen));

    const channel = supabase
      .channel(`presence:${partner.user_id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'presence',
        filter: `user_id=eq.${partner.user_id}`,
      }, (payload: any) => apply(payload?.new?.last_seen))
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [partner?.user_id]);

  // WhatsApp : indicateur « en train d'ecrire ». Broadcast realtime pur (aucune
  // ligne en base, latence ~100 ms), throttle a l'envoi, auto-efface si le
  // signal s'arrete (TYPING_LINGER_MS).
  useEffect(() => {
    if (!matchId || chatBlocked) return;

    const channel = supabase.channel(`typing:${matchId}`, {
      config: { broadcast: { self: false } },
    });
    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload?.user_id || payload.user_id === currentUserRef.current?.id) return;
        setPartnerTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setPartnerTyping(false), TYPING_LINGER_MS);
      })
      .on('broadcast', { event: 'stop' }, ({ payload }) => {
        if (payload?.user_id && payload.user_id === currentUserRef.current?.id) return;
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        setPartnerTyping(false);
      })
      .subscribe();
    typingChannelRef.current = channel;

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      // Signale l'arret avant fermeture (best effort : le timeout couvre le
      // cas ou ce paquet ne part pas).
      void channel.send({
        type: 'broadcast',
        event: 'stop',
        payload: { user_id: currentUserRef.current?.id ?? '' },
      });
      supabase.removeChannel(channel);
      typingChannelRef.current = null;
      setPartnerTyping(false);
    };
  }, [matchId, chatBlocked]);

  // WhatsApp : quand le clavier s'ouvre, ramener le dernier message au-dessus
  // de la barre de saisie (le KAV pousse deja l'input, la liste doit suivre).
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, []);

  // WhatsApp : tap sur l'en-tete -> fiche complete du partenaire (la meme
  // bottom sheet que sur le deck Match). Elle s'ouvre IMMEDIATEMENT avec les
  // donnees deja en memoire (prénom, photos, badges) puis s'enrichit avec la
  // fiche complete des que la requete revient : un echec reseau ne bloque
  // plus l'ouverture.
  const openPartnerProfile = async () => {
    if (!partner?.user_id) return;
    openProfileSheet(partner);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', partner.user_id)
        .maybeSingle();
      if (error) throw error;
      if (data) updateProfileSheet(data);
    } catch {}
  };

  const handleSend = async () => {
    if (!inputText.trim() || !currentUser || !matchId || chatBlocked) return;

    const text = inputText.trim();
    setInputText('');
    // L'envoi clot la frappe : on emet un « stop » explicite.
    sendTypingEvent('stop');
    // Pas de Keyboard.dismiss() : comme WhatsApp, le clavier reste ouvert
    // pour ecrire immediatement la suite.

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          match_id: matchId,
          sender_id: currentUser.id,
          content: text,
        })
        .select()
        .single();
      if (error) throw error;
      // Insertion optimiste : le message s'affiche immediatement, sans
      // attendre l'evenement realtime (dedup par id s'il arrive quand meme).
      if (data) {
        // Accuse de reception local : « remis » (2 coches grises) des que le
        // destinataire etait en ligne a l'envoi ; « lu » viendra par realtime.
        setMessages((prev) =>
          prev.some((m) => m.id === data.id)
            ? prev
            : [...prev, { ...data, delivered: isPartnerOnline }]
        );
      }
    } catch {}
  };

  /**
   * Gere la frappe : met a jour le champ ET diffuse « en train d'ecrire »
   * (throttle TYPING_THROTTLE_MS pour ne pas inonder le canal broadcast).
   */
  const handleInputChange = (text: string) => {
    setInputText(text);
    if (!text.trim()) {
      // Champ vide : on arrete explicitement (sinon l'autre reste bloque
      // jusqu'au timeout d'inactivite).
      if (lastTypingSentRef.current.event !== 'stop') sendTypingEvent('stop');
      return;
    }
    if (Date.now() - lastTypingSentRef.current.at >= TYPING_THROTTLE_MS) {
      sendTypingEvent('typing');
    }
  };

  const renderBubble = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === currentUser?.id;

    // Anciens stickers de test (fonctionnalité reportée) : au lieu d'afficher
    // la note brute ('sticker:joy'), on affiche un 🎏 dans la bulle.
    const isSticker =
      item.type === 'sticker' ||
      (typeof item.content === 'string' && item.content.startsWith('sticker:'));
    if (isSticker) {
      return (
        <View style={[styles.messageWrapper, isMe ? styles.messageWrapperMe : styles.messageWrapperThem]}>
          <Text style={{ fontSize: 64 }}>🎏</Text>
        </View>
      );
    }

    return (
      <View style={[styles.messageWrapper, isMe ? styles.messageWrapperMe : styles.messageWrapperThem]}>
        <View style={[
          styles.bubble, 
          isMe ? styles.bubbleMe : [styles.bubbleThem, { backgroundColor: themeColors.bubbleThem }]
        ]}>
          <Text style={[styles.messageText, isMe ? styles.messageTextMe : { color: themeColors.text }]}>
            {item.content}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[styles.timeText, { color: themeColors.textMuted }]}>{formatTime(item.created_at)}</Text>
          {isMe &&
            (item.read ? (
              <CheckCheck size={14} color="#34B7F1" />
            ) : item.delivered ? (
              <CheckCheck size={14} color={themeColors.textMuted} />
            ) : (
              <Check size={14} color={themeColors.textMuted} />
            ))}
        </View>
      </View>
    );
  };

  // Spinner plein ecran uniquement si on n'a meme pas l'en-tete (deep link
  // direct sans params) : sinon l'en-tete s'affiche d'emblee et le centre
  // montre l'avancement du chargement des messages.
  if (loading && !partner) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: themeColors.bg }]}>
        <ActivityIndicator size="large" color="#f43f5e" />
      </View>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.bg }]}>
        <View style={[styles.header, { backgroundColor: themeColors.headerBg, borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft color={themeColors.text} size={24} />
          </TouchableOpacity>
        </View>
        <EmptyState
          isError
          icon={<WifiOff color={themeColors.textMuted} size={48} />}
          title="Conversation indisponible"
          message={loadError}
          actionLabel="Réessayer"
          onAction={() => {
            setLoading(true);
            setReloadKey((k) => k + 1);
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.bg }]}>
      {/* Android edge-to-edge (SDK 57) : le systeme ignore adjustResize, le KAV
          mesure lui-meme le clavier et pousse la barre de saisie (type WhatsApp). */}
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        
        {/* Header */}
        <View style={[styles.header, { backgroundColor: themeColors.headerBg, borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft color={themeColors.text} size={24} />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.headerInfo} activeOpacity={0.7} onPress={openPartnerProfile}>
            <View>
              <Image
                source={photoSource(partner?.photos)}
                style={styles.headerAvatar}
                cachePolicy={IMAGE_CACHE_POLICY}
                transition={120}
              />
              {isFullyVerified(partner) && (
                <CertifiedPhotoBadge size={20} style={{ bottom: -1, right: -1 }} />
              )}
            </View>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.headerTitle, { color: themeColors.text }]}>{partner?.first_name || 'Chat'}</Text>
                {!isFullyVerified(partner) && partner?.identity_verified && (
                  <IdentityVerifiedIcon size={16} />
                )}
              </View>
              <View style={styles.statusRow}>
                {partnerTyping ? (
                  <Text style={[styles.statusText, styles.typingText]}>{'en train d\'écrire…'}</Text>
                ) : (
                  <>
                    <View style={[styles.statusDot, { backgroundColor: isPartnerOnline ? '#10b981' : '#9ca3af' }]} />
                    <Text style={[styles.statusText, { color: themeColors.textMuted }]}>
                      {isPartnerOnline
                        ? 'En ligne'
                        : partnerLastSeen
                          ? formatSeenAt(partnerLastSeen)
                          : 'Hors ligne'}
                    </Text>
                  </>
                )}
              </View>
            </View>
          </TouchableOpacity>

          <View style={{ width: 40 }} />
        </View>

        {/* Messages */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#f43f5e" />
          </View>
        ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderBubble}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />
      )}

        {/* Input — remplace par une banniere si blocage bilatral. */}
        {chatBlocked ? (
          <View style={[styles.inputContainer, { backgroundColor: themeColors.headerBg, borderTopColor: themeColors.border, paddingBottom: Platform.OS === 'ios' ? 24 : 16, alignItems: 'center' }]}>
            <Text style={{ color: themeColors.textMuted, fontSize: 14, textAlign: 'center' }}>
              Conversation bloquée : vous ne pouvez plus échanger de messages.
            </Text>
          </View>
        ) : (
        <View style={[styles.inputContainer, { backgroundColor: themeColors.headerBg, borderTopColor: themeColors.border, paddingBottom: Platform.OS === 'ios' ? 24 : 16 }]}>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.inputBg, color: themeColors.text, borderColor: themeColors.border }]}
            placeholder="Écrire un message..."
            placeholderTextColor={themeColors.textMuted}
            value={inputText}
            onChangeText={handleInputChange}
            onBlur={() => sendTypingEvent('stop')}
            multiline
          />
          <TouchableOpacity onPress={handleSend} style={styles.sendBtn} disabled={!inputText.trim()}>
            <LinearGradient
              colors={['#f43f5e', '#ec4899']}
              style={styles.sendGradient}
            >
              <Send color="#ffffff" size={20} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
        )}

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    padding: 16, 
    borderBottomWidth: 1,
    zIndex: 10
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20 },
  headerTitle: { fontSize: 17, fontWeight: 'bold' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12 },
  // « en train d'ecrire… » : meme taille que le statut, teinte rose de la marque.
  typingText: { color: '#f43f5e', fontStyle: 'italic', fontWeight: '600' },
  messagesList: { padding: 16, paddingBottom: 24 },
  messageWrapper: { marginBottom: 12, maxWidth: '80%' },
  messageWrapperMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  messageWrapperThem: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18 },
  bubbleMe: { backgroundColor: '#f43f5e', borderBottomRightRadius: 2 },
  bubbleThem: { borderBottomLeftRadius: 2 },
  messageText: { fontSize: 16, lineHeight: 22 },
  messageTextMe: { color: '#ffffff' },
  timeText: { fontSize: 11, marginTop: 4, marginHorizontal: 4 },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, fontSize: 16, marginRight: 10 },
  sendBtn: { width: 44, height: 44, marginBottom: 0 },
  sendGradient: { width: '100%', height: '100%', borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
});
