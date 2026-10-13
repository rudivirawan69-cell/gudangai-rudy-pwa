import { useState } from 'react';
import {
  ArrowUp, Bot, Check, ChevronDown, Copy, FileText, LayoutDashboard,
  Menu, MoreHorizontal, Paperclip, Plus, Search, Settings, Sparkles,
  ThumbsDown, ThumbsUp, User, WandSparkles, X,
} from 'lucide-react';

const initialMessages = [
  {
    id: 1,
    role: 'assistant',
    text: 'Good morning, Rudi. I’m ready to help you think, write, and get things done.',
    time: '09:41',
  },
  {
    id: 2,
    role: 'user',
    text: 'Can you help me plan a focused workday?',
    time: '09:42',
  },
  {
    id: 3,
    role: 'assistant',
    text: 'Absolutely. Let’s make space for the work that matters most. What is the one outcome you want to have finished by the end of today?',
    time: '09:42',
  },
];

const conversations = [
  { title: 'Planning a focused workday', time: '09:42', active: true },
  { title: 'Q4 inventory analysis', time: 'Yesterday' },
  { title: 'Website launch checklist', time: 'Oct 12' },
  { title: 'Ideas for team offsite', time: 'Oct 10' },
];

function AssistantAvatar({ small = false }) {
  return (
    <div className={`assistant-avatar ${small ? 'assistant-avatar-small' : ''}`} aria-hidden="true">
      <Sparkles />
    </div>
  );
}

function Message({ message }) {
  const isUser = message.role === 'user';
  return (
    <article className={`message-row ${isUser ? 'message-row-user' : ''}`}>
      {isUser ? <div className="user-avatar" aria-hidden="true"><User /></div> : <AssistantAvatar />}
      <div className="message-content">
        <div className="message-meta"><strong>{isUser ? 'You' : 'NOVA'}</strong><span>{message.time}</span></div>
        <div className={`message-bubble ${isUser ? 'message-bubble-user' : ''}`}>{message.text}</div>
        {!isUser && (
          <div className="message-actions" aria-label="Message actions">
            <button type="button" aria-label="Copy response"><Copy /></button>
            <button type="button" aria-label="Like response"><ThumbsUp /></button>
            <button type="button" aria-label="Dislike response"><ThumbsDown /></button>
          </div>
        )}
      </div>
    </article>
  );
}

function Sidebar({ open, onClose, onNewChat }) {
  return (
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="sidebar-topline">
        <div className="brand"><div className="brand-mark"><Sparkles /></div><span>NOVA</span></div>
        <button className="icon-button sidebar-close" type="button" onClick={onClose} aria-label="Close navigation"><X /></button>
      </div>
      <button className="new-chat-button" type="button" onClick={onNewChat}><Plus /> New conversation <span>⌘ K</span></button>
      <div className="sidebar-search"><Search /><input aria-label="Search conversations" placeholder="Search conversations" /></div>
      <p className="sidebar-label">Recent</p>
      <nav className="conversation-list" aria-label="Recent conversations">
        {conversations.map((conversation) => (
          <button key={conversation.title} className={`conversation-item ${conversation.active ? 'conversation-active' : ''}`} type="button">
            <FileText /><span>{conversation.title}</span><time>{conversation.time}</time>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button className="sidebar-link" type="button"><Settings /><span>Settings</span></button>
        <div className="profile-card"><div className="profile-avatar">R</div><div><strong>Rudi Wirawan</strong><span>Personal workspace</span></div><MoreHorizontal /></div>
      </div>
    </aside>
  );
}

export default function App() {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((current) => [...current, { id: Date.now(), role: 'user', text, time: 'Now' }]);
    setDraft('');
    window.setTimeout(() => setMessages((current) => [...current, {
      id: Date.now() + 1,
      role: 'assistant',
      text: 'I’ve got it. I can help break that down into a clear next step, a practical plan, or a polished first draft. Which direction would be most useful?',
      time: 'Now',
    }]), 550);
  };

  const newChat = () => {
    setMessages([{ id: Date.now(), role: 'assistant', text: 'New conversation started. What would you like to work on?', time: 'Now' }]);
    setSidebarOpen(false);
  };

  return (
    <div className="assistant-app">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onNewChat={newChat} />
      {sidebarOpen && <button className="sidebar-backdrop" type="button" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}
      <main className="chat-shell">
        <header className="chat-header">
          <div className="header-left"><button className="icon-button menu-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu /></button><div className="mobile-brand"><div className="brand-mark"><Sparkles /></div><span>NOVA</span></div><div className="model-select"><span className="status-dot" /> Nova Pro <ChevronDown /></div></div>
          <div className="header-actions"><button className="icon-button" type="button" aria-label="Workspace overview"><LayoutDashboard /></button><button className="share-button" type="button"><Check /> Saved</button></div>
        </header>
        <section className="chat-content">
          <div className="conversation-heading"><div><p className="eyebrow">TUESDAY, OCTOBER 13</p><h1>Planning a focused workday</h1></div><button className="icon-button" type="button" aria-label="More conversation options"><MoreHorizontal /></button></div>
          <div className="message-list">{messages.map((message) => <Message key={message.id} message={message} />)}</div>
          <div className="suggestion-row"><button type="button" onClick={() => setDraft('Help me prioritize my tasks')}><WandSparkles /> Prioritize tasks</button><button type="button" onClick={() => setDraft('Turn this into a plan')}><FileText /> Make a plan</button></div>
          <div className="composer-wrap"><div className="composer"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); sendMessage(); } }} placeholder="Message NOVA..." rows="1" aria-label="Message NOVA" /><div className="composer-bottom"><button className="attach-button" type="button" aria-label="Attach a file"><Paperclip /></button><span className="composer-hint">Shift + Enter for new line</span><button className="send-button" type="button" onClick={sendMessage} disabled={!draft.trim()} aria-label="Send message"><ArrowUp /></button></div></div><p className="disclaimer">NOVA can make mistakes. Check important information.</p></div>
        </section>
      </main>
    </div>
  );
}

