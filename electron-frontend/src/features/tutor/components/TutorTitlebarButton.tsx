import { MessageCircle } from 'lucide-react'

interface TutorTitlebarButtonProps {
  assistantChatEnabled: boolean
  assistantChatOpen: boolean
  onToggle: () => void
}

export function TutorTitlebarButton({ assistantChatEnabled, assistantChatOpen, onToggle }: TutorTitlebarButtonProps) {
  if (!assistantChatEnabled) return null

  return (
    <button
      type="button"
      className="window-nav-button"
      onClick={onToggle}
      aria-expanded={assistantChatOpen}
      aria-controls="assistant-chat-panel"
      aria-label={assistantChatOpen ? 'Close tutor chat' : 'Open tutor chat'}
      title={assistantChatOpen ? 'Close tutor chat' : 'Open tutor chat'}
    >
      <MessageCircle className="window-nav-icon" strokeWidth={2.2} aria-hidden="true" />
    </button>
  )
}
