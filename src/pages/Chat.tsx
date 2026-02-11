import React from 'react';
import { ChatBot } from '../components/chatbot';
import './Chat.css';

export const Chat: React.FC = () => {
  return (
    <div className="chat-page">
      <div className="chat-content">
        <div className="chat-header">
          <h1>🤖 Lexi – din smarta läxkompis</h1>
          <p>Få hjälp med dina läxor - ställ frågor om matte, svenska, engelska och mer!</p>
		  <br />
		  <p>Jag hjälper dig att förstå din läxa genom att läsa upp den, sammanfatta det viktigaste, skapa quiz och svara på dina frågor. Du kan skriva, prata eller ta en bild av din uppgift. Jag sparar dina samtal så att du kan fortsätta där du slutade – och dina föräldrar kan följa din utveckling och stötta dig när det behövs.</p>
        </div>
        <div className="chat-wrapper">
          <ChatBot />
        </div>
      </div>
    </div>
  );
};