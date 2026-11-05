import { ArrowRight, Bot, Sparkles } from 'lucide-react';

export default function HomeAgentAssistant({ onNavigate }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate?.('ai')}
      className="home-agent-card group w-full text-left"
      aria-label="Buka Agent Rubee Intelligence"
    >
      <span className="home-agent-icon"><Bot className="h-6 w-6" /></span>
      <span className="min-w-0 flex-1 text-left">
        <span className="home-agent-title">Agent Rubee Intelligence <Sparkles className="inline h-4 w-4 ml-1" /></span>
        <span className="home-agent-copy">Asisten operasional · Cloudflare Workers AI</span>
      </span>
      <span className="home-agent-action">Buka <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
    </button>
  );
}
