import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  AppState,
  Modal,
  Pressable,
  Alert
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useProfileSheet } from '@/contexts/ProfileSheetContext';
import { ArrowLeft, Send, Check, CheckCheck, WifiOff, X, Reply, Pencil, Trash2 } from 'lucide-react-native';
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
import { SwipeToReply } from '@/components/swipe-to-reply';
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

/** Cle de jour locale (annee-mois-jour) : sert a grouper la discussion. */
const dayKeyOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** En-tete de section de discussion : « Aujourd'hui » / « Hier » / date. */
const formatDayLabel = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Hier';
  return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
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
  /** Heure de la derniere edition (null si jamais edite) — bloc 14. */
  edited_at?: string | null;
  /** Suppression douce : la ligne reste, l'app affiche « Message supprimé ». */
  is_deleted?: boolean;
  /** Id du message cite (reponse) — null si envoi simple. */
  reply_to_id?: string | null;
}

/** Element de liste : en-tête de jour OU bulle de message. */
type ChatListItem =
  | { kind: 'day'; id: string; label: string }
  | { kind: 'message'; id: string; message: Message };

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
  // Bloc 14 — message selectionne pour le menu d'actions (appui long).
  const [menuMessage, setMenuMessage] = useState<Message | null>(null);
  // Bloc 14 — message cite (reponse) : barre au-dessus du composer.
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  // Bloc 14 — edition en cours : { id, texte initial }.
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  // Canal broadcast de frappe (cree dans un effet dedie, ferme au demontage).
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Throttle d'envoi : trace du dernier evenement broadcast envoye.
  const lastTypingSentRef = useRef<{ at: number; event: 'typing' | 'stop' }>({
    at: 0,
    event: 'stop',
  });
  // Vrai des que le canal de frappe est rejoint (envoi mis en tampon avant).
  const typingJoinedRef = useRef(false);
  // Dernier evenement de frappe a envoyer des que le canal est rejoint.
  const pendingTypingRef = useRef<'typing' | 'stop' | null>(null);
  // Dernier created_at connu : borne du polling de rattrapage (voir effet).
  // Vide tant que l'init n'a pas fixe la borne (le tick saute dans ce cas).
  const lastKnownTsRef = useRef<string>('');
  // Ids envoyes localement + horodatage : le tick ne doit PAS conclure
  // « lu » sur un message dont l'insert serveur est peut-etre encore en vol.
  const recentlySentRef = useRef<Map<string, number>>(new Map());

  const themeColors = {
    text: isDark ? '#ffffff' : '#111827',
    textMuted: isDark ? '#9ca3af' : '#6b7280',
    bg: isDark ? '#111827' : '#f9fafb',
    headerBg: isDark ? '#1f2937' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
    inputBg: isDark ? '#374151' : '#ffffff',
    // Bulle du destinataire : bleu (blanc en texte) — mes bulles restent roses.
    bubbleThem: isDark ? '#1D4ED8' : '#2563EB',
  };

  /** Envoie un evenement broadcast « frappe » (best effort, sans garantie). */
  const sendTypingEvent = (event: 'typing' | 'stop') => {
    const channel = typingChannelRef.current;
    if (!channel) return;
    lastTypingSentRef.current = { at: Date.now(), event };
    // Canal pas encore rejoint : on memorise, l'evenement partira au
    // SUBSCRIBED plutot que de reposer sur un envoi REST fragile.
    if (!typingJoinedRef.current) {
      pendingTypingRef.current = event;
      return;
    }
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
        // Borne du polling de rattrapage : seul le « neuf » sera interroge
        // (history est triee desc => [0] est le plus recent). Conversation
        // vide : on part de maintenant - 60 s pour ne rien rater.
        lastKnownTsRef.current =
          history && history.length
            ? history[0].created_at
            : new Date(Date.now() - 60000).toISOString();

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
        if (new Date(newMessage.created_at).getTime() > new Date(lastKnownTsRef.current).getTime()) {
          lastKnownTsRef.current = newMessage.created_at;
        }
        
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
      .subscribe();

      // Canal SEPARE pour les changements de lecture : si le serveur refuse
      // le binding UPDATE (publication Supabase), seule cette connexion
      // tombe — l'INSERT des messages entrants (canal ci-dessus) continue.
      // Le polling de rattrapage ci-dessous couvre le reste.
      const readChannel = supabase
        .channel(`chat-read:${matchId}`)
        .on('postgres_changes', {
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
      supabase.removeChannel(readChannel);
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
      .subscribe((status) => {
        typingJoinedRef.current = status === 'SUBSCRIBED';
        if (status !== 'SUBSCRIBED') return;
        // Un evenement de frappe a ete mis en tampon pendant la jointure :
        // on le part maintenant que le canal est ouvert.
        const pending = pendingTypingRef.current;
        pendingTypingRef.current = null;
        if (pending) {
          void channel.send({
            type: 'broadcast',
            event: pending,
            payload: { user_id: currentUserRef.current?.id ?? '' },
          });
        }
      });
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

  // Fallback de lecture toutes les 3 s : la realtime (postgres_changes) peut
  // manquer un INSERT (reseau, publication Supabase mal configuree). Ce
  // polling ne recupere QUE le neuf (borne lastKnownTsRef) : les messages
  // arrivent au pire 3 s plus tard sans avoir a sortir et rentrer du chat.
  // Le passage a « lu » (coches bleues) est detecte par la disparition de
  // l'id dans la liste de mes messages encore non lus cote serveur.
  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    let inFlight = false;

    const tick = async () => {
      if (inFlight) return;
      // Borne pas encore posee par l'init (ou init en echec) : on saute.
      if (!lastKnownTsRef.current) return;
      inFlight = true;
      try {
        const myId = currentUserRef.current?.id;
        if (!myId) return;
        // gt= est insensible au format PostgREST : on passe l'ISO brut.
        const [news, myUnread] = await Promise.all([
          supabase
            .from('messages')
            .select('*')
            .eq('match_id', matchId)
            .gt('created_at', lastKnownTsRef.current)
            .order('created_at', { ascending: true }),
          supabase
            .from('messages')
            .select('id')
            .eq('match_id', matchId)
            .eq('sender_id', myId)
            .eq('read', false),
        ]);
        if (cancelled) return;

        const rows = (news.data ?? []) as Message[];
        const stillUnreadIds = new Set((myUnread.data ?? []).map((r) => r.id));

        // Nouveaux messages (partenaire OU soi, si realtime rate l'envoi).
        if (rows.length) {
          lastKnownTsRef.current = rows[rows.length - 1].created_at;
          setMessages((prev) => {
            let next = prev;
            for (const row of rows) {
              if (!prev.some((m) => m.id === row.id)) {
                next = [...next, row];
              }
            }
            return next;
          });
          const fromPartner = rows.filter((r) => r.sender_id !== myId);
          if (fromPartner.length) {
            // Conversation ouverte : le message est lu des son arrivee.
            supabase
              .from('messages')
              .update({ read: true })
              .eq('match_id', matchId)
              .neq('sender_id', myId)
              .eq('read', false)
              .then(() => notifyUnreadChanged());
          }
        }

        // Mes messages : ceux qui n'apparaissent plus dans stillUnreadIds
        // viennent d'etre lus par le partenaire -> coches bleues (UPDATE
        // realtime ou pas).
        setMessages((prev) => {
          let changed = false;
          const next = prev.map((m) => {
            if (m.sender_id !== myId || m.read) return m;
            // Envoi recent : l'insert serveur est peut-etre encore en vol
            // (le message n'existerait pas encore dans stillUnreadIds).
            // On ne conclut pas avant 5 s.
            const sentAt = recentlySentRef.current.get(m.id);
            if (sentAt !== undefined) {
              if (Date.now() - sentAt <= 5000) return m;
              recentlySentRef.current.delete(m.id);
            }
            if (!stillUnreadIds.has(m.id)) {
              changed = true;
              return { ...m, read: true, delivered: true };
            }
            return m;
          });
          return changed ? next : prev;
        });
      } catch {
        // Best effort : le tick suivant reessaie.
      } finally {
        inFlight = false;
      }
    };

    const interval = setInterval(() => { void tick(); }, 3000);
    // Un retour au premier plan doit rattraper IMMEDIATEMENT, pas dans 3 s.
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void tick();
    });
    void tick();

    return () => {
      cancelled = true;
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [matchId, reloadKey]);

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

    // Bloc 14 — validation d'une EDITION : UPDATE, pas d'INSERT.
    if (editing) {
      const text = inputText.trim();
      const editId = editing.id;
      setEditing(null);
      setInputText('');
      sendTypingEvent('stop');
      setMessages((prev) =>
        prev.map((m) =>
          m.id === editId ? { ...m, content: text, edited_at: new Date().toISOString() } : m
        )
      );
      const { error } = await supabase
        .from('messages')
        .update({ content: text, edited_at: new Date().toISOString() })
        .eq('id', editId);
      // Echec (RLS ou bloc 14 non pousse) : on recharge pour revenir au texte serveur.
      if (error) {
        const { data } = await supabase.from('messages').select('*').eq('id', editId).maybeSingle();
        if (data) setMessages((prev) => prev.map((m) => (m.id === editId ? (data as Message) : m)));
      }
      return;
    }

    const text = inputText.trim();
    setInputText('');
    // Bloc 14 — citation jointe a l'envoi (puis la barre se referme).
    const quoted = replyTo;
    setReplyTo(null);
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
          // Bloc 14 — citation (null si envoi simple ; colonne absente
          // tant que le bloc 14 n'est pas pousse -> on reessaie sans).
          ...(quoted ? { reply_to_id: quoted.id } : {}),
        })
        .select()
        .single();
      if (error) {
        // Colonne reply_to_id inconnue : renvoi simple sans citation.
        if (quoted && /reply_to_id|column|schema cache/i.test(error.message ?? '')) {
          const retry = await supabase
            .from('messages')
            .insert({ match_id: matchId, sender_id: currentUser.id, content: text })
            .select()
            .single();
          if (retry.error) throw retry.error;
          if (retry.data) {
            recentlySentRef.current.set(retry.data.id, Date.now());
            setMessages((prev) =>
              prev.some((m) => m.id === (retry.data as Message).id)
                ? prev
                : [...prev, { ...(retry.data as Message), delivered: isPartnerOnline }]
            );
          }
          return;
        }
        throw error;
      }
      // Insertion optimiste : le message s'affiche immediatement, sans
      // attendre l'evenement realtime (dedup par id s'il arrive quand meme).
      if (data) {
        // Accuse de reception local : « remis » (2 coches grises) des que le
        // destinataire etait en ligne a l'envoi ; « lu » viendra par realtime.
        recentlySentRef.current.set(data.id, Date.now());
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

  /**
   * Bloc 14 — appui long sur une bulle : ouvre le menu d'actions.
   * Messages supprimes : aucun menu (rien a faire dessus).
   */
  const openMessageMenu = (item: Message) => {
    if (item.is_deleted) return;
    setMenuMessage(item);
  };

  /** Bloc 14 — citer : pré-remplit la barre de citation au-dessus du composer. */
  const startReply = (item: Message) => {
    setMenuMessage(null);
    setEditing(null);
    setReplyTo(item);
    // Swipe-pour-repondre (comme WhatsApp) : le clavier s'ouvre aussitot.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  /** Bloc 14 — éditer : le texte revient dans le champ, validation = UPDATE. */
  const startEdit = (item: Message) => {
    setMenuMessage(null);
    setReplyTo(null);
    setEditing({ id: item.id, text: item.content });
    setInputText(item.content);
  };

  /**
   * Bloc 14 — suppression DOUCE (soft) : la ligne reste en base
   * (modération/admin), l'app affiche « Message supprimé ».
   * Optimiste + rollback si l'UPDATE est refuse (RLS / bloc 14 non poussé).
   */
  const deleteMessage = (item: Message) => {
    setMenuMessage(null);
    Alert.alert('Supprimer ce message ?', 'Il sera remplacé par « Message supprimé ».', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          setMessages((prev) =>
            prev.map((m) => (m.id === item.id ? { ...m, is_deleted: true } : m))
          );
          void (async () => {
            const { error } = await supabase
              .from('messages')
              .update({ is_deleted: true })
              .eq('id', item.id);
            // Echec : rollback vers le contenu d'origine (serveur inchangé).
            if (error) {
              setMessages((prev) =>
                prev.map((m) => (m.id === item.id ? { ...m, is_deleted: false } : m))
              );
            }
          })();
        },
      },
    ]);
  };

  const renderBubble = (item: Message) => {
    const isMe = item.sender_id === currentUser?.id;

    // Bloc 14 — message SUPPRIME (soft) : bulle neutre, texte italique,
    // aucun menu (openMessageMenu ignore deja ces messages).
    if (item.is_deleted) {
      return (
        <View style={[styles.messageWrapper, isMe ? styles.messageWrapperMe : styles.messageWrapperThem]}>
          <View style={[styles.bubble, styles.bubbleDeleted, !isMe && { backgroundColor: themeColors.bubbleThem, opacity: 0.55 }]}>
            <Text style={[styles.deletedText, { color: isMe ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.9)' }]}>
              Message supprime
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[styles.timeText, { color: themeColors.textMuted }]}>{formatTime(item.created_at)}</Text>
          </View>
        </View>
      );
    }

    // Anciens stickers de test
    const isSticker =
      item.type === 'sticker' ||
      (typeof item.content === 'string' && item.content.startsWith('sticker:'));
    if (isSticker) {
      return (
        <View style={[styles.messageWrapper, isMe ? styles.messageWrapperMe : styles.messageWrapperThem]}>
          <Text style={{ fontSize: 64 }}>TROPHEE</Text>
        </View>
      );
    }

    // Bloc 14 — message cite (reponse) : retrouve dans l'historique local.
    const quoted = item.reply_to_id
      ? messages.find((m) => m.id === item.reply_to_id)
      : undefined;

    return (
      <SwipeToReply
        onReply={() => startReply(item)}
        direction={isMe ? 'left' : 'right'}
      >
      <Pressable
        onLongPress={() => openMessageMenu(item)}
        delayLongPress={450}
        style={[styles.messageWrapper, isMe ? styles.messageWrapperMe : styles.messageWrapperThem]}
      >
        <View style={[
          styles.bubble,
          isMe ? styles.bubbleMe : [styles.bubbleThem, { backgroundColor: themeColors.bubbleThem }]
        ]}>
          {item.reply_to_id && (
            <View style={[styles.quoteBox, isMe ? styles.quoteBoxMe : styles.quoteBoxThem]}>
              <Text style={[styles.quoteAuthor, { color: isMe ? '#ffd6de' : '#e0e7ff' }]} numberOfLines={1}>
                {quoted
                  ? quoted.sender_id === currentUser?.id
                    ? 'Vous'
                    : partner?.first_name || 'Message'
                  : 'Message'}
              </Text>
              <Text style={[styles.quoteText, { color: isMe ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.85)' }]} numberOfLines={2}>
                {quoted ? (quoted.is_deleted ? 'Message supprime' : quoted.content) : '...'}
              </Text>
            </View>
          )}
          <Text style={[styles.messageText, isMe ? styles.messageTextMe : styles.messageTextThem]}>
            {item.content}
          </Text>
          {item.edited_at && (
            <Text style={[styles.editedHint, { color: isMe ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.7)' }]}>
              (modifie)
            </Text>
          )}
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
      </Pressable>
      </SwipeToReply>
    );
  };

  // Regroupement par jour : un en-tête de date entre deux jours consecutifs.
  // Derive de `messages` via useMemo : realtime, polling 3 s et accuses de
  // lecture restent strictement inchanges, seule la vue est transformee.
  const listItems = useMemo<ChatListItem[]>(() => {
    const items: ChatListItem[] = [];
    let lastDay = '';
    for (const message of messages) {
      const key = dayKeyOf(message.created_at);
      if (key !== lastDay) {
        items.push({ kind: 'day', id: `day-${key}`, label: formatDayLabel(message.created_at) });
        lastDay = key;
      }
      items.push({ kind: 'message', id: message.id, message });
    }
    return items;
  }, [messages]);

  const renderListItem = ({ item }: { item: ChatListItem }) =>
    item.kind === 'day' ? (
      <View style={styles.daySeparator}>
        <View style={[styles.dayPill, { backgroundColor: themeColors.inputBg }]}>
          <Text style={[styles.dayText, { color: themeColors.textMuted }]}>{item.label}</Text>
        </View>
      </View>
    ) : (
      renderBubble(item.message)
    );

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
          data={listItems}
          keyExtractor={(item) => item.id}
          renderItem={renderListItem}
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
          {/* Bloc 14 — aperçu citation / edition au-dessus du champ. */}
          {(replyTo || editing) && (
            <View style={[styles.previewBar, { backgroundColor: themeColors.inputBg, borderLeftColor: '#f43f5e' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.previewTitle, { color: '#f43f5e' }]}>
                  {editing ? 'Modifier le message' : `Repondre a ${replyTo?.sender_id === currentUser?.id ? 'vous' : partner?.first_name || '...'}`}
                </Text>
                <Text style={[styles.previewText, { color: themeColors.textMuted }]} numberOfLines={1}>
                  {editing ? editing.text : replyTo?.is_deleted ? 'Message supprime' : replyTo?.content}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { setReplyTo(null); setEditing(null); if (editing) setInputText(''); }}
                style={styles.previewClose}
                hitSlop={12}
              >
                <X color={themeColors.textMuted} size={18} />
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { backgroundColor: themeColors.inputBg, color: themeColors.text, borderColor: themeColors.border }]}
            placeholder={editing ? 'Modifier...' : 'Écrire un message...'}
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
              {editing ? <Check color="#ffffff" size={20} /> : <Send color="#ffffff" size={20} />}
            </LinearGradient>
          </TouchableOpacity>
          </View>
        </View>
        )}

        {/* Bloc 14 — menu d'actions (appui long sur une bulle). */}
        <Modal
          visible={!!menuMessage}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuMessage(null)}
        >
          <Pressable style={styles.menuOverlay} onPress={() => setMenuMessage(null)}>
            <View style={[styles.menuBox, { backgroundColor: themeColors.headerBg }]}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => menuMessage && startReply(menuMessage)}
              >
                <Reply color={themeColors.text} size={18} />
                <Text style={[styles.menuText, { color: themeColors.text }]}>Repondre</Text>
              </TouchableOpacity>
              {menuMessage?.sender_id === currentUser?.id && (
                <>
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => menuMessage && startEdit(menuMessage)}
                  >
                    <Pencil color={themeColors.text} size={18} />
                    <Text style={[styles.menuText, { color: themeColors.text }]}>Modifier</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.menuItem, styles.menuItemLast]}
                    onPress={() => menuMessage && deleteMessage(menuMessage)}
                  >
                    <Trash2 color="#ef4444" size={18} />
                    <Text style={[styles.menuText, { color: '#ef4444' }]}>Supprimer</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </Pressable>
        </Modal>

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
  // En-tête de jour : pastille centree subtile (type WhatsApp).
  daySeparator: { alignItems: 'center', marginVertical: 8 },
  dayPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  dayText: { fontSize: 11, fontWeight: '600' },
  messageWrapper: { marginBottom: 12, maxWidth: '80%' },
  messageWrapperMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  messageWrapperThem: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18 },
  bubbleMe: { backgroundColor: '#f43f5e', borderBottomRightRadius: 2 },
  bubbleThem: { borderBottomLeftRadius: 2 },
  messageText: { fontSize: 16, lineHeight: 22 },
  messageTextMe: { color: '#ffffff' },
  // Bulles du destinataire (fond bleu) : texte blanc dans les deux thèmes.
  messageTextThem: { color: '#ffffff' },
  timeText: { fontSize: 11, marginTop: 4, marginHorizontal: 4 },
  inputContainer: { flexDirection: 'column', padding: 12, borderTopWidth: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end' },
  // Bloc 14 — aperçu citation / edition au-dessus du champ (style WhatsApp).
  previewBar: { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
  previewTitle: { fontSize: 12, fontWeight: '700' },
  previewText: { fontSize: 13, marginTop: 2 },
  previewClose: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  // Bloc 14 — menu d'actions (appui long sur une bulle).
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  menuBox: { width: '100%', maxWidth: 320, borderRadius: 16, paddingVertical: 6, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128,128,128,0.35)' },
  menuItemLast: { borderBottomWidth: 0 },
  menuText: { fontSize: 16 },
  // Bloc 14 — citation dans la bulle (style WhatsApp).
  quoteBox: { borderLeftWidth: 3, borderLeftColor: 'rgba(255,255,255,0.7)', paddingLeft: 8, marginBottom: 6, maxWidth: '100%' },
  quoteBoxMe: {},
  quoteBoxThem: {},
  quoteAuthor: { fontSize: 12, fontWeight: '700' },
  quoteText: { fontSize: 13, marginTop: 1 },
  editedHint: { fontSize: 11, fontStyle: 'italic', marginTop: 4 },
  // Bloc 14 — bulle d'un message supprime (soft delete).
  bubbleDeleted: { opacity: 0.6 },
  deletedText: { fontSize: 15, fontStyle: 'italic' },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, fontSize: 16, marginRight: 10 },
  sendBtn: { width: 44, height: 44, marginBottom: 0 },
  sendGradient: { width: '100%', height: '100%', borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
});
