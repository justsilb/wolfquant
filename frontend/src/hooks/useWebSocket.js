import { useState, useEffect, useRef, useCallback } from 'react';

export default function useWebSocket(url) {
  const [quotes, setQuotes] = useState({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const mountedRef = useRef(true);
  const lastUpdateRef = useRef(Date.now());
  const ageIntervalRef = useRef(null);
  const [ageSec, setAgeSec] = useState(0);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = url.startsWith('ws') ? url : `${protocol}//${window.location.host}${url}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (mountedRef.current) {
        setConnected(true);
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (mountedRef.current) {
          lastUpdateRef.current = Date.now();
          setAgeSec(0);
          // Expect either { symbol: {...} } streaming or full quotes blob
          if (data.quotes) {
            setQuotes(data.quotes);
          } else {
            setQuotes((prev) => {
              const next = { ...prev };
              Object.entries(data).forEach(([sym, q]) => {
                next[sym] = { ...(next[sym] || {}), ...q };
              });
              return next;
            });
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      if (mountedRef.current) {
        setConnected(false);
        reconnectTimeoutRef.current = setTimeout(connect, 5000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [url]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    ageIntervalRef.current = setInterval(() => {
      if (mountedRef.current) {
        setAgeSec(Math.floor((Date.now() - lastUpdateRef.current) / 1000));
      }
    }, 1000);

    return () => {
      mountedRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (ageIntervalRef.current) {
        clearInterval(ageIntervalRef.current);
        ageIntervalRef.current = null;
      }
    };
  }, [connect]);

  return { quotes, connected, ageSec };
}
