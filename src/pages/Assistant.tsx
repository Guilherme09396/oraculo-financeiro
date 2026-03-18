import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, Send, Mic, MicOff, User } from 'lucide-react';
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

  const saveTransactions = async (transacoes: ParsedTransaction[]) => {
    try {
      const formatted = transacoes.map(t => ({
        amount: Number(t.valor.replace(/\./g, '').replace(',', '.')),
        description: t.estabelecimento || 'Despesa OCR',
        category: t.categoria || 'Outro',
        payment_method: t.metodo || 'Outro',
        type: 'expense',
        date: new Date().toISOString(),
      }));

      const { error } = await supabase.from('transactions').insert(formatted);

      if (error) throw error;

      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['future_transactions'] });

      toast.success(`${formatted.length} transação(ões) salva(s)!`);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar transações');
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

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = () => {
      setIsRecording(false);
      toast.error('Erro no reconhecimento de voz');
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

  const classifyTransaction = (text: string): ParsedTransaction[] => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const transacoes: ParsedTransaction[] = [];

    for (const line of lines) {
      const clean = line.toLowerCase();

      if (/limite|dispon[ií]vel|saldo|fatura|empr[eé]stimo/i.test(clean)) continue;

      const valorMatch = line.match(/r\$\s?([\d.,]+)/i);
      if (!valorMatch) continue;

      const valor = valorMatch[1];

      const parcelaMatch = line.match(/(\d+)x/i);
      const parcelas = parcelaMatch
        ? [{ qtd: Number(parcelaMatch[1]), valor }]
        : undefined;

      const estabelecimento = line.replace(/r\$\s?[\d.,]+.*$/i, '').trim();

      let metodo: ParsedTransaction['metodo'] = 'Cartão';
      if (/pix|ted|transfer/i.test(clean)) metodo = 'Pix';
      else if (/debito/i.test(clean)) metodo = 'Cartão';

      let categoria: ParsedTransaction['categoria'] = 'Outro';
      if (/uber|99|trip/i.test(clean)) categoria = 'Transporte';
      else if (/drink|bar|lanchonete|restaurante/i.test(clean)) categoria = 'Alimentação';
      else if (/mercado|supermercado/i.test(clean)) categoria = 'Mercado';
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

  const handleImageUpload = async (file: File) => {
    if (!file) return;
    setIsLoading(true);

    try {
      const { data: { text } } = await Tesseract.recognize(file, 'por+eng');

      const transacoes = classifyTransaction(text);

      if (!transacoes.length) {
        toast.error('Não consegui identificar transações.');
        return;
      }

      await saveTransactions(transacoes);

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
      <Card className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i}>{msg.content}</div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 flex gap-2">
          <input type="file" onChange={e => e.target.files && handleImageUpload(e.target.files[0])} />
          <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} />
          <Button onClick={() => sendMessage(input)}>
            <Send />
          </Button>
        </div>
      </Card>
    </div>
  );
}