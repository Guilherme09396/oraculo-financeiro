import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, Send, Mic, MicOff, Zap, User } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import Tesseract from 'tesseract.js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function Assistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Envia mensagem para o backend / IA
  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: { messages: newMessages },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        setIsLoading(false);
        return;
      }

      const assistantMsg: Message = { role: 'assistant', content: data.message || 'Desculpe, não consegui processar sua mensagem.' };
      setMessages(prev => [...prev, assistantMsg]);

      // Atualiza transações se IA executou ações
      if (data.actions?.length > 0) {
        qc.invalidateQueries({ queryKey: ['transactions'] });
        qc.invalidateQueries({ queryKey: ['future_transactions'] });
        const addedCount = data.actions.filter((a: any) => a.type === 'transaction_added').length;
        if (addedCount > 0) {
          toast.success(`${addedCount} transação(ões) registrada(s)!`);
        }
      }
    } catch (e: any) {
      console.error('AI error:', e);
      const errorMsg = e?.message || 'Erro ao comunicar com a IA';
      toast.error(errorMsg);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Desculpe, ocorreu um erro. Tente novamente.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Reconhecimento de voz
  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error('Seu navegador não suporta reconhecimento de voz. Use Chrome ou Edge.');
      return;
    }

    const recognition = new SR();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = (e: any) => {
      setIsRecording(false);
      if (e.error !== 'aborted') toast.error('Erro no reconhecimento de voz');
    };
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      if (transcript) sendMessage(transcript);
    };

    recognition.start();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Sugestões iniciais
  const suggestions = [
    'Para onde está indo meu dinheiro?',
    'Como posso economizar este mês?',
    'Quais foram meus maiores gastos?',
    'Gastei R$ 25,00 com almoço hoje',
    'Resumo financeiro do mês',
  ];

  // Função de OCR para processar fotos
  const handleImageUpload = async (file: File) => {
    if (!file) return;
    setIsLoading(true);

    try {
      const { data: { text } } = await Tesseract.recognize(file, 'por', {
        logger: m => console.log(m),
      });

      // Regex para valores e parcelas
      const valorRegex = /R\$\s?([\d.,]+)/g;
      const parcelaRegex = /(\d+)x\s+de\s+R\$\s?([\d.,]+)/gi;

      const valores = Array.from(text.matchAll(valorRegex)).map(m => m[1]);
      const parcelas = Array.from(text.matchAll(parcelaRegex)).map(m => ({
        qtd: Number(m[1]),
        valor: m[2],
      }));

      let msg = `Detectei os seguintes valores na imagem: ${valores.join(', ')}`;
      if (parcelas.length > 0) {
        msg += `. Parcelas detectadas: ${parcelas.map(p => `${p.qtd}x de R$ ${p.valor}`).join('; ')}`;
      }

      sendMessage(msg);
    } catch (e) {
      console.error('Erro OCR:', e);
      toast.error('Não consegui processar a imagem.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Assistente IA</h1>
        <p className="text-muted-foreground">Seu conselheiro financeiro inteligente</p>
      </div>

      {/* Messages */}
      <Card className="flex-1 bg-card border-border overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-primary-foreground" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Olá! Sou seu assistente financeiro</h2>
              <p className="text-muted-foreground text-sm max-w-md mb-6">
                Posso analisar seus gastos, dar conselhos e até registrar despesas por você. Tente perguntar algo!
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => sendMessage(s)}
                    className="px-3 py-2 rounded-lg bg-secondary text-sm text-foreground hover:bg-accent transition-colors border border-border">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-md'
                  : 'bg-secondary text-foreground rounded-bl-md'
              }`}>
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm prose-invert max-w-none [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>h1]:text-lg [&>h2]:text-base [&>h3]:text-sm">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-1">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="bg-secondary rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="icon"
              onClick={startVoice} disabled={isRecording}
              className={`shrink-0 ${isRecording ? 'bg-expense/20 border-expense text-expense' : ''}`}
              title="Gravar áudio">
              {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>

            {/* Botão de envio de foto */}
            <input
              type="file"
              accept="image/*"
              onChange={e => e.target.files && handleImageUpload(e.target.files[0])}
              className="hidden"
              id="upload-photo"
            />
            <label htmlFor="upload-photo" className="px-3 py-2 rounded-lg bg-secondary cursor-pointer border border-border text-sm flex items-center justify-center">
              📷 Foto
            </label>

            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRecording ? 'Ouvindo...' : 'Digite sua mensagem...'}
              className="bg-secondary border-border"
              disabled={isLoading || isRecording}
            />
            <Button onClick={() => sendMessage(input)} disabled={!input.trim() || isLoading}
              className="gradient-primary shrink-0" size="icon">
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-2">
            <Zap className="w-3 h-3" /> Powered by Lovable AI
          </div>
        </div>
      </Card>
    </div>
  );
}