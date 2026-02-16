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

  //avbryt om du saknar bild eller redan laddar
  const handleQuizButton = async () => {
    if (!lastUploadedImage || isLoading) return;

//hämta inloggningsdata
    const authParams = getAuthParams();
    if (!authParams) {
      console.error('No valid authentication found');
      return;
    }
//loading blir true
    setIsLoading(true);


    //bygger FormData
    try {
      const formData = new FormData();
      formData.append('message', 'Generera ett utbildningskviz baserat på denna läxa');
      formData.append('image', lastUploadedImage);
      formData.append('familyId', authParams.familyId);
      formData.append('userId', authParams.userId);
      formData.append('sessionId', sessionId);
      formData.append('mode', 'quiz');
      formData.append('difficulty', difficulty);

      //skicka till backend
      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      //sparar frågor och aktiverar quiz läge , det gör att isQuizMode blir true och ChatBot.tsx byter ui
      if (data.quiz && Array.isArray(data.quiz)) {
        setQuizQuestions(data.quiz);
        setIsQuizMode(true);
      }
    } catch (error) {
      console.error('Kunde inte ladda quiz', error);
      //stäng 'loading'
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isQuizMode,
    setIsQuizMode,
    quizQuestions,
    handleQuizButton
  };
};