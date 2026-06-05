import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import guessQuestions from '../assets/guess_the_song.json';
import { isHostUser } from '../lib/isHostUser';

export default function GuessTheSongGame({ roomCode, currentUserName }) {
  const [session, setSession] = useState(null);
  const [question, setQuestion] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [answers, setAnswers] = useState({});
  const [userAnswer, setUserAnswer] = useState('');
  const [showCorrect, setShowCorrect] = useState(false);
  const [timer, setTimer] = useState(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const timerRef = useRef();
  const userAnswerRef = useRef('');

  useEffect(() => {
    const fetch = async () => {
      // Get current game session
      const { data: sessionRows } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('room_code', roomCode)
        .eq('game_type', 'guess_the_song')
        .order('updated_at', { ascending: false })
        .limit(1);
      const sessionData = sessionRows?.[0] ?? null;

      setSession(sessionData);
      setQuestion(sessionData?.current_question);

      // Get room data to check if user is host
      const { data: roomData } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', roomCode)
        .single();

      setIsHost(isHostUser(roomData?.host_name, currentUserName));

      // Get participants
      const { data: participantsData } = await supabase
        .from('participants')
        .select('*')
        .eq('room_code', roomCode);

      // Deduplicate by id
      const uniqueParticipants = (participantsData || []).filter(
        (p, idx, arr) => arr.findIndex(x => x.id === p.id) === idx
      );
      setParticipants(uniqueParticipants);
    };

    fetch();

    // Listen for game session updates
    const sessionSub = supabase
      .channel('guess_session_sync')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_sessions',
        filter: `room_code=eq.${roomCode}`,
      }, (payload) => {
        setSession(payload.new);
        setQuestion(payload.new.current_question);
        if (payload.new.game_state === 'ended') {
          console.log('Game ended');
        }
      })
      .subscribe();

    // Listen for new answers
    const answersSub = supabase
      .channel('guess_answers_sync')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'game_answers',
        filter: `game_session_id=eq.${session?.id}`,
      }, (payload) => {
        setAnswers(prev => ({
          ...prev,
          [payload.new.participant_id]: payload.new.answer
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionSub);
      supabase.removeChannel(answersSub);
    };
  }, [roomCode, currentUserName, session?.id]);

  useEffect(() => {
    if (!session?.config?.seconds_per_question) return;
    setTimer(session.config.seconds_per_question);
    setShowCorrect(false);
    setHasAnswered(false);
    setUserAnswer('');
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev === 1) {
          clearInterval(timerRef.current);
          setShowCorrect(true);
        }
        return prev > 0 ? prev - 1 : 0;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [session?.question_index]);

  const writeAnswerToDB = async (answer) => {
    const { data: participant } = await supabase
      .from('participants')
      .select('id')
      .eq('room_code', roomCode)
      .eq('user_name', currentUserName)
      .single();
    if (participant) {
      await supabase.from('game_answers').insert({
        id: crypto.randomUUID(),
        game_session_id: session.id,
        participant_id: participant.id,
        answer,
        question_index: session.question_index,
        submitted_at: new Date(),
      });
    }
  };

  // Auto-submit on timer expiry if user typed something but didn't click Submit
  useEffect(() => {
    if (!showCorrect || hasAnswered || !userAnswerRef.current.trim()) return;
    setHasAnswered(true);
    writeAnswerToDB(userAnswerRef.current.trim());
  }, [showCorrect]); // eslint-disable-line

  const submitAnswer = async () => {
    if (!userAnswer.trim() || showCorrect || hasAnswered) return;
    setHasAnswered(true);
    setShowCorrect(true);
    await writeAnswerToDB(userAnswer.trim());
    setUserAnswer('');
    userAnswerRef.current = '';
  };

  const goToNext = async () => {
    const nextIndex = session.question_index + 1;
    const totalQuestions = session?.config?.total_questions || guessQuestions.questions.length;
    if (nextIndex >= totalQuestions) {
      // End game
      await supabase
        .from('game_sessions')
        .update({ game_state: 'ended' })
        .eq('id', session.id);
    } else {
      // Go to next question
      await supabase
        .from('game_sessions')
        .update({
          question_index: nextIndex,
          current_question: guessQuestions.questions[nextIndex],
          updated_at: new Date(),
        })
        .eq('id', session.id);
    }
  };

  if (!question) return <div className="text-white text-center p-8">Loading question...</div>;

  const correctAnswer = question.answer;

  return (
    <div className="w-full max-w-4xl mx-auto p-2 md:p-6">
      <div className="bg-[#181825] rounded-2xl border border-[#232336] shadow-[0_0_24px_0_rgba(236,72,153,0.15)] px-3 py-4 md:px-6 md:py-6">
        <div className="flex items-center justify-center gap-2 text-sm text-[#a259ff] mb-2">
          <span className="text-2xl">🎧</span>
          <span>Question {session?.question_index + 1} of {session?.config?.total_questions || guessQuestions.questions.length}</span>
          <span className="ml-4 text-pink-400 font-bold">{timer !== null ? `⏰ ${timer}s` : null}</span>
        </div>

        <h1 className="text-xl md:text-3xl font-bold text-white mb-6 text-center">{question.question}</h1>

        <div className="mb-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
            <input
              type="text"
              value={userAnswer}
              onChange={(e) => { setUserAnswer(e.target.value); userAnswerRef.current = e.target.value; }}
              placeholder="Enter your guess..."
              className="flex-1 bg-[#232336] text-white px-4 py-3 rounded-xl border border-[#232336] focus:border-[#a259ff] focus:outline-none"
              onKeyPress={(e) => e.key === 'Enter' && submitAnswer()}
              disabled={showCorrect}
            />
            <button
              onClick={submitAnswer}
              className="bg-gradient-to-r from-[#a259ff] to-[#f246a9] text-white font-semibold py-3 px-6 rounded-xl hover:from-[#8a4fd8] hover:to-[#d63d8f] transition-all duration-300"
              disabled={showCorrect}
            >
              Submit
            </button>
          </div>
          <div className="text-center text-sm text-gray-400">
            <p>Answer: <span className={`text-[#a259ff] font-semibold ${showCorrect ? '' : 'opacity-0'}`}>{correctAnswer}</span></p>
          </div>
        </div>

        {/* Participants and their answers */}
        <div className="mb-6">
          <h3 className="text-white font-semibold mb-3">Participants:</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {participants.filter((p, idx, arr) => arr.findIndex(x => x.id === p.id) === idx).map((participant) => {
              const theirAnswer = answers[participant.id];
              let answerColor = '';
              if (showCorrect && theirAnswer) {
                answerColor = theirAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase() ? 'text-green-400' : 'text-red-400';
              }
              return (
                <div key={participant.id} className="bg-[#232336] rounded-lg p-3 text-center">
                  <div className="text-white text-sm font-medium">{participant.user_name}</div>
                  <div className="text-[#a259ff] text-xs">
                    {theirAnswer ? (
                      showCorrect ? (
                        <div>
                          <div>Answered</div>
                          <div className={`text-white text-xs mt-1 ${answerColor}`}>{theirAnswer}</div>
                        </div>
                      ) : (
                        <div>Answered ✓</div>
                      )
                    ) : (
                      "Waiting..."
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Host controls */}
        {isHost && (
          <div className="flex justify-center">
            <button
              onClick={async () => {
                const nextIndex = session.question_index + 1;
                const totalQuestions = session?.config?.total_questions || guessQuestions.questions.length;
                if (nextIndex >= totalQuestions) {
                  await supabase
                    .from('game_sessions')
                    .update({ game_state: 'ended' })
                    .eq('id', session.id);
                } else {
                  await goToNext();
                }
              }}
              className="bg-gradient-to-r from-[#a259ff] to-[#f246a9] text-white font-semibold py-3 px-8 rounded-xl hover:from-[#8a4fd8] hover:to-[#d63d8f] transition-all duration-300 shadow-[0_4px_24px_0_rgba(236,72,153,0.3)]"
              disabled={!showCorrect}
            >
              {session?.question_index + 1 >= (session?.config?.total_questions || guessQuestions.questions.length) ? "End Game" : "Next Question"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
} 