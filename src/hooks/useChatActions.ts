import { getAuthParams } from '../utils/authHelper';
import { getAuthHeader } from '../utils/auth';
import type { Message, Session } from '../types/types';


export async function handleDeleteMessage(
  messageId: string,
  timestamp: Date,
  sessionId: string,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
) {
  if (!window.confirm('Är du säker att du vill ta bort detta meddelande?')) return;

  const authParams = getAuthParams();
  if (!authParams) return;
  const authHeader = getAuthHeader();
  if (!authHeader) return;

  try {
    const response = await fetch(
      `/api/chat/message?familyId=${authParams.familyId}&userId=${authParams.userId}&sessionId=${sessionId}&timestamp=${timestamp.toISOString()}`,
      {
        method: 'DELETE',
        credentials: 'include',
        headers: { Authorization: authHeader }
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
}



export async function handleDeleteSession(
  sessionId: string,
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>,
  sessions: Session[]
) {
  if (!window.confirm('Är du säker? Det går inte att ångra. Alla meddelanden i denna session kommer att raderas.')) return;

  const authParams = getAuthParams();
  if (!authParams) return;
  const authHeader = getAuthHeader();
  if (!authHeader) return;

  try {
    const response = await fetch(
      `/api/chat/session?familyId=${authParams.familyId}&userId=${authParams.userId}&sessionId=${sessionId}`,
      {
        method: 'DELETE',
        credentials: 'include',
        headers: { Authorization: authHeader }
      }
    );
    if (response.ok) {
      setSessions(sessions.filter(s => s.sessionId !== sessionId));
    }
  } catch (error) {
    console.error('Kunde inte ta bort session:', error);
  }
}