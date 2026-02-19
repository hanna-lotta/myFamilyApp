import React, { useState, useRef, useEffect } from 'react';
import './ChatBot.css';
import { Quiz } from './Quiz';
import { SpeakButton } from './SpeakButton';
import { SpeechToTextButton } from './SpeechToTextButton';
import { QuizControl } from './QuizControl';
import { getAuthHeader, decodeJwt, type JwtPayload } from '../utils/auth';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  imageUrl?: string;
  showSummaryButton?: boolean;
  showQuizButton?: boolean;
}

export const ChatBot: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [lastUploadedImage, setLastUploadedImage] = useState<File | null>(null);
  // Använd samma session per dag 
  const [sessionId] = useState(() => {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `session_${today}`; // split('T')[0] tar bara datumdelen av ISO-strängen, så vi får en unik sessionId per dag. 
  });
  const messagesEndRef = useRef<HTMLDivElement>(null); // Ref för att scrolla till botten av chatten när nya meddelanden läggs till
  const fileInputRef = useRef<HTMLInputElement>(null); // Ref för att kunna rensa filinputen när en bild tas bort

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); // När ett nytt meddelande läggs till, scrolla till botten av chatten 
  };

  // funktion för att få userId och familyId från JWT
  const getAuthParams = (): { userId: string; familyId: string } | null => { // Denna funktion hämtar JWT-token från localStorage, dekodar den och returnerar userId och familyId som behövs för att autentisera API-anropen. Om token inte finns eller inte kan dekodas, returnerar den null, vilket indikerar att användaren inte är inloggad. 
    const token = localStorage.getItem('jwt');
    if (!token) return null;
    
    const payload = decodeJwt(token); // Använder vår decodeJwt-funktion för att få ut payloaden från JWT-token, som innehåller userId och familyId. 
    if (!payload) 
		return null;
    
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
        return;
      }
	  //Authorization‑header (Bearer: token) skickas nu i chat‑fetchar: getAuthHeader() används för att hämta JWT-token från localStorage och formatera den som en Authorization-header
      try { 
        const authHeader = getAuthHeader();
        const headers: HeadersInit = authHeader ? { Authorization: authHeader } : {};
        const response = await fetch(
          `/api/chat/messages?familyId=${authParams.familyId}&userId=${authParams.userId}&sessionId=${sessionId}`,
          { credentials: 'include', headers } // Skicka Authorization-header så servern kan validera JWT och hämta rätt användares historik.
        );

        if (response.ok) {
          const data = await response.json();
          const loadedMessages: Message[] = data.items.map((item: any, index: number) => ({
            id: `${index}`,
            text: item.text,
            sender: item.role === 'user' ? 'user' : 'ai',
            timestamp: new Date(item.sk.split('#MSG#')[1]) // Vi antar att sk i DynamoDB är i formatet "MSG#<timestamp>", så vi splittrar på '#MSG#' och tar den andra delen (index 1) för att få timestampen, som vi sedan konverterar till ett Date-objekt. Detta gör att vi kan sortera och visa meddelandena i kronologisk ordning baserat på när de skickades. Vi använder sk för att lagra timestamp eftersom det gör det enkelt att sortera meddelanden i DynamoDB, och genom att extrahera timestampen från sk kan vi visa den i vår frontend utan att behöva lagra den som ett separat fält i databasen. 
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

//radera hel chat session

//visar bekräftelseruta, klickarman på avbryt så avslutas funkt.
  const handleDeleteSession = async () => {
    if (!window.confirm('Är du säker? Det går inte att ångra. Alla meddelanden i denna session kommer att raderas.')) {
      return;
    }

    const authParams = getAuthParams();
    if (!authParams) return;

    try {
      const response = await fetch(
        `/api/chat/session?familyId=${authParams.familyId}&userId=${authParams.userId}&sessionId=${sessionId}`,
        {
          method: 'DELETE',
          credentials: 'include'
        }
      );

      if (response.ok) {
        setMessages([]);
      }
    } catch (error) {
      console.error('Kunde inte ta bort session:', error);
     
    }
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
      const authHeader = getAuthHeader();
      const headers: HeadersInit = authHeader ? { Authorization: authHeader } : {};
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
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
          <div className="chat-header">
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
            {!isQuizMode && (
            <button onClick={handleDeleteSession} id="delete-session-btn">
              Radera session 🗑️
            </button>
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
                          📋 Sammanfatta läxan
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
                  📷
                </button>

                <SpeechToTextButton onResult={(text) => setInputText(text)} />

                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyPress={handleKeyPress}
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
                  Skicka
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </QuizControl>
  );
};
