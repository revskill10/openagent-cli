import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

export interface ConversationLog {
  agentId: string;
  text: string;
  type: "question" | "response";
  timestamp: Date;
  metadata?: {
    toolName?: string;
    executionTime?: number;
    success?: boolean;
    error?: string;
  };
}

export interface ConversationSession {
  id: string;
  startTime: Date;
  lastActivity: Date;
  logs: ConversationLog[];
  metadata: {
    version: string;
    totalMessages: number;
    totalTools: number;
  };
}

export class ConversationPersistence {
  private sessionsDir: string;
  private currentSession: ConversationSession | null = null;
  private autoSaveInterval: NodeJS.Timeout | null = null;

  constructor(baseDir: string = './openagent-sessions') {
    this.sessionsDir = baseDir;
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  // Start a new conversation session
  startNewSession(): string {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.currentSession = {
      id: sessionId,
      startTime: new Date(),
      lastActivity: new Date(),
      logs: [],
      metadata: {
        version: '1.0.0',
        totalMessages: 0,
        totalTools: 0,
      }
    };

    // Auto-save every 30 seconds
    this.autoSaveInterval = setInterval(() => {
      this.saveCurrentSession();
    }, 30000);

    console.log(`📝 Started new conversation session: ${sessionId}`);
    return sessionId;
  }

  // Add a log entry to the current session
  addLog(log: Omit<ConversationLog, 'timestamp'>): void {
    if (!this.currentSession) {
      this.startNewSession();
    }

    const logWithTimestamp: ConversationLog = {
      ...log,
      timestamp: new Date(),
    };

    this.currentSession!.logs.push(logWithTimestamp);
    this.currentSession!.lastActivity = new Date();
    this.currentSession!.metadata.totalMessages++;

    if (log.metadata?.toolName) {
      this.currentSession!.metadata.totalTools++;
    }
  }

  // Save current session to disk
  saveCurrentSession(): void {
    if (!this.currentSession) return;

    try {
      const sessionFile = join(this.sessionsDir, `${this.currentSession.id}.json`);
      writeFileSync(sessionFile, JSON.stringify(this.currentSession, null, 2));
    } catch (error) {
      console.warn('Failed to save conversation session:', error);
    }
  }

  // Load a specific session
  loadSession(sessionId: string): ConversationSession | null {
    try {
      const sessionFile = join(this.sessionsDir, `${sessionId}.json`);
      if (!existsSync(sessionFile)) {
        return null;
      }

      const data = readFileSync(sessionFile, 'utf8');
      const session = JSON.parse(data) as ConversationSession;
      
      // Convert date strings back to Date objects
      session.startTime = new Date(session.startTime);
      session.lastActivity = new Date(session.lastActivity);
      session.logs = session.logs.map(log => ({
        ...log,
        timestamp: new Date(log.timestamp)
      }));

      return session;
    } catch (error) {
      console.warn(`Failed to load session ${sessionId}:`, error);
      return null;
    }
  }

  // Get the most recent session
  getLastSession(): ConversationSession | null {
    try {
      const files = readdirSync(this.sessionsDir)
        .filter((file: string) => file.endsWith('.json'))
        .map((file: string) => {
          const filePath = join(this.sessionsDir, file);
          const stats = statSync(filePath);
          return {
            file,
            sessionId: file.replace('.json', ''),
            mtime: stats.mtime
          };
        })
        .sort((a: any, b: any) => b.mtime.getTime() - a.mtime.getTime());

      if (files.length === 0) {
        return null;
      }

      return this.loadSession(files[0].sessionId);
    } catch (error) {
      console.warn('Failed to get last session:', error);
      return null;
    }
  }

  // List all available sessions
  listSessions(): Array<{ id: string; startTime: Date; lastActivity: Date; messageCount: number }> {
    try {
      const files = readdirSync(this.sessionsDir)
        .filter((file: string) => file.endsWith('.json'));

      return files.map((file: string) => {
        const sessionId = file.replace('.json', '');
        const session = this.loadSession(sessionId);

        if (!session) return null;

        return {
          id: session.id,
          startTime: session.startTime,
          lastActivity: session.lastActivity,
          messageCount: session.logs.length
        };
      }).filter(Boolean) as Array<{ id: string; startTime: Date; lastActivity: Date; messageCount: number }>;
    } catch (error) {
      console.warn('Failed to list sessions:', error);
      return [];
    }
  }

  // Resume a session (set it as current)
  resumeSession(sessionId: string): boolean {
    const session = this.loadSession(sessionId);
    if (!session) {
      return false;
    }

    this.currentSession = session;
    
    // Restart auto-save
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    
    this.autoSaveInterval = setInterval(() => {
      this.saveCurrentSession();
    }, 30000);

    console.log(`📂 Resumed conversation session: ${sessionId}`);
    return true;
  }

  // Get current session logs
  getCurrentLogs(): ConversationLog[] {
    return this.currentSession?.logs || [];
  }

  // Get current session info
  getCurrentSession(): ConversationSession | null {
    return this.currentSession;
  }

  // End current session
  endSession(): void {
    if (this.currentSession) {
      this.saveCurrentSession();
      console.log(`💾 Ended conversation session: ${this.currentSession.id}`);
      this.currentSession = null;
    }

    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  // Clean up old sessions (older than specified days)
  cleanupOldSessions(daysToKeep: number = 30): void {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const files = readdirSync(this.sessionsDir)
        .filter((file: string) => file.endsWith('.json'));

      let deletedCount = 0;

      for (const file of files) {
        const sessionId = file.replace('.json', '');
        const session = this.loadSession(sessionId);

        if (session && session.lastActivity < cutoffDate) {
          const filePath = join(this.sessionsDir, file);
          unlinkSync(filePath);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} old conversation sessions`);
      }
    } catch (error) {
      console.warn('Failed to cleanup old sessions:', error);
    }
  }
}

// Global instance
export const conversationPersistence = new ConversationPersistence();
