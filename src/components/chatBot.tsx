import React, { useState, useRef, useEffect } from 'react';
import './ChatBot.css';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  imageUrl?: string;
  showSummaryButton?: boolean;
}

interface JwtPayload {
  userId: string;
  username: string;
  role: string;
  familyId: string;
}

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
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hej! Jag är din läxhjälps-assistent. Du kan skriva frågor eller ladda upp ett foto av din läxa! 📚📸',
      sender: 'ai',
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [lastUploadedImage, setLastUploadedImage] = useState<File | null>(null);
  const [sessionId] = useState(() => `session_${Date.now()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
      formData.append('message', messageText);
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
        showSummaryButton: !!imageToSend
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

  return (
    <div className="chatbot-container">
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
              {message.showSummaryButton && (
                <button 
                  onClick={handleSummaryRequest}
                  className="summary-button"
                  disabled={isLoading}
                >
                  📋 Sammanfatta läxan
                </button>
              )}
              <span className="message-time">
                {message.timestamp.toLocaleTimeString('sv-SE', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </span>
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
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="attach-button"
            title="Ladda upp bild av läxa"
          >
            📷
          </button>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Skriv din fråga här eller ladda upp en bild..."
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
    </div>
  );
};
