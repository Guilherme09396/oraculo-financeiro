/**
 * ExpensePhotoImport.tsx
 *
 * Componente para importar despesas via foto/print de comprovantes:
 * Pix, dinheiro, débito, boleto, transferências, etc.
 *
 * COMO USAR:
 * 1. Copie este arquivo para sua pasta src/pages/
 * 2. No seu App.tsx (ou roteador), adicione a rota:
 *      import ExpensePhotoImport from "@/pages/ExpensePhotoImport";
 *      <Route path="/expense-photo-import" element={<ExpensePhotoImport />} />
 * 3. A edge function "ai-chat" já deve estar configurada (a mesma usada no InvoiceImport).
 *
 * DEPENDÊNCIAS (já usadas no InvoiceImport, sem instalar nada novo):
 *   - tesseract.js
 *   - @tanstack/react-query
 *   - sonner
 *   - shadcn/ui components
 */

import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCategories } from "@/hooks/useCategories";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
  AlertCircle,
  Trash2,
  Smartphone,
  Banknote,
  CreditCard,
  FileText,
  Image,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import Tesseract from "tesseract.js";

// ─── Mapeamento de categorias (mesmo do InvoiceImport) ────────────────────────
const CATEGORY_KEYWORD_MAP: Record<string, string[]> = {
  Alimentação: ["restaurante", "lanchonete", "padaria", "bar", "café", "food", "ifood", "delivery", "pizza", "hamburguer"],
  Mercado: ["mercado", "supermercado", "hortifruti", "atacado", "carrefour", "extra", "pão de açúcar"],
  Transporte: ["uber", "99", "taxi", "combustivel", "gasolina", "estacionamento", "pedágio", "onibus", "metro"],
  Saúde: ["farmacia", "droga", "medico", "clinica", "hospital", "plano de saude", "academia", "gym"],
  Lazer: ["cinema", "teatro", "show", "netflix", "spotify", "steam", "jogo", "entretenimento"],
  Vestuário: ["roupa", "calçado", "loja", "shopping", "zara", "renner", "riachuelo"],
  Educação: ["escola", "faculdade", "curso", "livro", "material", "udemy", "alura"],
  Moradia: ["aluguel", "condominio", "agua", "luz", "energia", "gas", "internet", "telefone"],
  Viagem: ["hotel", "airbnb", "passagem", "aeroporto", "voo", "latam", "gol"],
};

// ─── Métodos de pagamento disponíveis ────────────────────────────────────────
const PAYMENT_METHODS = [
  { value: "pix", label: "Pix", icon: <Smartphone className="w-4 h-4" /> },
  { value: "cash", label: "Dinheiro", icon: <Banknote className="w-4 h-4" /> },
  { value: "debit_card", label: "Débito", icon: <CreditCard className="w-4 h-4" /> },
  { value: "boleto", label: "Boleto", icon: <FileText className="w-4 h-4" /> },
  { value: "transfer", label: "Transferência", icon: <Smartphone className="w-4 h-4" /> },
];

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface ParsedTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  suggestedCategory: string;
  categoryId: string;
  selected: boolean;
}

