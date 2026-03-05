import { useState, useEffect } from 'react';
import { getAuthParams } from '../utils/authHelper';
import { getAuthHeader } from '../utils/auth';
import type { Message } from '../types/types';

export function useChatHistory(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const loadChatHistory = async () => {
      const authParams = getAuthParams();
      if (!authParams) return;
      try {
        const authHeader = getAuthHeader();
        const headers: HeadersInit = authHeader ? { Authorization: authHeader } : {};
        const response = await fetch(
          `/api/chat/messages?familyId=${authParams.familyId}&userId=${authParams.userId}&sessionId=${sessionId}`,
          { credentials: 'include', headers }
        );
        if (response.ok) {
          const data = await response.json();
          const loadedMessages: Message[] = data.items.map((item: any, index: number) => {
            const sk: string | undefined = typeof item.sk === 'string' ? item.sk : undefined;
            const skTimestamp = sk && sk.includes('#MSG#') ? sk.split('#MSG#')[1] : undefined;
            const fallbackTimestamp = item.timestamp || item.createdAt || new Date().toISOString();
            return {
              id: `${index}`,
              text: item.text,
              sender: item.role === 'user' ? 'user' : 'ai',
              timestamp: new Date(skTimestamp || fallbackTimestamp)
            };
          });
          const welcomeMessage: Message = {
            id: 'welcome',
            text: 'Hej! Jag är din läxhjälps-assistent. Du kan skriva frågor eller ladda upp ett foto av din läxa! 📚📸',
            sender: 'ai',
            timestamp: new Date(new Date().setHours(0, 0, 0, 0))
          };
          setMessages([welcomeMessage, ...loadedMessages]);
        } else {
          setMessages([{
            id: '1',
            text: 'Hej! Jag är din läxhjälps-assistent. Du kan skriva frågor eller ladda upp ett foto av din läxa! 📚📸',
            sender: 'ai',
            timestamp: new Date()
          }]);
        }
      } catch (error) {
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

  return { messages, setMessages };
}