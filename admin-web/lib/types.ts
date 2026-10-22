// Types partages du panneau (miroir des sorties SQL admin_* du bloc 10)

export type VerificationStatus = 'pending' | 'approved' | 'rejected';
export type VerificationType = 'identity' | 'genotype';
export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';
export type ReportReason = 'fake' | 'harassment' | 'inappropriate' | 'spam' | 'other';
export type CoachingCategory = string;

export type AdminStats = {
  profiles_total: number;
  profiles_7d: number;
  profiles_30d: number;
  verified_total: number;
  banned_total: number;
  verifications_pending: number;
  verifications_30d: number;
  reports_pending: number;
  reports_30d: number;
  matches_total: number;
  matches_7d: number;
  matches_30d: number;
  messages_total: number;
  messages_7d: number;
  messages_30d: number;
  swipes_7d: number;
  likes_7d: number;
  profiles_liked_7d: number;
  coaching_posts: number;
  coaching_likes_30d: number;
  coaching_comments_30d: number;
};

export type DailyPoint = {
  day: string;
  new_profiles: number;
  new_matches: number;
  new_messages: number;
  new_swipes: number;
  likes: number;
};

export type ActivitySummary = {
  new_profiles: number;
  new_matches: number;
  new_messages: number;
  new_swipes: number;
  likes: number;
  profiles_liked: number;
  received_likes_page_opens: number;
  received_likes_unique_users: number;
  received_like_profiles_opened: number;
  received_like_responses: number;
  received_like_response_likes: number;
  received_like_response_passes: number;
};

export type ActivityDailyPoint = DailyPoint & {
  profiles_liked: number;
  received_likes_page_opens: number;
  received_likes_users: number;
  received_like_profiles_opened: number;
  received_like_responses: number;
  received_like_response_likes: number;
  received_like_response_passes: number;
};

export type AdminActivityData = {
  summary: ActivitySummary;
  series: ActivityDailyPoint[];
};

export type VerificationDoc = { path: string; label: string };

export type VerificationRow = {
  id: string;
  user_id: string;
  type: VerificationType;
  status: VerificationStatus;
  documents: VerificationDoc[] | null;
  declared_value: string | null;
  verified_value: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  photos: string[] | null;
  identity_verified: boolean | null;
  genotype_verified: boolean | null;
};

export type ReportRow = {
  id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  reviewed_at: string | null;
  reporter_name: string | null;
  reported_user_id: string;
  reported_name: string | null;
  reported_city: string | null;
  reported_photos: string[] | null;
  reported_banned_at: string | null;
  report_count: number;
};

export type UserRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  gender: string | null;
  birth_date: string | null;
  role: string;
  photos: string[] | null;
  identity_verified: boolean;
  genotype_verified: boolean;
  banned_at: string | null;
  banned_reason: string | null;
  report_count: number;
  match_count: number;
};

export type CoachingPost = {
  id: string;
  user_id: string | null;
  title: string;
  content: string;
  category: CoachingCategory;
  image_url: string | null;
  created_at: string;
};

export type CoachingComment = {
  id: string;
  post_id: string;
  user_id: string | null;
  content: string;
  created_at: string;
};

export type PushLogRow = {
  id: number;
  sent_at: string;
  channel: string | null;
  kind: string | null;
  target_count: number | null;
  title: string | null;
};

export const REPORT_REASONS: Record<ReportReason, string> = {
  fake: 'Faux profil',
  harassment: 'Harcèlement',
  inappropriate: 'Contenu inapproprié',
  spam: 'Spam',
  other: 'Autre',
};

export const CATEGORIES: CoachingCategory[] = ['couple', 'santé', 'astuce'];

// ── Referentiels dynamiques (bloc 11, table countries/cities/interests) ──
export type InterestRow = {
  id: number;
  label: string;
  is_active: boolean;
  sort_order: number;
};

export type CountryRow = {
  code: string;
  name: string;
  dial_code: string;
  flag: string;
  min_digits: number;
  max_digits: number;
  is_active: boolean;
  sort_order: number;
};

export type CityRow = {
  id: number;
  country_code: string;
  name: string;
  is_active: boolean;
};

