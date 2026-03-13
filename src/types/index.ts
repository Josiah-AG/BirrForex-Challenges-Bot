export interface User {
  id: number;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  total_participations: number;
  total_wins: number;
  total_perfect_scores: number;
  last_win_date?: Date;
  notifications_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Challenge {
  id: number;
  day: string;
  date: Date;
  topic: string;
  short_text: string;
  topic_link: string;
  challenge_time: string;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  prize_amount: number;
  num_winners: number;
  backup_list_size: number;
  created_at: Date;
  updated_at: Date;
  started_at?: Date;
  ended_at?: Date;
}

export interface Question {
  id: number;
  challenge_id: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: 'A' | 'B' | 'C' | 'D';
  order_number: number;
  created_at: Date;
}

export interface Participant {
  id: number;
  challenge_id: number;
  user_id: number;
  telegram_id: number;
  username?: string;
  score: number;
  total_questions: number;
  completion_time_seconds: number;
  completion_order: number;
  rank?: number;
  started_at: Date;
  completed_at: Date;
  answers: Answer[];
  shuffled_options: ShuffledOptions[];
  created_at: Date;
}

export interface Answer {
  question_id: number;
  selected_answer: 'A' | 'B' | 'C' | 'D';
  is_correct: boolean;
}

export interface ShuffledOptions {
  question_id: number;
  shuffled_order: string[]; // e.g., ['B', 'A', 'D', 'C']
}

export interface Winner {
  id: number;
  challenge_id: number;
  user_id: number;
  telegram_id: number;
  username?: string;
  position: number;
  prize_amount: number;
  claimed: boolean;
  claimed_at?: Date;
  disqualified: boolean;
  disqualification_reason?: string;
  created_at: Date;
  updated_at: Date;
}

export interface UserSession {
  telegram_id: number;
  challenge_id: number;
  current_question: number;
  started_at: Date;
  answers: Answer[];
  shuffled_options: ShuffledOptions[];
}

export interface ChallengeStats {
  total_participants: number;
  perfect_scores: number;
  average_score: number;
  average_time: number;
  question_accuracy: { [key: number]: number };
}
