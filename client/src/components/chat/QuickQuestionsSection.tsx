interface QuickQuestion {
  label: string;
  prompt: string;
}

interface QuickQuestionsSectionProps {
  hasMessages: boolean;
  greeting: string;
  sendPrompt: (quickPrompt?: string) => void;
  loading: boolean;
}

const quickQuestions: QuickQuestion[] = [
  {
    label: 'Returns & refunds',
    prompt: 'What is your return policy and how do I get a refund?',
  },
  {
    label: 'Change or cancel order',
    prompt: 'Can I change or cancel my order?',
  },
  {
    label: 'Shipping & delivery',
    prompt: 'How much does shipping cost and when will my order arrive?',
  },
  {
    label: 'Track my order',
    prompt: 'How do I track my order?',
  },
  {
    label: 'Payment & discounts',
    prompt:
      'Which payment methods do you accept and do you have any discount codes?',
  },
];

export const QuickQuestionsSection = ({
  hasMessages,
  greeting,
  sendPrompt,
  loading,
}: QuickQuestionsSectionProps) => {
  if (hasMessages) return null;

  return (
    <main
      id='chat-widget-main'
      aria-labelledby='chat-quick-questions-heading'
      aria-busy={loading}
      className='chat-messages flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain px-3.5 pt-4 pb-6 space-y-3 max-md:touch-pan-y scrollbar-gutter-both'
    >
      <h2 id='chat-quick-questions-heading' className='sr-only'>
        Suggested questions
      </h2>
      <div className='rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2.5 text-[13.5px] text-slate-700 leading-relaxed'>
        {greeting} Welcome to Prestige Worldwide I'm here to manage our global
        e-commerce empire (and help with your order or returns).
      </div>

      <div className='rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2.5 text-[13.5px] text-slate-700'>
        Click an option below or type your own question.
      </div>

      <div className='flex flex-col gap-2 pt-1'>
        {quickQuestions.map((q) => (
          <button
            key={q.label}
            type='button'
            onClick={() => sendPrompt(q.prompt)}
            disabled={loading}
            className='w-full rounded-full border border-slate-300 bg-white px-4 py-2.5 text-[13px] text-slate-800 hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100 transition-colors disabled:opacity-50'
          >
            {q.label}
          </button>
        ))}
      </div>
    </main>
  );
};
