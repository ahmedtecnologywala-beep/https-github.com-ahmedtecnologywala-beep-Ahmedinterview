export enum AppState {
  SETUP = 'SETUP',
  INTERVIEW = 'INTERVIEW',
  ENDED = 'ENDED'
}

export enum StreamPlatform {
  FACEBOOK = 'Facebook',
  LINKEDIN = 'LinkedIn',
  INSTAGRAM = 'Instagram',
  YOUTUBE = 'YouTube'
}

export interface StreamConfig {
  isStreaming: boolean;
  platform: StreamPlatform | null;
  duration: number; // in seconds
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: number;
}

export interface UserConfig {
  name: string;
  jobRole: string;
}
