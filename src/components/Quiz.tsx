import React, { useState } from 'react';

interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

interface QuizProps {
  questions: QuizQuestion[]; // quiz‑frågorna från backend
  onAnswerSubmit: (answer: string) => void; // callback när användaren svarar
  onQuizEnd: () => void;
}

export const Quiz: React.FC<QuizProps> = ({ questions, onAnswerSubmit, onQuizEnd }) => {
  const [currentIndex, setCurrentIndex] = useState(0); //vilken fråga som visas
  const [answers, setAnswers] = useState<string[]>([]); //anv. svar
  const [showResults, setShowResults] = useState(false); //visa resultat ist för frågor

  if (!questions || questions.length === 0) { //om inga frågor..
    return (
      <div className="quiz-container">
        <p>Inga quizfrågor tillgängliga.</p>
        <button className="quiz-exit-btn" onClick={onQuizEnd}>Tillbaka</button>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex]; //fråga som visas nu
  const isLast = currentIndex === questions.length - 1; //om det är sista frågan


  //när användaren klickar ett svar, spara svaret i arrays och gå vidare till nästa fråga eller visa resultat
  const handleAnswer = (answer: string) => {
    const newAnswers = [...answers, answer];
    setAnswers(newAnswers);
    onAnswerSubmit(answer);

    if (isLast) {
      setShowResults(true);
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  };
 //räkna rätta svar
  const correctCount = answers.reduce((acc, ans, idx) => {
    return acc + (ans === questions[idx].correctAnswer ? 1 : 0);
  }, 0);
//visa resultat
  if (showResults) {
    const percent = Math.round((correctCount / questions.length) * 100);

    return (
      <div className="quiz-container">
        <h2>Quiz klart!</h2>
        <p className='quiz-result'>Du fick {correctCount} / {questions.length} rätt ({percent}%).</p>

        <div className="quiz-results">
          {questions.map((q, i) => {
            const userAnswer = answers[i];
            const isCorrect = userAnswer === q.correctAnswer;

            return (
              <div key={i} className={`quiz-result-item ${isCorrect ? 'correct' : 'incorrect'}`}>
                <p><strong>Fråga {i + 1}:</strong> {q.question}</p>
                <p>Ditt svar: {userAnswer}</p>
                <p>Rätt svar: {q.correctAnswer}</p>
                <p><em>{q.explanation}</em></p>
              </div>
            );
          })}
        </div>

        <button className="quiz-exit-btn" onClick={onQuizEnd}>
          Tillbaka till chatten
        </button>
      </div>
    );
  }

  return (
    <div className="quiz-container">
      <div className="quiz-header">
        <h2>Quiz</h2>
        <span>
          Fråga {currentIndex + 1} av {questions.length}
        </span>
      </div>

      <div className="quiz-question">
        <h3>{currentQuestion.question}</h3>
      </div>

      <div className="quiz-options">
        {currentQuestion.options.map((opt, i) => (
          <button
            key={i}
            className="quiz-option-btn"
            onClick={() => handleAnswer(opt)}
          >
            {String.fromCharCode(65 + i)}) {opt}
          </button>
        ))}
      </div>

      <button className="quiz-exit-btn" onClick={onQuizEnd}>
        Avsluta quiz
      </button>
    </div>
  );
};