import React, { useState, useRef, useEffect } from 'react';
import './ChatBot.css';
import { Quiz } from './Quiz';
import { SpeakButton } from './SpeakButton';
import { SpeechToTextButton } from './SpeechToTextButton';
import { QuizControl } from './QuizControl';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera, faPaperPlane, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { getAuthHeader } from '../utils/auth';
import { useLocation } from 'react-router';
import { Message } from '../types/types';
import { getAuthParams } from '../utils/authHelper';
import {useChatHistory} from '../hooks/useChatHistory.ts';
import { handleDeleteMessage } from '../hooks/useChatActions';
import { useOcr } from '../hooks/useOcr';
import { PlusButton } from './PlusButton';


export const ChatBot: React.FC = () => {
 
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [lastUploadedImage, setLastUploadedImage] = useState<File | null>(null);

  const {
  ocrText,
  setOcrText,
  isOcrProcessing,
  setIsOcrProcessing,
  showOcrEditor,
  setShowOcrEditor,
  performOCR
} = useOcr();
  

const location = useLocation();

const sessionId =
  location.state?.loadSessionId ||
  `session_${new Date().toISOString().split('T')[0]}`;
const { messages, setMessages } = useChatHistory(sessionId);
  
  const messagesEndRef = useRef<HTMLDivElement>(null); // Ref för att scrolla till botten av chatten när nya meddelanden läggs till
  const fileInputRef = useRef<HTMLInputElement>(null); // Ref för att kunna rensa filinputen när en bild tas bort

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); // När ett nytt meddelande läggs till, scrolla till botten av chatten 
  };


  // Hantera inklistring av bilder
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items; // När användaren klistrar in något i chatten, kolla om det finns några filer i clipboard-data (t.ex. om de klistrar in en bild). Om det finns en bild, hämta den och sätt den som den valda bilden i state, samt skapa en förhandsvisning av bilden som kan visas i chatten innan den skickas till servern. 
      if (!items) 
		return;

      for (let i = 0; i < items.length; i++) { // Loopar igenom alla items i clipboard-data, eftersom det kan finnas flera filer eller andra data som klistras in samtidigt. Vi kollar varje item för att se om det är en bild (genom att kolla om item.type innehåller 'image'), och om vi hittar en bild, hanterar vi den genom att sätta den som den valda bilden i state och skapa en förhandsvisning. Efter att ha hanterat den första bilden, bryter vi loopen eftersom vi bara vill hantera en bild åt gången i chatten.
        const item = items[i]; // För varje item i clipboard-data, kolla om det är en bild genom att kolla om item.type innehåller 'image'. Om det är en bild, hämta den som en fil och sätt den som den valda bilden i state, samt skapa en förhandsvisning av bilden. 
        if (item.type.indexOf('image') !== -1) { // Kolla om itemets typ innehåller 'image', vilket indikerar att det är en bildfil. Om det är en bild, hantera den genom att hämta den som en fil och sätt den som den valda bilden i state, samt skapa en förhandsvisning av bilden. 
          const file = item.getAsFile(); // Hämta itemet som en fil, vilket ger oss en File-objekt som representerar den klistrade bilden. Vi kan sedan använda detta File-objekt för att skapa en förhandsvisning av bilden i chatten och för att skicka den till servern när användaren skickar sitt meddelande. 
          if (file) {
            setSelectedImage(file); // Sätt den klistrade bilden som den valda bilden i state
            const reader = new FileReader(); // Skapa en FileReader för att läsa in den klistrade bilden och skapa en förhandsvisning av den. Genom att använda FileReader kan vi läsa in bilden som en data-URL. 
            reader.onloadend = () => { // När FileReader har läst in bilden, sätt förhandsvisningen i state så att den kan visas i chatten.  
              setImagePreview(reader.result as string); // Sätt förhandsvisningen av den klistrade bilden i state, så att den kan visas i chatten. 
            };
            reader.readAsDataURL(file); // Läs in den klistrade bilden som en data-URL, vilket gör det enkelt att visa den i chatten innan den skickas till servern. Genom att använda FileReader för att läsa in bilden som en data-URL, kan vi snabbt och enkelt skapa en förhandsvisning av den klistrade bilden i chatten.
            
            // Starta OCR-behandling för klistrad bild
            performOCR(file);
            
            e.preventDefault(); // Förhindra standardbeteendet för klistra in, vilket kan inkludera att försöka klistra in bilden som text eller på annat sätt hantera det på ett sätt som inte är önskvärt i vår chat-komponent. 
            break; // Efter att ha hanterat den första klistrade bilden, bryt loopen eftersom vi bara vill hantera en bild åt gången i chatten. 
          }
        }
      }
    };

    document.addEventListener('paste', handlePaste); // Lägg till en event listener för 'paste' på dokumentet, så att vi kan hantera när användaren klistrar in något i chatten. 
    return () => {
      document.removeEventListener('paste', handlePaste); // Ta bort event listener för 'paste' när komponenten avmonteras, för att undvika minnesläckor och oönskade beteenden när användaren navigerar bort från chat-komponenten. 
    };
  }, []); // Den tomma beroende-arrayen [] gör att denna useEffect bara körs en gång när komponenten först renderas

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => { // När användaren väljer en bildfil genom filinputen, hantera den valda bilden och skapa en förhandsvisning av den. 
    const file = e.target.files?.[0]; // Hämta den första valda filen från filinputen, eftersom vi bara tillåter en bild åt gången. Vi kollar om det finns en fil och om den är av typen bild (genom att kolla om file.type börjar med 'image/'), och om så är fallet, sätter vi den som den valda bilden i state och skapar en förhandsvisning av den. 
    
    if (file && file.type.startsWith('image/')) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      
      // Starta OCR-behandling
      performOCR(file);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setOcrText('');
    setShowOcrEditor(false);
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
    setOcrText('');
    setShowOcrEditor(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsLoading(true);

    try {
      const authHeader = getAuthHeader();
      const headers: HeadersInit = authHeader ? { Authorization: authHeader } : {};
      const formData = new FormData();
      // Om bara bild utan text, skicka standardmeddelande
      const messageToSend = messageText.trim() || (imageToSend ? 'Vad ser du på denna bild av min läxa?' : '');
      formData.append('message', messageToSend || 'Analysera denna bild av min läxa');
      formData.append('familyId', authParams.familyId);
      formData.append('userId', authParams.userId);
      formData.append('sessionId', sessionId);
      
      // Skicka bara bilden om vi INTE har OCR-text (dvs om användaren inte klistrade in/fotograferade)
      // Om vi har OCR-text skickar vi bara texten, inte bilden för att spara bandbredd
      if (imageToSend && !ocrText) {
        formData.append('image', imageToSend);
        console.log('📷 Sending image + text to server');
      } else if (ocrText) {
        console.log('📝 Sending OCR text only (no image)');
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers
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
      const authHeader = getAuthHeader();
      const headers: HeadersInit = authHeader ? { Authorization: authHeader } : {};
      const formData = new FormData();
      formData.append('message', 'Ge mig en tydlig sammanfattning av denna läxa med de viktigaste punkterna numrerade. Börja med ämnesområde, sedan lista huvudpunkterna på ett pedagogiskt sätt.');
      formData.append('image', lastUploadedImage);
      formData.append('familyId', authParams.familyId);
      formData.append('userId', authParams.userId);
      formData.append('sessionId', sessionId);

      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers
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

  // const { loadSessionId } = useLocation().state || {};


  const handleQuizComplete = async (quizScore: number, questionCount: number) => {
    const authParams = getAuthParams();
    const authHeader = getAuthHeader();
    if (!authParams || !authHeader) {
      return;
    }

    try {
      await fetch('/api/chat/stats', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader
        },
        body: JSON.stringify({
          familyId: authParams.familyId,
          userId: authParams.userId,
          sessionId,
          quizScore
        })
      });
    } catch (error) {
      console.error('Kunde inte spara quizresultat:', error);
    }
  };

  return (
    <QuizControl
      getAuthParams={getAuthParams}
      lastUploadedImage={lastUploadedImage}
      sessionId={sessionId}
      setIsLoading={setIsLoading}
      isLoading={isLoading}
      lastUserMessage={[...messages].reverse().find(m => m.sender === 'user')?.text || ''}
    >
      {({ isQuizMode, setIsQuizMode, quizQuestions, handleQuizButton, difficulty, setDifficulty, generateQuiz }) => (
        <div className="chatbot-container">
          <div className="chat-frame">
            <h2>Chat - {new Date().toLocaleDateString('sv-SE')}</h2>
            {isQuizMode && (
              <label className="quiz-difficulty">
                nivå
                <select
                  value={difficulty}
                  onChange={(e) => {
                    const newDifficulty = e.target.value as 'easy' | 'medium' | 'hard';
                    setDifficulty(newDifficulty);
                    generateQuiz(newDifficulty);
                  }}
                  disabled={isLoading}
                >
                  <option id='easy' value="easy">Lätt</option>
                  <option id='medium-level' value="medium">Mellan</option>
                  <option id='hard-level' value="hard">Svår</option>
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
              onQuizComplete={handleQuizComplete}
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
                          onClick={() => handleDeleteMessage(message.id, message.timestamp, sessionId, setMessages)}
                          id="delete-message-btn"
                          title="Ta bort detta meddelande"
                        >
                          <FontAwesomeIcon icon={faTrashCan} />
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
              
              {/* OCR-texteredigerare */}
              {showOcrEditor && !isOcrProcessing && (
                <div className="ocr-editor">
                  <div className="ocr-header">
                    <h4>📝 Extraherad text från bilden (redigera vid behov):</h4>
                    {isOcrProcessing && <p className="ocr-loading">Bearbetar text...</p>}
                  </div>
                  <textarea
                    value={ocrText}
                    onChange={(e) => setOcrText(e.target.value)}
                    placeholder="Extraherad text visas här..."
                    className="ocr-textarea"
                    rows={4}
                    disabled={isOcrProcessing || isLoading}
                  />
                  <div className="ocr-actions">
                    <button 
                      onClick={() => {
                        setInputText(ocrText);
                        setShowOcrEditor(false);
                      }}
                      disabled={isLoading || !ocrText.trim()}
                      className="ocr-send-btn"
                    >
                      ✓ Använd denna text
                    </button>
                    <button 
                      onClick={() => {
                        setShowOcrEditor(false);
                        setOcrText('');
                      }}
                      className="ocr-cancel-btn"
                    >
                      ✕ Avbryt
                    </button>
                  </div>
                </div>
              )}

              {isOcrProcessing && (
                <div className="ocr-loading-container">
                  <p>🔄 Läser in text från bilden...</p>
                </div>
              )}
              
        <div className="textarea-button-wrapper" style={{ position: 'relative', width: '100%' }}>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Skriv din fråga här..."
            className="chat-input"
            rows={2}
            disabled={isLoading}
            style={{ width: '100%' }}
          />
          <div style={{ position: 'absolute', top: '95%', left: 8, transform: 'translateY(-50%)' }}>
            <PlusButton
              disabled={isLoading}
              onAttachClick={() => fileInputRef.current?.click()}
              onEmojiClick={() => {}}
              onSendClick={handleSendMessage}
              sendDisabled={!inputText.trim() && !selectedImage}
            />
          </div>
          <div style={{ position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)' }}>
            <SpeechToTextButton onResult={(text) => setInputText(text)} />
          </div>
        </div>
            </div>
          )}
        </div>
      )}
    </QuizControl>
  );
};
