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

interface ParsedTransaction {
  valor: string;
  estabelecimento?: string;
  parcelas?: { qtd: number; valor: string }[];
  metodo?: 'Pix' | 'Cartão' | 'Dinheiro' | 'Outro';
  categoria?: 'Alimentação' | 'Mercado' | 'Shopping' | 'Transporte' | 'Outro';
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

      const assistantMsg: Message = {
        role: 'assistant',
        content: data.message || 'Desculpe, não consegui processar sua mensagem.'
      };

      setMessages(prev => [...prev, assistantMsg]);

      if (data.actions?.length > 0) {
        qc.invalidateQueries({ queryKey: ['transactions'] });
        qc.invalidateQueries({ queryKey: ['future_transactions'] });
        const addedCount = data.actions.filter((a: any) => a.type === 'transaction_added').length;
        if (addedCount > 0) toast.success(`${addedCount} transação(ões) registrada(s)!`);
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

  const suggestions = [
    'Para onde está indo meu dinheiro?',
    'Como posso economizar este mês?',
    'Quais foram meus maiores gastos?',
    'Gastei R$ 25,00 com almoço hoje',
    'Resumo financeiro do mês',
  ];

  // 🔥 CLASSIFICAÇÃO MUITO MAIS INTELIGENTE
  const classifyTransaction = (text: string): ParsedTransaction[] => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    const transacoes: ParsedTransaction[] = [];

    for (const line of lines) {
      const clean = line.toLowerCase();

      // ❌ ignorar linhas que não são gastos reais
      if (/limite|dispon[ií]vel|saldo|fatura|empr[eé]stimo/i.test(clean)) continue;

      const valorMatch = line.match(/r\$\s?([\d.,]+)/i);
      if (!valorMatch) continue;

      const valor = valorMatch[1];

      // detectar parcelas
      const parcelaMatch = line.match(/(\d+)x/i);
      const parcelas = parcelaMatch
        ? [{ qtd: Number(parcelaMatch[1]), valor }]
        : undefined;

      // detectar estabelecimento
      const estabelecimento = line.replace(/r\$\s?[\d.,]+.*$/i, '').trim();

      // método (melhorado)
      let metodo: ParsedTransaction['metodo'] = 'Cartão'; // default para prints assim

      if (/pix|ted|transfer/i.test(clean)) metodo = 'Pix';
      else if (/debito/i.test(clean)) metodo = 'Cartão';

      // categoria inteligente
      let categoria: ParsedTransaction['categoria'] = 'Outro';

      if (/uber|99|trip/i.test(clean)) categoria = 'Transporte';
      else if (/drink|bar|lanchonete|restaurante/i.test(clean)) categoria = 'Alimentação';
      else if (/mercado|supermercado|sao luiz/i.test(clean)) categoria = 'Mercado';
      else if (/shop|loja/i.test(clean)) categoria = 'Shopping';

      transacoes.push({
        valor,
        parcelas,
        metodo,
        categoria,
        estabelecimento,
      });
    }

    return transacoes;
  };

  // 🔥 OCR + inteligência melhorada (sem quebrar fluxo)
  const handleImageUpload = async (file: File) => {
    if (!file) return;
    setIsLoading(true);

    try {
      const { data: { text } } = await Tesseract.recognize(file, 'por+eng', {
        logger: m => console.log(m),
      });

      const transacoes = classifyTransaction(text);

      if (!transacoes.length) {
        toast.error('Não consegui identificar transações.');
        setIsLoading(false);
        return;
      }

      let msg = `Detectei ${transacoes.length} transação(ões):\n\n`;

      transacoes.forEach((t, i) => {
        msg += `#${i + 1} 💰 R$ ${t.valor}`;
        if (t.estabelecimento) msg += `\n🏪 ${t.estabelecimento}`;
        if (t.parcelas) msg += `\n💳 ${t.parcelas[0].qtd}x`;
        msg += `\n📂 ${t.categoria} | 💸 ${t.metodo}\n\n`;
      });

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

      <Card className="flex-1 bg-card border-border overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-primary-foreground" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Olá! Sou seu assistente financeiro</h2>
              <p className="text-muted-foreground text-sm max-w-md mb-6">
                Posso analisar seus gastos, dar conselhos e até registrar despesas por você.
              </p>

              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => sendMessage(s)}
                    className="px-3 py-2 rounded-lg bg-secondary text-sm border border-border">
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
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-foreground'
              }`}>
                {msg.role === 'assistant'
                  ? <ReactMarkdown>{msg.content}</ReactMarkdown>
                  : <p>{msg.content}</p>}
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}

          {isLoading && <p>Processando...</p>}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-border p-4">
          <div className="flex gap-2 items-center">

            <Button onClick={startVoice} size="icon">
              {isRecording ? <MicOff /> : <Mic />}
            </Button>

            <input type="file" accept="image/*" onChange={e => e.target.files && handleImageUpload(e.target.files[0])} className="hidden" id="upload-photo" />
            <label htmlFor="upload-photo">📷</label>

            <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} />

            <Button onClick={() => sendMessage(input)}>
              <Send />
            </Button>

          </div>
        </div>
      </Card>
    </div>
  );
}