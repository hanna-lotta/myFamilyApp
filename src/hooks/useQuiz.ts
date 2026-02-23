import { useState } from 'react';
import { getAuthHeader } from '../utils/auth';

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

interface UseQuizParams {
  getAuthParams: () => { userId: string; familyId: string } | null;
  lastUploadedImage: File | null;
  sessionId: string;
  setIsLoading: (v: boolean) => void;
  isLoading: boolean;
  difficulty: 'easy' | 'medium' | 'hard';
  lastUserMessage?: string; // Texten från sista user-meddelande
}

export const useQuiz = ({
  getAuthParams,
  lastUploadedImage,
  sessionId,
  difficulty,
  setIsLoading,
  isLoading,
  lastUserMessage
}: UseQuizParams) => {
  const [isQuizMode, setIsQuizMode] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);

  const handleQuizButton = async () => {
    if (!lastUserMessage || isLoading) return;

    const authParams = getAuthParams();
    if (!authParams) {
      console.error('No valid authentication found');
      return;
    }

    setIsLoading(true);

    const authHeader = getAuthHeader();
    try {
      const formData = new FormData();
      const quizMessage = lastUserMessage.trim() || 'Generera ett utbildningskviz baserat på denna läxa';
      formData.append('message', quizMessage);
      // Skicka bara bilden om vi INTE har extraherad text (OCR)
      // Om vi har OCR-text behöver vi inte bilden
      if (lastUploadedImage && !lastUserMessage) {
        formData.append('image', lastUploadedImage);
      }
      formData.append('familyId', authParams.familyId);
      formData.append('userId', authParams.userId);
      formData.append('sessionId', sessionId);
      formData.append('mode', 'quiz');
      formData.append('difficulty', difficulty);

      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: authHeader ? { Authorization: authHeader } : undefined
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      if (data.quiz && Array.isArray(data.quiz)) {
        setQuizQuestions(data.quiz);
        setIsQuizMode(true);
      }
    } catch (error) {
      console.error('Kunde inte ladda quiz', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateQuiz = async (difficultyLevel: 'easy' | 'medium' | 'hard' = difficulty) => {
    if (!lastUploadedImage) {
      return;
    }

    const authParams = getAuthParams();
    if (!authParams) {
      console.error('No valid authentication found');
      return;
    }

    setIsLoading(true);

    const authHeader = getAuthHeader();

    try {
      const formData = new FormData();
      formData.append('message', 'Generera ett utbildningskviz baserat på denna läxa');
      formData.append('image', lastUploadedImage);
      formData.append('familyId', authParams.familyId);
      formData.append('userId', authParams.userId);
      formData.append('sessionId', sessionId);
      formData.append('mode', 'quiz');
      formData.append('difficulty', difficultyLevel);

      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: authHeader ? { Authorization: authHeader } : undefined // Om authHeader är null, sätt headers till undefined så att fetch inte inkluderar en tom Authorization-header. Detta gör att vi bara skickar Authorization-headern när vi faktiskt har en token, och undviker att skicka en ogiltig header som kan orsaka problem på servern.
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      if (data.quiz && Array.isArray(data.quiz)) {
        setQuizQuestions(data.quiz);
        setIsQuizMode(true);
      }
    } catch (error) {
      console.error('Kunde inte ladda quiz', error);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isQuizMode,
    setIsQuizMode,
    quizQuestions,
    handleQuizButton,
    generateQuiz
  };
};