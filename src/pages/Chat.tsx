import React, { useState, useEffect, useRef } from 'react';
import { ChatBot } from '../components/chatBot';
import './Chat.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClockRotateLeft, faXmark, faTrash } from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router';
import useClickOutside from '../hooks/useClickOutside';
import type { Session, Message, JwtPayload } from '../types/types'; 




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

function getAuthParams(): { userId: string; familyId: string } | null {
  const token = localStorage.getItem('jwt');
  if (!token) return null;
  
  const payload = decodeJwt(token);
  if (!payload) return null;
  
  return {
    userId: payload.userId,
    familyId: payload.familyId
  };
}

export const Chat: React.FC = () => {
  const [isSessionsOpen, setIsSessionsOpen] = useState(false);
  const [isSessionsClosing, setIsSessionsClosing] = useState(false);
  const [isSessionsVisible, setIsSessionsVisible] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);
   const [messages, setMessages] = useState<Message[]>([]);

  // Använd samma session per dag istället för ny vid varje reload
    const [sessionId] = useState(() => {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      return `session_${today}`;
    });

  //hämtar tidigare konversationer 
  useEffect(() => {
    const fetchSessions = async () => {
      const authParams = getAuthParams();
      console.log('Auth params:', authParams);
      if (!authParams) {
        console.warn('No auth params found');
        return;
      }

      setIsLoadingSessions(true);
      try {
        const url = `/api/chat/sessions?familyId=${authParams.familyId}&userId=${authParams.userId}`;
        console.log('Fetching sessions from:', url);
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('jwt')}`
          }
        });
        
        console.log('Response status:', response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log('Sessions data received:', data);
          
          // Handle both array and object format
          let sessionList: Session[] = [];
          if (Array.isArray(data)) {
            sessionList = data;
          } else if (data && Array.isArray(data.sessions)) {
            sessionList = data.sessions;
          } else if (data && Array.isArray(data.items)) {
            sessionList = data.items;
          }
          
          console.log('Parsed sessions:', sessionList);
          setSessions(sessionList);
        } else {
          console.error('Failed to fetch sessions. Status:', response.status);
          const error = await response.text();
          console.error('Response:', error);
        }
      } catch (error) {
        console.error('Fetch error:', error);
      } finally {
        setIsLoadingSessions(false);
      }
    };

    fetchSessions();
  }, []);

  const handleSessionsClose = () => {
    setIsSessionsClosing(true);
    setTimeout(() => {
      setIsSessionsOpen(false);
      setIsSessionsClosing(false);
      setIsSessionsVisible(false);
    }, 300);
  };
  
  useClickOutside(dropdownRef, () => {
    if (isSessionsOpen && !isSessionsClosing) {
      handleSessionsClose();
    }
  }, isSessionsVisible);

  const handleSessionSelect = (sessionId: string) => {
    navigate('/chat', { state: { loadSessionId: sessionId } });
    setIsSessionsOpen(false);
  };

  //radera hel chat session
  
  //visar bekräftelseruta, klickarman på avbryt så avslutas funkt.
    const handleDeleteSession = async (sessionIdToDelete: string) => {
      if (!window.confirm('Är du säker? Det går inte att ångra. Alla meddelanden i denna session kommer att raderas.')) {
        return;
      }
  
      const authParams = getAuthParams();
      if (!authParams) return;
  
      try {
        const response = await fetch(
          `/api/chat/session?familyId=${authParams.familyId}&userId=${authParams.userId}&sessionId=${sessionIdToDelete}`,
          {
            method: 'DELETE',
            credentials: 'include'
          }
        );
  
        if (response.ok) {
          setSessions(sessions.filter(s => s.sessionId !== sessionIdToDelete));
        }
      } catch (error) {
        console.error('Kunde inte ta bort session:', error);
       
      }
    };



  return (
    <div className="chat-page">
      
      <div className="chat-content">
        <div className="chat-sessions">
          <button 
            className="chat-sessions-btn"
            onClick={() => {
              if (isSessionsClosing) return;
              if (isSessionsOpen) {
                handleSessionsClose();
              } else {
                setIsSessionsVisible(true);
                setTimeout(() => setIsSessionsOpen(true), 10);
              }
            }}
          >
            <FontAwesomeIcon icon={faClockRotateLeft} />
          </button>
          
          {isSessionsVisible && (
            <div 
              ref={dropdownRef}
              className={`chat-sessions-dropdown ${
              isSessionsClosing ? "hide" : isSessionsOpen ? "show" : ""
            }`}>
              <div className="chat-sessions-header">
                <h3>Tidigare konversationer</h3>
                <button
                  type="button"
                  className="chat-sessions-close"
                  onClick={handleSessionsClose}
                  aria-label="Stäng"
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
              
              {isLoadingSessions ? (
                <div className="chat-sessions-loading">Laddar...</div>
              ) : sessions.length === 0 ? (
                <div className="chat-sessions-empty">Inga tidigare konversationer</div>
              ) : (
                <div className="chat-sessions-list">
                  {sessions.map((session) => (
                    <div
                      key={session.sessionId}
                      className="chat-sessions-item"
                      onClick={() => handleSessionSelect(session.sessionId)}
                    >
                      <span className="session-title">{session.title || 'Konversation'}</span>

                       

                       <button
                        className="session-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation(); // Förhindra att handleSessionSelect triggas
                          handleDeleteSession(session.sessionId);
                        }}
                        aria-label="Ta bort session"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
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