// ─── Funções auxiliares ───────────────────────────────────────────────────────
function guessCategory(description: string, categories: any[]): string {
  const lower = description.toLowerCase();
  for (const [catName, keywords] of Object.entries(CATEGORY_KEYWORD_MAP)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      const found = categories.find(
        (c) => c.name.toLowerCase() === catName.toLowerCase()
      );
      if (found) return found.id;
    }
  }
  return "";
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ExpensePhotoImport() {
  const [step, setStep] = useState<"upload" | "processing" | "review" | "done">("upload");
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [dragging, setDragging] = useState(false);
  const [processingMsg, setProcessingMsg] = useState("Analisando imagem...");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const { data: categories = [] } = useCategories("expense");

  // ── OCR da imagem ─────────────────────────────────────────────────────────
  async function extractTextFromImage(file: File): Promise<string> {
    setProcessingMsg("Lendo imagem com OCR...");
    // Usa português + inglês para melhor reconhecimento de textos mistos
    const { data: { text } } = await Tesseract.recognize(file, "por+eng", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          setProcessingMsg(`OCR: ${Math.round(m.progress * 100)}%`);
        }
      },
    });
    return text;
  }

  // ── Converte imagem para base64 para enviar à IA com visão ────────────────
  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }

  // ── IA analisa texto OCR + imagem (visão) ────────────────────────────────
  async function analyzeWithAI(imageText: string, base64Image: string): Promise<ParsedTransaction[]> {
    setProcessingMsg("Consultando inteligência artificial...");

    const prompt = `Você é um assistente financeiro especialista em extrair despesas de comprovantes e extratos bancários brasileiros.

Tarefa: Analise com MÁXIMA ATENÇÃO esta imagem de comprovante/extrato e retorne APENAS um JSON válido (sem markdown, sem explicações).

O texto extraído por OCR da imagem é:
"""
${imageText.slice(0, 5000)}
"""

IMPORTANTE — Leia TAMBÉM a imagem diretamente para corrigir erros do OCR.

Estrutura JSON obrigatória:
{
  "transactions": [
    {
      "description": "nome do estabelecimento ou destinatário",
      "amount": 123.45,
      "date": "YYYY-MM-DD",
      "category": "Alimentação|Mercado|Transporte|Saúde|Lazer|Vestuário|Educação|Moradia|Viagem|Outro"
    }
  ]
}

REGRAS CRÍTICAS — siga todas sem exceção:
1. LISTE TODAS as despesas/saídas de dinheiro, sem pular nenhuma. Percorra a imagem linha a linha.
2. Inclua SOMENTE saídas de dinheiro (débitos, pagamentos, transferências enviadas). NÃO inclua: saldo, limite, entradas, depósitos recebidos, receitas, estornos a receber.
3. Valores: converta para decimal. Exemplos: "R$ 1.234,56" → 1234.56 | "18,00" → 18.00 | "6,15" → 6.15. NUNCA arredonde ou altere o valor.
4. Se o OCR leu um valor errado (ex: "6.15" vs "6,15"), prefira o valor da imagem visual.
5. Descrições: use o nome do estabelecimento ou destinatário do Pix. Nunca deixe vazio.
6. Datas: formato YYYY-MM-DD. Se não houver data, use hoje: ${todayStr()}.
7. Se houver transações "Pendente" ou "Em processamento", INCLUA com a nota "(pendente)" na descrição.
8. Se o print mostrar múltiplos dias ("Ontem", "Segunda", etc.), inclua transações de TODOS os dias.
9. Confira o total visível no extrato com a soma das transações — se divergir, revise os valores.
10. Retorne APENAS o JSON, sem nenhum texto adicional.

Data atual: ${todayStr()}`;

    try {
      // Envia texto OCR + imagem (visão) juntos para máxima precisão
      const messageContent: any[] = [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: base64Image } },
      ];

      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: {
          messages: [{ role: "user", content: messageContent }],
          mode: "expense_photo",
        },
      });

      // Fallback: se a edge function não suportar visão, tenta só com texto
      const responseText =
        (!error && (data?.message || data?.content))
          ? (data.message || data.content)
          : await fallbackTextOnly(prompt);

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("IA não retornou JSON válido");

      const parsed = JSON.parse(jsonMatch[0]);

      return (parsed.transactions || []).map((t: any, idx: number) => {
        const categoryByAIName = categories.find(
          (c: any) => c.name.toLowerCase() === (t.category || "").toLowerCase()
        );
        const categoryId =
          categoryByAIName?.id || guessCategory(t.description || "", categories);

        return {
          id: crypto.randomUUID(),
          description: t.description || `Despesa ${idx + 1}`,
          amount: Number(t.amount) || 0,
          date: t.date || todayStr(),
          suggestedCategory: t.category || "Outro",
          categoryId,
          selected: true,
        };
      });
    } catch (e: any) {
      console.error("Erro IA:", e);
      throw new Error(
        "Não consegui interpretar o comprovante. Tente uma imagem mais nítida."
      );
    }
  }

  // ── Fallback: envia só o texto caso visão não seja suportada ─────────────
  async function fallbackTextOnly(prompt: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke("ai-chat", {
      body: {
        messages: [{ role: "user", content: prompt }],
        mode: "expense_photo",
      },
    });
    if (error) throw error;
    return data?.message || data?.content || "";
  }

  // ── Processa o arquivo ────────────────────────────────────────────────────
  async function processFile(file: File) {
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      toast.error("Formato não suportado. Use JPG, PNG ou WEBP.");
      return;
    }

    // Preview da imagem
    setPreviewUrl(URL.createObjectURL(file));
    setStep("processing");

    try {
      // Roda OCR e conversão base64 em paralelo para ganhar tempo
      const [text, base64Image] = await Promise.all([
        extractTextFromImage(file),
        fileToBase64(file),
      ]);

      const result = await analyzeWithAI(text, base64Image);

      if (result.length === 0) {
        throw new Error(
          "Nenhuma despesa foi encontrada na imagem. Verifique se é um comprovante válido."
        );
      }

      setTransactions(result);
      setStep("review");
    } catch (e: any) {
      toast.error(e.message || "Erro ao processar imagem");
      setStep("upload");
    }
  }

  // ── Atualiza campo de transação ───────────────────────────────────────────
  function updateTransaction(id: string, field: keyof ParsedTransaction, value: any) {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  }

  function toggleSelect(id: string) {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, selected: !t.selected } : t))
    );
  }

  function removeTransaction(id: string) {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  // ── Salva as transações ───────────────────────────────────────────────────
  async function saveTransactions() {
    const selected = transactions.filter((t) => t.selected && t.amount > 0);
    if (selected.length === 0) {
      toast.error("Selecione ao menos uma transação para salvar.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Não autenticado");
      return;
    }

    const methodLabel =
      PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.label || paymentMethod;

    const toInsert = selected.map((t) => ({
      description: t.description,
      amount: t.amount,
      type: "expense",
      category_id: t.categoryId || null,
      date: t.date,
      payment_method: paymentMethod,
      card_id: null,
      notes: `Importado via foto (${methodLabel})`,
      receipt_url: null,
      is_third_party: false,
      third_party_name: null,
      user_id: user.id,
    }));

    const { error } = await supabase.from("transactions").insert(toInsert);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }

    qc.invalidateQueries({ queryKey: ["transactions"] });
    toast.success(`${toInsert.length} despesa(s) importada(s) com sucesso!`);
    setStep("done");
  }

  const selectedCount = transactions.filter((t) => t.selected).length;
  const selectedTotal = transactions
    .filter((t) => t.selected)
    .reduce((s, t) => s + t.amount, 0);

  // ─── TELA: CONCLUÍDO ───────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Despesas importadas!</h2>
        <p className="text-muted-foreground">
          {selectedCount} despesa(s) foram salvas com sucesso.
        </p>
        <div className="flex gap-3 justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => {
              setStep("upload");
              setTransactions([]);
              setPreviewUrl(null);
            }}
          >
            Importar outro comprovante
          </Button>
          <Button className="gradient-primary" onClick={() => window.history.back()}>
            Ir para Despesas
          </Button>
        </div>
      </div>
    );
  }

  // ─── TELA: PROCESSANDO ─────────────────────────────────────────────────────
  if (step === "processing") {
    return (
      <div className="max-w-lg mx-auto py-24 text-center space-y-6">
        {previewUrl && (
          <div className="relative mx-auto w-48 h-48 rounded-2xl overflow-hidden border border-border shadow-md">
            <img
              src={previewUrl}
              alt="Comprovante"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-white animate-spin" />
            </div>
          </div>
        )}
        {!previewUrl && (
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
        )}
        <h2 className="text-xl font-bold text-foreground">{processingMsg}</h2>
        <p className="text-muted-foreground text-sm">
          Estamos lendo e interpretando seu comprovante.
          <br />
          Isso pode levar alguns segundos.
        </p>
      </div>
    );
  }

  // ─── TELA: REVISÃO ─────────────────────────────────────────────────────────
  if (step === "review") {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              Revisão das Despesas
            </h1>
            <p className="text-muted-foreground text-sm">
              {transactions.length} item(ns) encontrado(s) no comprovante
            </p>
          </div>
          <div className="flex gap-2">
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                <Image className="w-3.5 h-3.5" /> Ver imagem
              </a>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStep("upload");
                setTransactions([]);
                setPreviewUrl(null);
              }}
            >
              ← Voltar
            </Button>
          </div>
        </div>

        {/* Método de pagamento */}
        <Card className="p-4 bg-card border-border">
          <div className="flex items-center gap-3 flex-wrap">
            <Label className="text-sm font-medium shrink-0">Método de pagamento:</Label>
            <div className="flex gap-2 flex-wrap">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setPaymentMethod(m.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    paymentMethod === m.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {m.icon}
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Sumário */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3 bg-card border-border text-center">
            <p className="text-xs text-muted-foreground">Selecionadas</p>
            <p className="text-xl font-bold text-foreground">{selectedCount}</p>
          </Card>
          <Card className="p-3 bg-card border-border text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold text-red-500">{formatCurrency(selectedTotal)}</p>
          </Card>
        </div>

        {/* Lista de transações */}
        <Card className="bg-card border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <span className="font-semibold text-sm text-foreground">
              Despesas detectadas
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() =>
                  setTransactions((prev) => prev.map((t) => ({ ...t, selected: true })))
                }
              >
                Selecionar tudo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() =>
                  setTransactions((prev) => prev.map((t) => ({ ...t, selected: false })))
                }
              >
                Desmarcar tudo
              </Button>
            </div>
          </div>

          <div className="divide-y divide-border">
            {transactions.map((t) => (
              <div
                key={t.id}
                className={`px-4 py-3 flex items-start gap-3 transition-colors ${
                  t.selected ? "bg-card" : "bg-secondary/40 opacity-60"
                }`}
              >
                {/* Checkbox */}
                <button onClick={() => toggleSelect(t.id)} className="mt-1 shrink-0">
                  {t.selected ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>

                {/* Detalhes */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <Input
                      value={t.description}
                      onChange={(e) =>
                        updateTransaction(t.id, "description", e.target.value)
                      }
                      className="bg-secondary border-border text-sm font-medium h-8 flex-1 min-w-[160px]"
                    />
                    <span className="text-red-500 font-mono font-semibold text-sm shrink-0">
                      -{formatCurrency(t.amount)}
                    </span>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {/* Valor */}
                    <div className="flex items-center gap-1">
                      <Label className="text-xs text-muted-foreground">R$</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={t.amount}
                        onChange={(e) =>
                          updateTransaction(t.id, "amount", parseFloat(e.target.value) || 0)
                        }
                        className="bg-secondary border-border text-xs h-7 w-24"
                      />
                    </div>

                    {/* Data */}
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-muted-foreground" />
                      <Input
                        type="date"
                        value={t.date}
                        onChange={(e) => updateTransaction(t.id, "date", e.target.value)}
                        className="bg-secondary border-border text-xs h-7 w-36"
                      />
                    </div>

                    {/* Categoria */}
                    <Select
                      value={t.categoryId}
                      onValueChange={(v) => updateTransaction(t.id, "categoryId", v)}
                    >
                      <SelectTrigger className="bg-secondary border-border h-7 text-xs w-40">
                        <SelectValue placeholder="Categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>Sem categoria</SelectItem>
                        {categories.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.icon} {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Badge sugestão IA */}
                    {t.suggestedCategory && (
                      <Badge
                        variant="secondary"
                        className="text-xs h-7 flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" /> {t.suggestedCategory}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Remover */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeTransaction(t.id)}
                  className="h-7 w-7 hover:text-destructive shrink-0 mt-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </Card>

        {/* Aviso */}
        <div className="flex items-start gap-2 text-sm text-muted-foreground bg-secondary rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Revise as transações antes de salvar. Você pode editar descrição, valor, data e
            categoria. Desmarque as que não quiser importar.
          </span>
        </div>

        {/* Botão salvar */}
        <Button
          className="w-full gradient-primary gap-2"
          size="lg"
          onClick={saveTransactions}
          disabled={selectedCount === 0}
        >
          <CheckCircle2 className="w-5 h-5" />
          Salvar {selectedCount} despesa(s) — {formatCurrency(selectedTotal)}
        </Button>
      </div>
    );
  }

  // ─── TELA: UPLOAD ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Smartphone className="w-6 h-6 text-primary" />
          Importar Despesas por Foto
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Envie um print ou foto de comprovante de Pix, débito, boleto ou dinheiro e a IA
          cadastrará as despesas automaticamente
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer ${
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-secondary/50"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) processFile(file);
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
        />
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Upload className="w-8 h-8 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-lg">
              Arraste seu comprovante aqui
            </p>
            <p className="text-muted-foreground text-sm mt-1">
              ou clique para selecionar uma imagem
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            {["JPG", "PNG", "WEBP"].map((ext) => (
              <Badge key={ext} variant="secondary" className="text-xs">
                {ext}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Tipos de comprovantes aceitos */}
      <Card className="p-5 bg-card border-border">
        <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <Image className="w-4 h-4 text-primary" /> Tipos de comprovantes aceitos
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            { icon: <Smartphone className="w-4 h-4" />, label: "Comprovante de Pix" },
            { icon: <CreditCard className="w-4 h-4" />, label: "Comprovante de Débito" },
            { icon: <FileText className="w-4 h-4" />, label: "Comprovante de Boleto" },
            { icon: <Banknote className="w-4 h-4" />, label: "Recibo de Dinheiro" },
            { icon: <Smartphone className="w-4 h-4" />, label: "Print de App Bancário" },
            { icon: <FileText className="w-4 h-4" />, label: "Extrato Bancário" },
          ].map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary rounded-lg px-3 py-2"
            >
              <span className="text-primary">{item.icon}</span>
              {item.label}
            </div>
          ))}
        </div>
      </Card>

      {/* Como funciona */}
      <Card className="p-5 bg-card border-border">
        <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> Como funciona
        </h3>
        <div className="space-y-3">
          {[
            { icon: "📸", text: "Você faz upload de uma foto ou print do comprovante" },
            { icon: "🔍", text: "O sistema extrai o texto da imagem via OCR" },
            { icon: "🤖", text: "A IA identifica a(s) despesa(s), valor, data e categoria" },
            { icon: "💳", text: "Você escolhe o método de pagamento (Pix, débito, boleto...)" },
            { icon: "✅", text: "Você revisa e confirma antes de salvar" },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-lg shrink-0">{item.icon}</span>
              <p className="text-sm text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}