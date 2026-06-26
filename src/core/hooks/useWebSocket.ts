import { useEffect, useRef, useState, useCallback } from 'react';
import { WS_BASE_URL } from '../config/constants';

interface OrderAlertData {
  uuid: string;
  status: string;
  total_price: string | number;
  address: string;
}

interface NewOrderEvent {
  type: string;
  message: string;
  order_data: OrderAlertData;
}

export const useWebSocket = (
  restaurantUuid: string | undefined,
  token: string | null,
  onNewOrder: (event: NewOrderEvent) => void
) => {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
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
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
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

    isClosedIntentionallyRef.current = false;

    // Close existing socket if any
    if (socketRef.current) {
      isClosedIntentionallyRef.current = true;
      socketRef.current.close();
    }

    isClosedIntentionallyRef.current = false;
    const wsUrl = `${WS_BASE_URL}${restaurantUuid}/orders/?token=${token}`;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log('WebSocket Connection Established');
      setIsConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WebSocket received message:', data);
        if (data.type === 'new_order_alert') {
          playAlertSound();
          onNewOrderRef.current(data as NewOrderEvent);
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    socket.onclose = (event) => {
      console.log('WebSocket Connection Closed:', event.reason);
      setIsConnected(false);
      
      // Try to reconnect after 3 seconds if connection was not closed intentionally
      if (!isClosedIntentionallyRef.current) {
        _scheduleReconnect(3000);
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket Error:', error);
    };
  }, [restaurantUuid, token, playAlertSound, _scheduleReconnect]);

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
    };
  }, [connect]);

  const triggerMockNotification = useCallback(() => {
    console.log("Triggering mock WebSocket notification...");
    playAlertSound();
    
    const mockEvent: NewOrderEvent = {
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
