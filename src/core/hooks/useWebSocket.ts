import { useEffect, useRef, useState, useCallback } from 'react';
import { WS_BASE_URL } from '../config/constants';



let sharedAudioCtx: AudioContext | null = null;

const initSharedAudioCtx = () => {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch((err) => console.warn("[Audio] Failed to resume context:", err));
  }
  return sharedAudioCtx;
};

// Autoplay bypass: unlock audio context on first user click/keypress/touchstart
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    const ctx = initSharedAudioCtx();
    if (ctx && ctx.state === 'running') {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    }
  };
  window.addEventListener('click', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('touchstart', unlockAudio);
}

export const useWebSocket = (
  restaurantUuid: string | undefined,
  token: string | null,
  onNewOrder: (event: any) => void,
  filialUuid?: string
) => {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const pingIntervalRef = useRef<any>(null);
  const isClosedIntentionallyRef = useRef(false);

  // Keep latest onNewOrder callback in a ref to avoid reconnecting when callback reference changes
  const onNewOrderRef = useRef(onNewOrder);
  useEffect(() => {
    onNewOrderRef.current = onNewOrder;
  }, [onNewOrder]);

  // Keep connect callback in a ref to solve circular dependency with _scheduleReconnect
  const connectRef = useRef<() => void>(() => {});

  // Play standard notification sound
  const playAlertSound = useCallback(() => {
    try {
      const audioCtx = initSharedAudioCtx();
      if (!audioCtx) return;

      // Force resume in case it was suspended somehow
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      
      // Create a chime sound programmatically
      const playTone = (freq: number, startTime: number, duration: number, volume: number) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        
        gainNode.gain.setValueAtTime(volume, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = audioCtx.currentTime;
      playTone(523.25, now, 0.4, 0.15); // C5
      playTone(659.25, now + 0.15, 0.6, 0.15); // E5
      playTone(783.99, now + 0.15, 0.6, 0.1); // G5
    } catch (e) {
      console.warn("Failed to play audio alert:", e);
    }
  }, []);

  // Helper to schedule a reconnection attempt
  const _scheduleReconnect = useCallback((delayMs: number = 3000) => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    console.log(`[WS] Reconnect scheduled in ${delayMs / 1000}s`);
    reconnectTimeoutRef.current = setTimeout(() => {
      console.log('[WS] Attempting to reconnect...');
      connectRef.current();
    }, delayMs);
  }, []);

  const connect = useCallback(() => {
    if (!restaurantUuid || !token) return;

    // Clear any active reconnect timer
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Clear any existing ping interval
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    isClosedIntentionallyRef.current = false;

    // Close existing socket if any
    if (socketRef.current) {
      isClosedIntentionallyRef.current = true;
      socketRef.current.close();
    }

    isClosedIntentionallyRef.current = false;

    // Determine filial UUID if user has branch assignments
    let branchUuid = filialUuid;
    if (!branchUuid && typeof window !== 'undefined') {
      try {
        const partnerDataStr = localStorage.getItem('milliygo_partner_data');
        if (partnerDataStr) {
          const partnerData = JSON.parse(partnerDataStr);
          branchUuid = partnerData.current_filial?.uuid || 
                       partnerData.home_filial?.uuid || 
                       partnerData.current_filial_uuid || 
                       partnerData.home_filial_uuid;
        }
      } catch (e) {
        console.error('[WS] Failed to parse partner data from localStorage:', e);
      }
    }

    // Route connection endpoint
    const wsUrl = branchUuid
      ? `${WS_BASE_URL}${restaurantUuid}/filial/${branchUuid}/orders/?token=${token}`
      : `${WS_BASE_URL}${restaurantUuid}/orders/?token=${token}`;

    console.log(`[WS] Connecting to URL: ${wsUrl}`);
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log('[WS] Connection Established successfully');
      setIsConnected(true);

      // Start keep-alive ping interval (every 30 seconds)
      pingIntervalRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          console.log('[WS] Sending ping to keep connection alive');
          socket.send(JSON.stringify({ action: 'ping' }));
        }
      }, 30000);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[WS] Received message:', data);

        // Handle pong message
        if (data.action === 'pong') {
          console.log('[WS] Connection alive (received pong)');
          return;
        }

        if (data.type === 'new_order_alert') {
          playAlertSound();
          onNewOrderRef.current(data);
        } else if (data.type === 'order_status_update') {
          onNewOrderRef.current(data);
        }
      } catch (e) {
        console.error('[WS] Failed to parse message:', e);
      }
    };

    socket.onclose = (event) => {
      console.log('[WS] Connection Closed:', event.reason);
      setIsConnected(false);
      
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      // Try to reconnect after 3 seconds if connection was not closed intentionally
      if (!isClosedIntentionallyRef.current) {
        _scheduleReconnect(3000);
      }
    };

    socket.onerror = (error) => {
      console.error('[WS] Error occurred:', error);
    };
  }, [restaurantUuid, token, playAlertSound, _scheduleReconnect, filialUuid]);

  // Keep connectRef pointing to the latest connect function
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      isClosedIntentionallyRef.current = true;
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };
  }, [connect]);

  const triggerMockNotification = useCallback(() => {
    console.log("Triggering mock WebSocket notification...");
    playAlertSound();
    
    const mockEvent = {
      type: 'new_order_alert',
      message: 'Yangi buyurtma qabul qilindi (Test)',
      order_data: {
        uuid: `mock-order-${Math.random().toString(36).substr(2, 9)}`,
        status: 'PENDING',
        total_price: (25000 + Math.floor(Math.random() * 100000)).toString(),
        address: 'Toshkent shahar, Yunusobod tumani, 4-daha, 12-uy'
      }
    };
    onNewOrderRef.current(mockEvent);
  }, [playAlertSound]);

  return { isConnected, triggerMockNotification };
};
