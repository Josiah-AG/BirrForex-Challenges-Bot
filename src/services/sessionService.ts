import { UserSession, Answer, ShuffledOptions } from '../types';

/**
 * In-memory session storage for active quiz participants
 * In production, consider using Redis for scalability
 */
class SessionService {
  private sessions: Map<string, UserSession> = new Map();

  /**
   * Create session key
   */
  private getKey(telegramId: number, challengeId: number): string {
    return `${telegramId}_${challengeId}`;
  }

  /**
   * Create new session
   */
  createSession(telegramId: number, challengeId: number, shuffledOptions: ShuffledOptions[]): void {
    const key = this.getKey(telegramId, challengeId);
    this.sessions.set(key, {
      telegram_id: telegramId,
      challenge_id: challengeId,
      current_question: 0,
      started_at: new Date(),
      answers: [],
      shuffled_options: shuffledOptions,
    });
  }

  /**
   * Get session
   */
  getSession(telegramId: number, challengeId: number): UserSession | null {
    const key = this.getKey(telegramId, challengeId);
    return this.sessions.get(key) || null;
  }

  /**
   * Record answer
   */
  recordAnswer(telegramId: number, challengeId: number, answer: Answer): void {
    const session = this.getSession(telegramId, challengeId);
    if (!session) return;

    session.answers.push(answer);
    session.current_question++;
  }

  /**
   * Get current question number
   */
  getCurrentQuestion(telegramId: number, challengeId: number): number {
    const session = this.getSession(telegramId, challengeId);
    return session?.current_question || 0;
  }

  /**
   * Check if session exists
   */
  hasSession(telegramId: number, challengeId: number): boolean {
    const key = this.getKey(telegramId, challengeId);
    return this.sessions.has(key);
  }

  /**
   * Delete session
   */
  deleteSession(telegramId: number, challengeId: number): void {
    const key = this.getKey(telegramId, challengeId);
    this.sessions.delete(key);
  }

  /**
   * Clear all sessions for a challenge
   */
  clearChallengeSessions(challengeId: number): void {
    const keysToDelete: string[] = [];
    
    this.sessions.forEach((session, key) => {
      if (session.challenge_id === challengeId) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.sessions.delete(key));
  }

  /**
   * Get all active sessions count
   */
  getActiveSessionsCount(): number {
    return this.sessions.size;
  }

  /**
   * Clean up expired sessions (older than 30 minutes)
   */
  cleanupExpiredSessions(): void {
    const now = new Date();
    const keysToDelete: string[] = [];

    this.sessions.forEach((session, key) => {
      const minutesPassed = (now.getTime() - session.started_at.getTime()) / (1000 * 60);
      if (minutesPassed > 30) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.sessions.delete(key));
    
    if (keysToDelete.length > 0) {
      console.log(`Cleaned up ${keysToDelete.length} expired sessions`);
    }
  }
}

export const sessionService = new SessionService();

// Clean up expired sessions every 5 minutes
setInterval(() => {
  sessionService.cleanupExpiredSessions();
}, 5 * 60 * 1000);
