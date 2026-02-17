import React, { useState } from 'react';
import { useQuiz } from '../hooks/useQuiz';
import type { QuizQuestion } from '../hooks/useQuiz';

type QuizControlRenderProps = {
  isQuizMode: boolean;
  setIsQuizMode: (v: boolean) => void;
  quizQuestions: QuizQuestion[];
  handleQuizButton: () => void;
  difficulty: 'easy' | 'medium' | 'hard';
  setDifficulty: (v: 'easy' | 'medium' | 'hard') => void;
  generateQuiz: (difficulty: 'easy' | 'medium' | 'hard') => Promise<void>;
};

type QuizControlProps = {
  getAuthParams: () => { userId: string; familyId: string } | null;
  lastUploadedImage: File | null;
  sessionId: string;
  setIsLoading: (v: boolean) => void;
  isLoading: boolean;
  children: (props: QuizControlRenderProps) => React.ReactNode;
};

export const QuizControl: React.FC<QuizControlProps> = ({
  getAuthParams,
  lastUploadedImage,
  sessionId,
  setIsLoading,
  isLoading,
  children
}) => {
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');

  const { isQuizMode, setIsQuizMode, quizQuestions, handleQuizButton, generateQuiz } = useQuiz({
    getAuthParams,
    lastUploadedImage,
    sessionId,
    difficulty,
    setIsLoading,
    isLoading
  });

  return (
    <>
      {children({
        isQuizMode,
        setIsQuizMode,
        quizQuestions,
        handleQuizButton,
        difficulty,
        setDifficulty,
        generateQuiz
      })}
    </>
  );
};