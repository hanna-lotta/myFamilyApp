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
  const [isSaving, setIsSaving] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-spara chatthistorik efter varje nytt meddelande
  useEffect(() => {
    // Skippa initiala meddelanden och spara bara riktiga konversationer
    if (messages.length <= 1 || isSaving) return;

    // Debounce: vänta 2 sekunder efter senaste meddelandet innan sparning
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveChatHistory();
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [messages]);

  const saveChatHistory = async () => {
    if (isSaving) return;
    
    setIsSaving(true);
    try {
      const token = localStorage.getItem('jwt');
      if (!token) return;

      // Serialisera meddelanden (ta bort bilddata för att spara plats)
      const messagesToSave = messages.map(msg => ({
        id: msg.id,
        text: msg.text,
        sender: msg.sender,
        timestamp: msg.timestamp.toISOString(),
        hasImage: !!msg.imageUrl
      }));

      await fetch('/api/chat-history/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer: ${token}`
        },
        body: JSON.stringify({ messages: messagesToSave })
      });
    } catch (error) {
      console.error('Failed to save chat history:', error);
    } finally {
      setIsSaving(false);
    }
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
      let body;
      let headers: HeadersInit = {};

      if (imageToSend) {
        // Skicka som multipart/form-data för bild
        const formData = new FormData();
        formData.append('message', messageText);
        formData.append('image', imageToSend);
        body = formData;
      } else {
        // Skicka som JSON för text
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ message: messageText });
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body,
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
