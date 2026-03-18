import { Context, Markup } from 'telegraf';
import { Challenge, Question, Answer, ShuffledOptions } from '../types';
import { challengeService } from '../services/challengeService';
import { participantService } from '../services/participantService';
import { userService } from '../services/userService';
import { sessionService } from '../services/sessionService';
import { shuffleArray } from '../utils/helpers';
import { messages } from '../utils/messages';
import { config } from '../config';

export class QuizHandler {
  /**
   * Start quiz for user
   */
  async startQuiz(ctx: Context, challengeId: number) {
    const telegramId = ctx.from!.id;
    const username = ctx.from!.username;

    // Get challenge
    const challenge = await challengeService.getChallengeById(challengeId);
    if (!challenge) {
      await ctx.reply('❌ Challenge not found.');
      return;
    }

    // Check if challenge is active
    if (challenge.status !== 'active') {
      if (challenge.status === 'completed') {
        await ctx.reply(messages.challengeClosed('2:10 PM', 'Next challenge date'));
      } else {
        await ctx.reply('❌ This challenge is not active yet.');
      }
      return;
    }

    // Check if already participated
    const hasParticipated = await participantService.hasParticipated(challengeId, telegramId);
    if (hasParticipated) {
      await ctx.reply(messages.alreadyAttempted('Next challenge date'));
      return;
    }

    // Get or create user
    await userService.getOrCreateUser(telegramId, username, ctx.from!.first_name, ctx.from!.last_name);

    // Get questions
    const questions = await challengeService.getQuestions(challengeId);
    if (questions.length === 0) {
      await ctx.reply('❌ No questions found for this challenge.');
      return;
    }

    // Generate shuffled options for each question
    const shuffledOptions: ShuffledOptions[] = questions.map(q => ({
      question_id: q.id,
      shuffled_order: shuffleArray(['A', 'B', 'C', 'D']),
    }));

    // Create session
    sessionService.createSession(telegramId, challengeId, shuffledOptions);

    // Send welcome message
    await ctx.reply(
      messages.challengeWelcome(challenge, questions.length),
      Markup.inlineKeyboard([[Markup.button.callback('START QUIZ', `start_quiz_${challengeId}`)]])
    );
  }

  /**
   * Handle quiz start button
   */
  async handleQuizStart(ctx: Context, challengeId: number) {
    const telegramId = ctx.from!.id;

    // Get session
    const session = sessionService.getSession(telegramId, challengeId);
    if (!session) {
      await ctx.reply('❌ Session expired. Please start again.');
      return;
    }

    // Get questions
    const questions = await challengeService.getQuestions(challengeId);
    
    // Send first question
    await this.sendQuestion(ctx, challengeId, questions, 0);
  }

  /**
   * Send question to user
   */
  async sendQuestion(ctx: Context, challengeId: number, questions: Question[], questionIndex: number) {
    const telegramId = ctx.from!.id;
    const session = sessionService.getSession(telegramId, challengeId);
    
    if (!session) {
      await ctx.reply('❌ Session expired.');
      return;
    }

    const question = questions[questionIndex];
    const shuffled = session.shuffled_options.find(s => s.question_id === question.id);
    
    if (!shuffled) {
      await ctx.reply('❌ Error loading question.');
      return;
    }

    // Map shuffled options
    const optionMap: { [key: string]: string } = {
      'A': question.option_a,
      'B': question.option_b,
      'C': question.option_c,
      'D': question.option_d,
    };

    const shuffledOptions = shuffled.shuffled_order.map((letter, index) => ({
      display: String.fromCharCode(65 + index), // A, B, C, D
      actual: letter,
      text: optionMap[letter],
    }));

    // Check if any option is too long for button labels (>35 chars with prefix)
    const hasLongOption = shuffledOptions.some(opt => `${opt.display}) ${opt.text}`.length > 35);

    let text: string;
    let keyboard;

    if (hasLongOption) {
      // Long options: show full text in message body, short A/B/C/D buttons
      const optionsText = shuffledOptions.map(opt => `${opt.display}) ${opt.text}`).join('\n\n');
      text = `Question ${questionIndex + 1}/${questions.length} ⏱️\n\n${question.question_text}\n\n${optionsText}`;
      keyboard = Markup.inlineKeyboard(
        shuffledOptions.map(opt => [
          Markup.button.callback(
            `${opt.display}`,
            `answer_${challengeId}_${question.id}_${opt.actual}`
          )
        ])
      );
    } else {
      // Short options: full text on buttons (original layout)
      text = `Question ${questionIndex + 1}/${questions.length} ⏱️\n\n${question.question_text}`;
      keyboard = Markup.inlineKeyboard(
        shuffledOptions.map(opt => [
          Markup.button.callback(
            `${opt.display}) ${opt.text}`,
            `answer_${challengeId}_${question.id}_${opt.actual}`
          )
        ])
      );
    }

    await ctx.reply(text, keyboard);
  }

