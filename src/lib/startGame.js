import wyrQuestions from '../assets/questions.json';
import guessQuestions from '../assets/guess_the_song.json';
import musicQuestions from '../assets/music_recent.json';
import pickWhoQuestions from '../assets/pick_who.json';
import { supabase } from './supabaseClient';

export async function startGame(gameType, roomCode, hostName, settings = {}) {
  const uuid = crypto.randomUUID();

  let questions = [];
  if (gameType === 'music_trivia') questions = musicQuestions.questions;
  if (gameType === 'guess_the_song') questions = guessQuestions.questions;
  if (gameType === 'would_you_rather') questions = wyrQuestions.questions;
  if (gameType === 'pick_who') {
    // Fetch participant names for this room
    const { data: participants } = await supabase
      .from('participants')
      .select('user_name')
      .eq('room_code', roomCode);
    const names = participants ? participants.map(p => p.user_name) : [];
    // Set options for each question to participant names
    questions = pickWhoQuestions.questions.map(q => ({
      ...q,
      options: names,
    }));
  }

  // Use settings.total (number of questions) if provided
  if (settings.total && settings.total > 0 && settings.total < questions.length) {
    questions = questions.slice(0, settings.total);
  }

  const firstQuestion = questions[0];

  const { error } = await supabase.from('game_sessions').insert({
    id: uuid,
    room_code: roomCode,
    game_type: gameType,
    current_question: firstQuestion,
    question_index: 0,
    game_state: 'active',
    updated_at: new Date(),
    config: {
      total_questions: questions.length,
      seconds_per_question: settings.secs || 15,
      host: hostName,
    },
  });

  if (error) console.error('Game start failed:', error.message);
} 