import { useState } from 'react';

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
  
}

export const useQuiz = ({
  getAuthParams,
  lastUploadedImage,
  sessionId,
  difficulty,
  setIsLoading,
  isLoading, 
  
}: UseQuizParams) => {
  const [isQuizMode, setIsQuizMode] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);

  const handleQuizButton = async () => {
    if (!lastUploadedImage || isLoading) return;

    const authParams = getAuthParams();
    if (!authParams) {
      console.error('No valid authentication found');
      return;
    }

    setIsLoading(true);

	// Authorization‑header (Bearer: token) skickas nu i chat‑fetchar
    const token = localStorage.getItem('jwt');
    const authHeader = token ? `Bearer: ${token}` : null;
    try {
      const formData = new FormData();
      formData.append('message', 'Generera ett utbildningskviz baserat på denna läxa');
      formData.append('image', lastUploadedImage);
      formData.append('familyId', authParams.familyId);
      formData.append('userId', authParams.userId);
      formData.append('sessionId', sessionId);
      formData.append('mode', 'quiz');
      formData.append('difficulty', difficulty);

      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
        credentials: 'include'
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

    const token = localStorage.getItem('jwt');
    const authHeader = token ? `Bearer: ${token}` : null;

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