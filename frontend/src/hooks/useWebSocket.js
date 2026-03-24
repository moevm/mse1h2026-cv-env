import { useState, useEffect, useCallback, useRef } from 'react';

export const useWebSocket = (taskId) => {
  const [status, setStatus] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const connect = useCallback(() => {
    if (!taskId) return;

    const ws = new WebSocket(`ws://localhost:8000/api/training/ws/${taskId}`);
    
    ws.onopen = () => {
      console.log(`WebSocket connected for task ${taskId}`);
      setIsConnected(true);
      wsRef.current = ws;
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setStatus(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };
    
    ws.onclose = () => {
      console.log(`WebSocket disconnected for task ${taskId}`);
      setIsConnected(false);
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        if (taskId) connect();
      }, 3000);
    };
    
    wsRef.current = ws;
  }, [taskId]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (taskId) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [taskId, connect, disconnect]);

  return { status, isConnected };
};