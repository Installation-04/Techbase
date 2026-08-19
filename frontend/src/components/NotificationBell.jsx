import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function NotificationBell({ dark = false }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef(null);
  const navigate = useNavigate();

  const fetchUnreadCount = () => {
    axios.get('/api/notifications/unread-count').then(res => setUnreadCount(res.data.count)).catch(() => {});
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggle = () => {
    if (!open) axios.get('/api/notifications').then(res => setItems(res.data)).catch(() => {});
    setOpen(o => !o);
  };

  const handleClickItem = async (item) => {
    if (!item.read) {
      await axios.put(`/api/notifications/${item.id}/read`);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, read: true } : i));
      fetchUnreadCount();
    }
    setOpen(false);
    if (item.link) navigate(item.link);
  };

  const markAllRead = async (e) => {
    e.stopPropagation();
    await axios.put('/api/notifications/read-all');
    setItems(prev => prev.map(i => ({ ...i, read: true })));
    setUnreadCount(0);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className={`relative p-2 rounded-lg transition-colors ${dark ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-xl shadow-2xl border border-gray-100 z-50 max-h-96 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800 text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline">Tout marquer comme lu</button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {items.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">Aucune notification</p>
            ) : (
              items.map(item => (
                <button
                  key={item.id}
                  onClick={() => handleClickItem(item)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${!item.read ? 'bg-blue-50/50' : ''}`}
                >
                  <p className={`text-sm ${!item.read ? 'font-medium text-gray-900' : 'text-gray-600'}`}>{item.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(item.created_at).toLocaleString('fr-FR')}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