  /**
   * Handle answer selection
   */
  async handleAnswer(ctx: Context, challengeId: number, questionId: number, selectedAnswer: string) {
    const telegramId = ctx.from!.id;
    const session = sessionService.getSession(telegramId, challengeId);

    if (!session) {
      await ctx.answerCbQuery('Session expired');
      return;
    }

    // Get question
    const questions = await challengeService.getQuestions(challengeId);
    const question = questions.find(q => q.id === questionId);
    
    if (!question) {
      await ctx.answerCbQuery('Question not found');
      return;
    }

    // Check if correct
    const isCorrect = selectedAnswer === question.correct_answer;

    // Record answer
    const answer: Answer = {
      question_id: questionId,
      selected_answer: selectedAnswer as 'A' | 'B' | 'C' | 'D',
      is_correct: isCorrect,
    };

    sessionService.recordAnswer(telegramId, challengeId, answer);

    // Answer callback
    await ctx.answerCbQuery('✓ Answer recorded');

    // Check if more questions
    const currentQuestion = sessionService.getCurrentQuestion(telegramId, challengeId);
    
    if (currentQuestion < questions.length) {
      // Send next question
      await ctx.reply(messages.answerRecorded());
      await this.sendQuestion(ctx, challengeId, questions, currentQuestion);
    } else {
      // Quiz completed
      await this.completeQuiz(ctx, challengeId);
    }
  }

  /**
   * Complete quiz and calculate results
   */
  async completeQuiz(ctx: Context, challengeId: number) {
    const telegramId = ctx.from!.id;
    const username = ctx.from!.username;
    const session = sessionService.getSession(telegramId, challengeId);

    if (!session) {
      await ctx.reply('❌ Session not found.');
      return;
    }

    // Get challenge to get when it went live
    const challenge = await challengeService.getChallengeById(challengeId);
    if (!challenge || !challenge.started_at) {
      await ctx.reply('❌ Challenge not found or not started.');
      return;
    }

    // Calculate score
    const score = session.answers.filter(a => a.is_correct).length;
    const totalQuestions = session.answers.length;
    
    // Calculate response time from when challenge went live to completion
    const completionTimeSeconds = Math.floor((new Date().getTime() - new Date(challenge.started_at).getTime()) / 1000);

    // Get completion order
    const completionOrder = await participantService.getCompletionOrder(challengeId);

    // Get user
    const user = await userService.getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('❌ User not found.');
      return;
    }

    // Save participant
    await participantService.createParticipant(
      challengeId,
      user.id,
      telegramId,
      username,
      score,
      totalQuestions,
      completionTimeSeconds,
      completionOrder,
      session.started_at,
      new Date(),
      session.answers,
      session.shuffled_options
    );

    // Update user stats
    await userService.incrementParticipation(telegramId);
    if (score === totalQuestions) {
      await userService.incrementPerfectScore(telegramId);
    }

    // Delete session
    sessionService.deleteSession(telegramId, challengeId);

    // Send completion message
    if (score === totalQuestions) {
      // Perfect score
      await ctx.reply(messages.completionPerfect(completionTimeSeconds, completionOrder, '8:10 PM'), { parse_mode: 'HTML' });
    } else {
      // Not perfect
      await ctx.reply(messages.completionNotPerfect(score, totalQuestions, completionTimeSeconds, completionOrder), { parse_mode: 'HTML' });
    }
  }
}

export const quizHandler = new QuizHandler();
