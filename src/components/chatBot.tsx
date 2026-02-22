import React, { useState, useRef, useEffect } from 'react';
import './ChatBot.css';
import { Quiz } from './Quiz';
import { SpeakButton } from './SpeakButton';
import { SpeechToTextButton } from './SpeechToTextButton';
import { QuizControl } from './QuizControl';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import { useLocation } from 'react-router';
import type { Message, JwtPayload } from '../types/types';




// Hjälpfunktion för att dekoda JWT
function decodeJwt(token: string): JwtPayload | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => 
      '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    ).join(''));
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
}

export const ChatBot: React.FC = () => {
 
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [lastUploadedImage, setLastUploadedImage] = useState<File | null>(null);
  
  // Använd samma session per dag istället för ny vid varje reload
  const [sessionId] = useState(() => {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `session_${today}`;
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const [messages, setMessages] = useState<Message[]>([]);

  // Hjälpfunktion för att få userId och familyId från JWT
  const getAuthParams = (): { userId: string; familyId: string } | null => {
    const token = localStorage.getItem('jwt');
    if (!token) return null;
    
    const payload = decodeJwt(token);
    if (!payload) return null;
    
    return {
      userId: payload.userId,
      familyId: payload.familyId
    };
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Hämta chatthistorik när komponenten laddas
  useEffect(() => {
    const loadChatHistory = async () => {
      const authParams = getAuthParams();
      if (!authParams) {
        // Visa välkomstmeddelande om inte inloggad
        setMessages([{
          id: '1',
          text: 'Hej! Jag är din läxhjälps-assistent. Du kan skriva frågor eller ladda upp ett foto av din läxa! 📚📸',
          sender: 'ai',
          timestamp: new Date()
        }]);
        return;
      }

      try {
        const response = await fetch(
          `/api/chat/messages?familyId=${authParams.familyId}&userId=${authParams.userId}&sessionId=${sessionId}`,
          { credentials: 'include' }
        );

        if (response.ok) {
          const data = await response.json();
          const loadedMessages: Message[] = data.items.map((item: any, index: number) => ({
            id: `${index}`,
            text: item.text,
            sender: item.role === 'user' ? 'user' : 'ai',
            timestamp: new Date(item.sk.split('#MSG#')[1])
          }));

          // Lägg alltid till välkomstmeddelandet först
          const welcomeMessage: Message = {
            id: 'welcome',
            text: 'Hej! Jag är din läxhjälps-assistent. Du kan skriva frågor eller ladda upp ett foto av din läxa! 📚📸',
            sender: 'ai',
            timestamp: new Date(new Date().setHours(0, 0, 0, 0)) // Början av dagen
          };

          setMessages([welcomeMessage, ...loadedMessages]);
        } else {
          // Om API-anropet misslyckas, visa välkomstmeddelande
          console.log('Failed to fetch messages, showing welcome message');
          setMessages([{
            id: '1',
            text: 'Hej! Jag är din läxhjälps-assistent. Du kan skriva frågor eller ladda upp ett foto av din läxa! 📚📸',
            sender: 'ai',
            timestamp: new Date()
          }]);
        }
      } catch (error) {
        console.error('Error loading chat history:', error);
        // Visa välkomstmeddelande vid fel
        setMessages([{
          id: '1',
          text: 'Hej! Jag är din läxhjälps-assistent. Du kan skriva frågor eller ladda upp ett foto av din läxa! 📚📸',
          sender: 'ai',
          timestamp: new Date()
        }]);
      }
    };

    loadChatHistory();
  }, [sessionId]);

   // Radera ett enskild meddelande
  const handleDeleteMessage = async (messageId: string, timestamp: Date) => {
    // Visa bekräftelseruta innan radering
    if (!window.confirm('Är du säker att du vill ta bort detta meddelande?')) {
      return;
    }

    const authParams = getAuthParams();
    if (!authParams) return;

    try {
      const response = await fetch(
        `/api/chat/message?familyId=${authParams.familyId}&userId=${authParams.userId}&sessionId=${sessionId}&timestamp=${timestamp.toISOString()}`,
        {
          method: 'DELETE',
          credentials: 'include'
        }
      );

      if (response.ok) {
        setMessages(prev => prev.filter(msg => msg.id !== messageId));
      } else {
        alert('Kunde inte ta bort meddelandet');
      }
    } catch (error) {
      console.error('Fel när meddelandet skulle raderas:', error);
     
    }
  };




  // Hantera inklistring av bilder
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            setSelectedImage(file);
            const reader = new FileReader();
            reader.onloadend = () => {
              setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
            e.preventDefault();
            break;
          }
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, []);

  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendMessage = async () => {
    if ((!inputText.trim() && !selectedImage) || isLoading) 
		return;

    // Hämta userId och familyId från JWT
    const authParams = getAuthParams();
    if (!authParams) {
      console.error('No valid authentication found');
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'Du måste vara inloggad för att använda chatten.',
        sender: 'ai',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText || '📷 Bilaga',
      sender: 'user',
      timestamp: new Date(),
      imageUrl: imagePreview || undefined
    };

    setMessages(prev => [...prev, userMessage]);
    const messageText = inputText;
    const imageToSend = selectedImage;
    
    setInputText('');
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsLoading(true);

    try {
      const formData = new FormData();
      // Om bara bild utan text, skicka standardmeddelande
      const messageToSend = messageText.trim() || (imageToSend ? 'Vad ser du på denna bild av min läxa?' : '');
      formData.append('message', messageToSend || 'Analysera denna bild av min läxa');
      formData.append('familyId', authParams.familyId);
      formData.append('userId', authParams.userId);
      formData.append('sessionId', sessionId);
      
      if (imageToSend) {
        formData.append('image', imageToSend);
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: data.response,
        sender: 'ai',
        timestamp: new Date(),
        showSummaryButton: !!imageToSend,
        showQuizButton: !!imageToSend
      };

      setMessages(prev => [...prev, aiMessage]);
      
      // Spara senast uppladdade bilden för sammanfattning
      if (imageToSend) {
        setLastUploadedImage(imageToSend);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'Oj, något gick fel. Försök igen!',
        sender: 'ai',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSummaryRequest = async () => {
    if (!lastUploadedImage || isLoading) return;

    // Hämta userId och familyId från JWT
    const authParams = getAuthParams();
    if (!authParams) {
      console.error('No valid authentication found');
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      text: '📋 Ge mig en sammanfattning',
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('message', 'Ge mig en tydlig sammanfattning av denna läxa med de viktigaste punkterna numrerade. Börja med ämnesområde, sedan lista huvudpunkterna på ett pedagogiskt sätt.');
      formData.append('image', lastUploadedImage);
      formData.append('familyId', authParams.familyId);
      formData.append('userId', authParams.userId);
      formData.append('sessionId', sessionId);

      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: data.response,
        sender: 'ai',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error getting summary:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'Kunde inte skapa sammanfattning. Försök igen!',
        sender: 'ai',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const { loadSessionId } = useLocation().state || {};

useEffect(() => {
  if (loadSessionId) {
    const loadPreviousSession = async () => {
      const authParams = getAuthParams();
      if (!authParams) return;

      try {
        const response = await fetch(
          `/api/chat/messages?familyId=${authParams.familyId}&userId=${authParams.userId}&sessionId=${loadSessionId}`,
          { credentials: 'include' }
        );

        if (response.ok) {
          const data = await response.json();
          const loadedMessages: Message[] = data.items.map((item: any, index: number) => ({
            id: `${index}`,
            text: item.text,
            sender: item.role === 'user' ? 'user' : 'ai',
            timestamp: new Date(item.sk.split('#MSG#')[1])
          }));

          setMessages(loadedMessages);
        } else {
          console.log('Failed to fetch previous session messages');
        }
      } catch (error) {
        console.error('Error loading previous session:', error);
      }
    };

    loadPreviousSession();
  }
}, [loadSessionId]);


  return (
    <QuizControl
      getAuthParams={getAuthParams}
      lastUploadedImage={lastUploadedImage}
      sessionId={sessionId}
      setIsLoading={setIsLoading}
      isLoading={isLoading}
    >
      {({ isQuizMode, setIsQuizMode, quizQuestions, handleQuizButton, difficulty, setDifficulty, generateQuiz }) => (
        <div className="chatbot-container">
          <div className="chat-frame">
            <h2>Chat - {new Date().toLocaleDateString('sv-SE')}</h2>
            {isQuizMode && (
              <label className="quiz-difficulty">
                Quiz-nivå
                <select
                  value={difficulty}
                  onChange={(e) => {
                    const newDifficulty = e.target.value as 'easy' | 'medium' | 'hard';
                    setDifficulty(newDifficulty);
                    generateQuiz(newDifficulty);
                  }}
                  disabled={isLoading}
                >
                  <option value="easy">Lätt</option>
                  <option value="medium">Mellan</option>
                  <option value="hard">Svår</option>
                </select>
                {/* Visa användare att quiz laddas*/}
                 {isLoading && <span className="loading-spinner">⟳</span>}
              </label>
            )}
            

          </div>
              
          {isQuizMode ? (
            <Quiz
            // key används för att tvinga omrendering av Quiz-komponenten när svårighetsgraden ändras eller nya frågor genereras
              key={`${difficulty}-${quizQuestions.length}`}
              questions={quizQuestions}
              onAnswerSubmit={(answer) => console.log('Svar:', answer)}
              onQuizEnd={() => setIsQuizMode(false)}
            />
          ) : (
            <div className="chat-messages">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`message ${message.sender === 'user' ? 'user-message' : 'ai-message'}`}
                >
                  <div className="message-content">
                    {message.imageUrl && (
                      <img src={message.imageUrl} alt="Uppladdad läxa" className="message-image" />
                    )}
                    <p>{message.text}</p>
                    <div className="button-container">
                      {message.showSummaryButton && (
                        <button 
                          onClick={handleSummaryRequest}
                          className="summary-button"
                          disabled={isLoading}
                        >
                        Sammanfatta
                        </button>
                      )}

                      {message.showQuizButton && (
                        <button
                          onClick={handleQuizButton}
                          className="quiz-button"
                          disabled={isLoading} >
                          Skapa quiz 
                        </button>
                      )}
                      <div className='timestamp-speak-box'>
                      <span className="message-time">
                        {message.timestamp.toLocaleTimeString('sv-SE', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>

                      <SpeakButton text={message.text} />

                      {/* Ta bort enskilt meddelande */}
                      {message.id !== 'welcome' && (
                        <button
                          onClick={() => handleDeleteMessage(message.id, message.timestamp)}
                          id="delete-message-btn"
                          title="Ta bort detta meddelande"
                        >
                          🗑️
                        </button>
                        
                      )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="message ai-message">
                  <div className="message-content">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {!isQuizMode && (
            <div className="chat-input-container">
              {imagePreview && (
                <div className="image-preview">
                  <img src={imagePreview} alt="Preview" />
                  <button onClick={handleRemoveImage} className="remove-image-btn">×</button>
                </div>
              )}
              <div className="input-row">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageSelect}
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="attach-button"
                  title="Ta foto, välj från galleri eller klistra in bild"
                >
                  <FontAwesomeIcon icon={faCamera} />
                </button>

                <SpeechToTextButton onResult={(text) => setInputText(text)} />
              
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Skriv din fråga här, klistra in en bild, eller ladda upp från kamera/galleri..."
                  className="chat-input"
                  rows={2}
                  disabled={isLoading}
                  
                />
                <button
                  onClick={handleSendMessage}
                  disabled={(!inputText.trim() && !selectedImage) || isLoading}
                  className="send-button"
                >
                  <FontAwesomeIcon icon={faPaperPlane} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </QuizControl>
  );
};
