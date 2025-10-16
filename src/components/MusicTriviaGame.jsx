import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import musicQuestions from '../assets/music_recent.json';
import { isHostUser } from '../lib/isHostUser';

const optionLetters = ["A", "B", "C", "D"];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function MusicTriviaGame({ roomCode, currentUserName }) {
  const [session, setSession] = useState(null);
  const [question, setQuestion] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [answers, setAnswers] = useState({});
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showCorrect, setShowCorrect] = useState(false);
  const [timer, setTimer] = useState(null);
  const [shuffledOptions, setShuffledOptions] = useState([]);
  const [correctAnswerIndex, setCorrectAnswerIndex] = useState(0);
  const timerRef = useRef();

  useEffect(() => {
    const fetch = async () => {
      // Get current game session
      const { data: sessionData } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('room_code', roomCode)
        .eq('game_type', 'music_trivia')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

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
      .channel('trivia_session_sync')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_sessions',
        filter: `room_code=eq.${roomCode}`,
      }, (payload) => {
        setSession(payload.new);
        setQuestion(payload.new.current_question);
        if (payload.new.game_state === 'ended') {
          // Game ended, could redirect or show results
          console.log('Game ended');
        }
      })
      .subscribe();

    // Listen for new answers
    const answersSub = supabase
      .channel('trivia_answers_sync')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'game_answers',
        filter: `game_session_id=eq.${session?.id}`,
      }, (payload) => {
        // Update answers display
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

  // Shuffle options when question changes
  useEffect(() => {
    if (!question) return;
    
    // Create an array of option indices and shuffle them
    const options = [...question.options];
    const shuffledIndices = Array.from({ length: options.length }, (_, i) => i);
    for (let i = shuffledIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
    }
    
    // Find the new index of the correct answer
    const correctIndex = shuffledIndices.findIndex(idx => options[idx] === question.answer);
    
    // Create the shuffled options array
    const newShuffledOptions = shuffledIndices.map(idx => options[idx]);
    
    setShuffledOptions(newShuffledOptions);
    setCorrectAnswerIndex(correctIndex);
    setShowCorrect(false);
    setSelectedAnswer(null);
  }, [question]);

  useEffect(() => {
    if (!session?.config?.seconds_per_question) return;
    setTimer(session.config.seconds_per_question);
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

  const submitAnswer = async (answer) => {
    setSelectedAnswer(answer);
    setShowCorrect(true);
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
        answer: answer,
        submitted_at: new Date(),
      });
    }
  };

  const goToNext = async () => {
    const nextIndex = session.question_index + 1;
    const totalQuestions = session?.config?.total_questions || musicQuestions.questions.length;
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
          current_question: musicQuestions.questions[nextIndex],
          updated_at: new Date(),
        })
        .eq('id', session.id);
    }
  };

  if (!question) return <div className="text-white text-center p-8">Loading question...</div>;

  const correctAnswer = question.answer;

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <div className="bg-[#181825] rounded-2xl border border-[#232336] shadow-[0_0_24px_0_rgba(236,72,153,0.15)] px-6 py-6">
        <div className="flex items-center justify-center gap-2 text-sm text-[#a259ff] mb-2">
          <svg width="18" height="18" fill="none" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="7" stroke="#a259ff" strokeWidth="2" fill="none"/>
            <path d="M8 4v4l3 2" stroke="#a259ff" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span>Question {session?.question_index + 1} of {session?.config?.total_questions || musicQuestions.questions.length}</span>
          <span className="ml-4 text-pink-400 font-bold">{timer !== null ? `⏰ ${timer}s` : null}</span>
        </div>
        
        <h1 className="text-xl font-bold text-white mb-6 text-center">{question.question}</h1>
        
        <div className="grid grid-cols-2 gap-4 mb-6">
          {shuffledOptions.map((opt, i) => {
            let colour = "bg-[#232336] text-white hover:bg-gradient-to-r hover:from-[#a259ff] hover:to-[#f246a9] hover:text-white";
            if (showCorrect) {
              if (i === correctAnswerIndex) {
                colour = "bg-green-600 text-white";
              } else if (selectedAnswer === opt) {
                colour = "bg-red-600 text-white";
              }
            } else if (selectedAnswer === opt) {
              colour = "bg-gradient-to-r from-[#a259ff] to-[#f246a9] text-white";
            }
            return (
              <button
                key={opt}
                onClick={() => !showCorrect && submitAnswer(opt)}
                disabled={showCorrect}
                className={`flex items-center gap-3 w-full h-14 px-6 rounded-xl font-semibold text-base transition shadow-[0_4px_24px_0_rgba(236,72,153,0.15)] text-left ${colour}`}
              >
                <span className="font-bold text-base mr-2 opacity-80">{optionLetters[i]}.</span>
                <span className="text-left">{opt}</span>
              </button>
            );
          })}
        </div>

        {/* Participants and their answers */}
        <div className="mb-6">
          <h3 className="text-white font-semibold mb-3">Participants:</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {participants.filter((p, idx, arr) => arr.findIndex(x => x.id === p.id) === idx).map((participant) => (
              <div key={participant.id} className="bg-[#232336] rounded-lg p-3 text-center">
                <div className="text-white text-sm font-medium">{participant.user_name}</div>
                <div className="text-[#a259ff] text-xs">
                  {answers[participant.id] ? "Answered" : "Waiting..."}
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Host controls */}
        {isHost && (
          <div className="flex justify-center">
            <button
              onClick={async () => {
                const nextIndex = session.question_index + 1;
                const totalQuestions = session?.config?.total_questions || musicQuestions.questions.length;
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
              {session?.question_index + 1 >= (session?.config?.total_questions || musicQuestions.questions.length) ? "End Game" : "Next Question"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
} 