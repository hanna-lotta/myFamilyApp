export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  imageUrl?: string;
  showSummaryButton?: boolean;
  showQuizButton?: boolean;
}

export interface JwtPayload {
  userId: string;
  username: string;
  role: string;
  familyId: string;
}

export interface Session {
  sessionId: string;
  title?: string;
}