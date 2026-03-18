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
  categoria?: 'Alimentação' | 'Mercado' | 'Shopping' | 'Transporte' | 'Assinatura' | 'Outro';
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

      const assistantMsg: Message = {
        role: 'assistant',
        content: data.message || 'Não consegui processar.',
      };

      setMessages(prev => [...prev, assistantMsg]);

      if (data.actions?.length > 0) {
        qc.invalidateQueries({ queryKey: ['transactions'] });
        qc.invalidateQueries({ queryKey: ['future_transactions'] });

        const added = data.actions.filter((a: any) => a.type === 'transaction_added').length;
        if (added) toast.success(`${added} transação(ões) registrada(s)!`);
      }
    } catch (e: any) {
      toast.error('Erro na IA');
    } finally {
      setIsLoading(false);
    }
  };

  // 🔥 CLASSIFICAÇÃO INTELIGENTE MELHORADA
  const classifyTransaction = (text: string): ParsedTransaction => {
    const clean = text.toLowerCase();

    const valorMatch = clean.match(/r\$\s?([\d.,]+)/);
    const valor = valorMatch ? valorMatch[1] : '0';

    const parcelaRegex = /(\d+)x\s+de\s+r\$\s?([\d.,]+)/gi;
    const parcelas = Array.from(text.matchAll(parcelaRegex)).map(m => ({
      qtd: Number(m[1]),
      valor: m[2],
    }));

    // 🔥 Detectar estabelecimento
    let estabelecimento = '';
    const lines = text.split('\n');

    for (const line of lines) {
      if (
        line.match(/uber|ifood|mercado|supermercado|loja|bar|restaurante|farmacia|amazon/i)
      ) {
        estabelecimento = line.trim();
        break;
      }
    }

    // 🔥 Método inteligente
    let metodo: ParsedTransaction['metodo'] = 'Outro';

    if (/pix|transferência|ted/i.test(clean)) metodo = 'Pix';
    else if (/credito|débito|visa|master|elo/i.test(clean)) metodo = 'Cartão';
    else if (/saldo|dinheiro/i.test(clean)) metodo = 'Dinheiro';

    // 🔥 Categoria inteligente baseada em contexto real
    let categoria: ParsedTransaction['categoria'] = 'Outro';

    if (/uber|99|taxi|trip/i.test(clean)) categoria = 'Transporte';
    else if (/ifood|restaurante|lanchonete|bar|pizza|burger|drink/i.test(clean)) categoria = 'Alimentação';
    else if (/mercado|supermercado|atacad|bom frango/i.test(clean)) categoria = 'Mercado';
    else if (/amazon|shop|store|magalu|loja/i.test(clean)) categoria = 'Shopping';
    else if (/netflix|spotify|prime/i.test(clean)) categoria = 'Assinatura';

    return {
      valor,
      parcelas: parcelas.length ? parcelas : undefined,
      metodo,
      categoria,
      estabelecimento,
    };
  };

  // 🔥 OCR + Inteligência REAL
  const handleImageUpload = async (file: File) => {
    if (!file) return;
    setIsLoading(true);

    try {
      const { data: { text } } = await Tesseract.recognize(file, 'por+eng', {
        logger: m => console.log(m),
      });

      console.log('OCR TEXTO:', text);

      const parsed = classifyTransaction(text);

      let msg = `Registrei automaticamente:\n\n💰 R$ ${parsed.valor}`;

      if (parsed.estabelecimento) {
        msg += `\n🏪 ${parsed.estabelecimento}`;
      }

      if (parsed.parcelas) {
        msg += `\n💳 ${parsed.parcelas.map(p => `${p.qtd}x de R$ ${p.valor}`).join(', ')}`;
      }

      msg += `\n📂 ${parsed.categoria}`;
      msg += `\n💸 ${parsed.metodo}`;

      sendMessage(msg);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao ler imagem');
    } finally {
      setIsLoading(false);
    }
  };

  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SR) {
      toast.error('Navegador não suporta voz');
      return;
    }

    const rec = new SR();
    rec.lang = 'pt-BR';

    rec.onstart = () => setIsRecording(true);
    rec.onend = () => setIsRecording(false);

    rec.onresult = (e: any) => {
      const t = e.results[0][0].transcript;
      sendMessage(t);
    };

    rec.start();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">

      <Card className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : ''}`}>
              <div className="max-w-[70%] bg-secondary p-3 rounded-xl">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          ))}

          {isLoading && <p>Processando...</p>}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 flex gap-2">
          <input
            type="file"
            accept="image/*"
            onChange={e => e.target.files && handleImageUpload(e.target.files[0])}
          />

          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          <Button onClick={() => sendMessage(input)}>
            <Send />
          </Button>
        </div>
      </Card>
    </div>
  );
}