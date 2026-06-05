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

  const sessionPayload = {
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
  };

  // If a session already exists for this room, UPDATE it (avoids unique constraint)
  // Otherwise INSERT a new one
  const { data: existing } = await supabase
    .from('game_sessions')
    .select('id')
    .eq('room_code', roomCode)
    .limit(1);

  let error;
  if (existing && existing.length > 0) {
    const { error: e } = await supabase
      .from('game_sessions')
      .update(sessionPayload)
      .eq('room_code', roomCode);
    error = e;
  } else {
    const { error: e } = await supabase.from('game_sessions').insert({
      id: uuid,
      room_code: roomCode,
      ...sessionPayload,
    });
    error = e;
  }

  if (error) {
    console.error('Game start failed:', error.message);
    return;
  }

  const gameNames = {
    music_trivia: 'Music Trivia',
    guess_the_song: 'Guess the Song',
    would_you_rather: 'Would You Rather',
    pick_who: 'Pick Who',
  };

  const { error: chatError } = await supabase.from('chat_messages').insert({
    room_code: roomCode,
    user_name: hostName,
    message: `🎮 ${hostName} started ${gameNames[gameType] || gameType}! Head to the Games tab to play.`,
    type: 'system',
  });
  if (chatError) console.error('Game notification failed:', chatError.message);
} 