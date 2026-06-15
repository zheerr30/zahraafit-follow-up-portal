export type UserRole = "client" | "admin";

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

export type Client = {
  id: string;
  profile_id: string;
  coach_id: string | null;
  age: number | null;
  height_cm: number | null;
  goal: string | null;
  start_weight: number | null;
  target_weight: number | null;
  status: "active" | "paused";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Plan = {
  id: string;
  client_id: string;
  title: string;
  content: string | null;
  file_path: string | null;
  file_url: string | null;
  is_current: boolean;
  created_by: string | null;
  created_at: string;
};

export type WeeklyFollowup = {
  id: string;
  client_id: string;
  week_date: string;
  weight_kg: number | null;
  waist_cm: number | null;
  hips_cm: number | null;
  nutrition_commitment: number | null;
  workout_commitment: number | null;
  steps_count: number | null;
  sleep_hours: number | null;
  menstrual_cycle: string | null;
  client_notes: string | null;
  coach_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FollowupPhoto = {
  id: string;
  followup_id: string;
  client_id: string;
  photo_type: "front" | "side" | "back" | "other";
  file_path: string;
  photo_url: string | null;
  created_at: string;
};

export type CoachNote = {
  id: string;
  client_id: string;
  coach_id: string | null;
  note: string;
  created_at: string;
};

export type ClientWithProfile = Client & {
  profile?: Profile | null;
};

export type PhotoWithSignedUrl = FollowupPhoto & {
  signedUrl?: string;
};

export type FollowupWithPhotos = WeeklyFollowup & {
  photos: PhotoWithSignedUrl[];
};
