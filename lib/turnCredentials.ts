interface TurnCredentials {
  username: string;
  credential: string;
  ttl: number;
  uris: string[];
}

interface CloudflareTurnResponse {
  iceServers: {
    urls: string[];
    username: string;
    credential: string;
  };
  ttl: number;
}

class TurnCredentialManager {
  private credentials: TurnCredentials | null = null;
  private expiryTime: number = 0;
  private refreshPromise: Promise<TurnCredentials> | null = null;

  private async fetchCredentials(): Promise<TurnCredentials> {
    const orgId = '17963306-0f63-4747-8cca-eb7b902306f4';
    const apiKey = '02d509a81ddc5d48f4d0';
    const authHeader = 'Basic MTc5NjMzMDYtMGY2My00NzQ3LThjY2EtZWI3YjkwMjMwNmY0OjAyZDUwOWE4MWRkYzVkNDhmNGQw';

    try {
      const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${orgId}/credentials/generate`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ttl: 43200 // 12 hours
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch TURN credentials: ${response.status} ${response.statusText}`);
      }

      const data: CloudflareTurnResponse = await response.json();
      
      return {
        username: data.iceServers.username,
        credential: data.iceServers.credential,
        ttl: data.ttl,
        uris: data.iceServers.urls
      };
    } catch (error) {
      console.error('Error fetching TURN credentials:', error);
      // Fallback to basic STUN if TURN fails
      throw error;
    }
  }

  async getCredentials(): Promise<TurnCredentials> {
    const now = Date.now();
    
    // If we have valid credentials that won't expire in the next 5 minutes, use them
    if (this.credentials && this.expiryTime > now + 5 * 60 * 1000) {
      return this.credentials;
    }

    // If we're already refreshing, wait for that to complete
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // Start a new refresh
    this.refreshPromise = this.fetchCredentials();
    
    try {
      const newCredentials = await this.refreshPromise;
      this.credentials = newCredentials;
      this.expiryTime = now + (newCredentials.ttl * 1000);
      return newCredentials;
    } finally {
      this.refreshPromise = null;
    }
  }

  async getICEServers(): Promise<RTCIceServer[]> {
    try {
      const credentials = await this.getCredentials();
      
      return [
        // STUN servers (always available)
        { urls: 'stun:stun.cloudflare.com:3478' },
        
        // TURN servers with credentials
        {
          urls: [
            'turn:turn.cloudflare.com:3478?transport=udp',
            'turn:turn.cloudflare.com:3478?transport=tcp',
            'turn:turn.cloudflare.com:80?transport=tcp',
            'turns:turn.cloudflare.com:5349?transport=tcp',
            'turns:turn.cloudflare.com:443?transport=tcp'
          ],
          username: credentials.username,
          credential: credentials.credential
        }
      ];
    } catch (error) {
      console.warn('Failed to get TURN credentials, falling back to STUN only:', error);
      // Fallback to STUN only if TURN credential fetch fails
      return [
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.l.google.com:19302' }
      ];
    }
  }
}

export const turnCredentialManager = new TurnCredentialManager();