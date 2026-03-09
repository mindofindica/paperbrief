'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Question {
  question: string;
  options: string[];
  correct_index?: number;
  explanation?: string;
}

interface Answer {
  question_index: number;
  selected_option: number;
  is_correct: boolean;
}

interface Props {
  sessionId: string;
  paperTitle: string;
  questions: Question[];
  initialAnswers: Answer[];
  initialStatus: string;
  initialScore: number | null;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

function ScoreSummary({ score, questions, answers }: { score: number; questions: Question[]; answers: Answer[] }) {
  const emoji = score === 3 ? '🎉' : score === 2 ? '👏' : score === 1 ? '💪' : '📚';
  const message = score === 3 ? 'Perfect score!' : score === 2 ? 'Great job!' : score === 1 ? 'Keep reading!' : 'Time to review!';

  return (
    <div>
      <div className="text-center mb-8">
        <div className="text-6xl mb-3">{emoji}</div>
        <h2 className="text-3xl font-bold mb-1">You scored {score}/3!</h2>
        <p className="text-gray-400">{message}</p>
      </div>

      <div className="space-y-6 mb-8">
        {questions.map((q, i) => {
          const answer = answers.find(a => a.question_index === i);
          const isCorrect = answer?.is_correct ?? false;
          return (
            <div key={i} className="bg-gray-900 rounded-xl p-5">
              <div className="flex items-start gap-3 mb-3">
                <span className={`text-lg ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                  {isCorrect ? '✓' : '✗'}
                </span>
                <p className="text-gray-100 font-medium">{q.question}</p>
              </div>
              {answer && (
                <div className="ml-7 space-y-1 text-sm">
                  {q.options.map((opt, j) => (
                    <div key={j} className={`px-3 py-1 rounded ${
                      j === q.correct_index ? 'bg-green-900/50 text-green-300' :
                      j === answer.selected_option && !isCorrect ? 'bg-red-900/50 text-red-300' :
                      'text-gray-500'
                    }`}>
                      {OPTION_LABELS[j]}. {opt}
                    </div>
                  ))}
                  {q.explanation && (
                    <p className="mt-2 text-gray-400 italic">{q.explanation}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <Link
          href="/digest"
          className="flex-1 text-center py-3 px-6 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors"
        >
          Back to Reading
        </Link>
        <Link
          href="/quiz"
          className="flex-1 text-center py-3 px-6 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
        >
          New Quiz
        </Link>
      </div>
    </div>
  );
}

export default function QuizClient({ sessionId, paperTitle, questions, initialAnswers, initialStatus, initialScore }: Props) {
  const [answers, setAnswers] = useState<Answer[]>(initialAnswers);
  const [status, setStatus] = useState(initialStatus);
  const [score, setScore] = useState<number | null>(initialScore);
  const [currentQ, setCurrentQ] = useState(() => {
    const answeredCount = initialAnswers.length;
    return Math.min(answeredCount, 2);
  });
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    correctIndex: number;
    explanation: string;
    selectedOption: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'completed') {
    return (
      <ScoreSummary
        score={score ?? 0}
        questions={questions}
        answers={answers}
      />
    );
  }

  const question = questions[currentQ];

  async function handleAnswer(optionIndex: number) {
    if (submitting || feedback) return;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/quiz/${sessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_index: currentQ, selected_option: optionIndex }),
      });
      const data = await res.json();

      const newAnswer: Answer = {
        question_index: currentQ,
        selected_option: optionIndex,
        is_correct: data.is_correct,
      };
      setAnswers(prev => [...prev, newAnswer]);

      setFeedback({
        isCorrect: data.is_correct,
        correctIndex: data.correct_index,
        explanation: data.explanation,
        selectedOption: optionIndex,
      });

      if (data.completed) {
        setScore(data.score);
        setStatus('completed');
      }
    } catch {
      // silent fail, user can retry
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (status === 'completed') return;
    setFeedback(null);
    setCurrentQ(prev => prev + 1);
  }

  const isLastQuestion = currentQ === 2;

  return (
    <div>
      {/* Paper title */}
      <p className="text-sm text-gray-500 mb-2 line-clamp-1">{paperTitle}</p>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {[0, 1, 2].map(i => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${
            i < answers.length ? 'bg-indigo-500' :
            i === currentQ ? 'bg-indigo-800' :
            'bg-gray-800'
          }`} />
        ))}
        <span className="text-sm text-gray-400 ml-1">Q{currentQ + 1}/3</span>
      </div>

      {/* Question */}
      <div className="bg-gray-900 rounded-xl p-6 mb-6">
        <p className="text-xl font-semibold leading-relaxed">{question.question}</p>
      </div>

      {/* Options */}
      <div className="space-y-3 mb-6">
        {question.options.map((option, i) => {
          let className = 'w-full text-left px-5 py-4 rounded-xl border transition-colors ';
          if (feedback) {
            if (i === feedback.correctIndex) {
              className += 'border-green-500 bg-green-900/30 text-green-300';
            } else if (i === feedback.selectedOption && !feedback.isCorrect) {
              className += 'border-red-500 bg-red-900/30 text-red-300';
            } else {
              className += 'border-gray-800 bg-gray-900 text-gray-500';
            }
          } else {
            className += 'border-gray-800 bg-gray-900 hover:border-indigo-500 hover:bg-gray-800 text-gray-200 cursor-pointer';
          }

          return (
            <button
              key={i}
              onClick={() => handleAnswer(i)}
              disabled={!!feedback || submitting}
              className={className}
            >
              <span className="font-mono text-gray-400 mr-3">{OPTION_LABELS[i]}.</span>
              {option}
            </button>
          );
        })}
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`rounded-xl p-4 mb-6 ${feedback.isCorrect ? 'bg-green-900/20 border border-green-800' : 'bg-red-900/20 border border-red-800'}`}>
          <p className={`font-semibold mb-1 ${feedback.isCorrect ? 'text-green-400' : 'text-red-400'}`}>
            {feedback.isCorrect ? '✓ Correct!' : '✗ Not quite'}
          </p>
          <p className="text-gray-300 text-sm">{feedback.explanation}</p>
        </div>
      )}

      {/* Next button */}
      {feedback && status !== 'completed' && (
        <button
          onClick={handleNext}
          className="w-full py-3 px-6 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors"
        >
          {isLastQuestion ? 'See Results →' : 'Next Question →'}
        </button>
      )}
    </div>
  );
}
