/**
 * InvoiceImport.tsx
 *
 * Componente para importar fatura de cartão de crédito via PDF ou imagem.
 * A IA analisa a fatura, identifica o mês de referência (ex: vencimento 15/03 → mês fev)
 * e sugere as transações com categorias automáticas para o usuário confirmar e salvar.
 *
 * COMO USAR:
 * 1. Copie este arquivo para sua pasta src/pages/ (ou src/components/)
 * 2. No seu App.tsx (ou roteador), adicione a rota:
 *      import InvoiceImport from "@/pages/InvoiceImport";
 *      <Route path="/invoice-import" element={<InvoiceImport />} />
 * 3. Certifique-se de ter a edge function "ai-chat" no Supabase configurada para aceitar
 *    o campo `invoiceText` no body e retornar JSON estruturado (veja comentário abaixo).
 * 4. Instale o pdfjs-dist se quiser leitura de PDF via browser:
 *      npm install pdfjs-dist
 *    OU use apenas imagem (o componente já suporta os dois modos).
 *
 * EDGE FUNCTION (ai-chat) — adicione este case:
 *   Se o body contiver `invoiceText`, chame a IA pedindo para retornar JSON como:
 *   {
 *     referenceMonth: number,  // 1-12
 *     referenceYear: number,
 *     transactions: [
 *       { description: string, amount: number, date: string (YYYY-MM-DD), category: string }
 *     ]
 *   }
 */

import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCategories } from "@/hooks/useCategories";
import { useQuery } from "@tanstack/react-query";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Upload,
  FileText,
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
  CreditCard,
  Calendar,
  AlertCircle,
  Trash2,
  Download,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import Tesseract from "tesseract.js";

// ─── Mapeamento de categorias da IA → IDs do seu sistema ──────────────────────
// Ajuste as chaves conforme as categorias retornadas pela sua IA
// e os nomes conforme suas categorias cadastradas no banco.
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

interface ParsedTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  suggestedCategory: string;
  categoryId: string;
  selected: boolean;
  editing: boolean;
}

interface InvoiceResult {
  referenceMonth: number;
  referenceYear: number;
  transactions: ParsedTransaction[];
}

// ─── Funções auxiliares ────────────────────────────────────────────────────────

function inferMonthFromDueDate(dueDateStr: string): { month: number; year: number } {
  // Tenta extrair vencimento do texto da fatura
  // Formato: "15/03/2025", "15/03", "15 de março de 2025"
  const monthNames: Record<string, number> = {
    janeiro: 1, fevereiro: 2, março: 3, abril: 4, maio: 5, junho: 6,
    julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  };

  const now = new Date();
  let day = 0, month = 0, year = now.getFullYear();

  // Tenta dd/mm/yyyy ou dd/mm
  const dmyMatch = dueDateStr.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (dmyMatch) {
    day = parseInt(dmyMatch[1]);
    month = parseInt(dmyMatch[2]);
    year = dmyMatch[3] ? parseInt(dmyMatch[3]) : year;
  }

  // Tenta "15 de março de 2025"
  const ptMatch = dueDateStr.match(/(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?/i);
  if (ptMatch && !dmyMatch) {
    day = parseInt(ptMatch[1]);
    const monthName = ptMatch[2].toLowerCase();
    month = monthNames[monthName] || 0;
    year = ptMatch[3] ? parseInt(ptMatch[3]) : year;
  }

  if (!month) return { month: now.getMonth() + 1, year: now.getFullYear() };

  // Fatura refere-se ao mês anterior ao vencimento (se dia >= 10)
  const refMonth = day >= 10 ? (month === 1 ? 12 : month - 1) : month;
  const refYear = day >= 10 && month === 1 ? year - 1 : year;

  return { month: refMonth, year: refYear };
}

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

function formatRefMonth(month: number, year: number): string {
  const names = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${names[month - 1]}/${year}`;
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function InvoiceImport() {
  const [step, setStep] = useState<"upload" | "processing" | "review" | "done">("upload");
  const [invoiceResult, setInvoiceResult] = useState<InvoiceResult | null>(null);
  const [selectedCard, setSelectedCard] = useState("");
  const [dragging, setDragging] = useState(false);
  const [processingMsg, setProcessingMsg] = useState("Analisando fatura...");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const { data: categories = [] } = useCategories("expense");
  const { data: cards = [] } = useQuery({
    queryKey: ["credit_cards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_cards").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // ── Extrai texto da imagem via Tesseract ───────────────────────────────────
  async function extractTextFromImage(file: File): Promise<string> {
    setProcessingMsg("Lendo imagem com OCR...");
    const { data: { text } } = await Tesseract.recognize(file, "por", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          setProcessingMsg(`OCR: ${Math.round(m.progress * 100)}%`);
        }
      },
    });
    return text;
  }

  // ── Converte página do PDF em imagem (canvas) e aplica OCR ───────────────
  async function extractTextFromPDF(file: File): Promise<string> {
    setProcessingMsg("Carregando PDF...");

    // Carrega pdfjs via CDN para não depender de instalação local
    const PDFJS_VERSION = "3.11.174";
    if (!(window as any).pdfjsLib) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Falha ao carregar pdf.js"));
        document.head.appendChild(script);
      });
    }

    const pdfjsLib = (window as any).pdfjsLib;
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    // Primeiro tenta extrair texto nativo (PDFs digitais)
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => item.str).join(" ").trim();
      fullText += pageText + "\n";
    }

    // Se o PDF tem texto nativo suficiente, retorna direto (sem OCR)
    if (fullText.trim().length > 100) {
      setProcessingMsg("Texto extraído do PDF...");
      return fullText;
    }

    // PDF é imagem (scan) → renderiza cada página em canvas e faz OCR
    setProcessingMsg("PDF escaneado, aplicando OCR...");
    fullText = "";
    const scale = 2.0; // maior resolução = melhor OCR

    for (let i = 1; i <= pdf.numPages; i++) {
      setProcessingMsg(`OCR página ${i} de ${pdf.numPages}...`);
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;

      await page.render({ canvasContext: ctx, viewport }).promise;

      // Converte canvas em blob e passa para o Tesseract
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/png")
      );

      const { data: { text } } = await Tesseract.recognize(blob, "por", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setProcessingMsg(`OCR pág. ${i}: ${Math.round(m.progress * 100)}%`);
          }
        },
      });

      fullText += text + "\n";
    }

    return fullText;
  }

  // ── Chama a IA para interpretar o texto da fatura ─────────────────────────
  async function analyzeInvoiceWithAI(invoiceText: string): Promise<InvoiceResult | null> {
    setProcessingMsg("Consultando inteligência artificial...");

    // Prompt para a IA retornar JSON estruturado
    const prompt = `Você é um assistente financeiro. Analise o texto desta fatura de cartão de crédito e retorne APENAS um JSON válido (sem markdown, sem explicações) com a seguinte estrutura:
{
  "dueDate": "DD/MM/YYYY",
  "referenceMonth": 1-12,
  "referenceYear": 2024,
  "transactions": [
    {
      "description": "nome do estabelecimento ou descrição",
      "amount": 123.45,
      "date": "YYYY-MM-DD",
      "category": "Alimentação|Mercado|Transporte|Saúde|Lazer|Vestuário|Educação|Moradia|Viagem|Outro"
    }
  ]
}

Regras:
- O mês de referência da fatura é o mês ANTERIOR ao vencimento se o dia for >= 10. Ex: vencimento 15/03 → referenceMonth = 2 (fevereiro).
- Ignore transações de pagamento da fatura anterior, anuidade, encargos e juros.
- Para cada transação, infira a categoria baseada na descrição.
- Converta valores para número decimal (ex: "R$ 1.234,56" → 1234.56).
- A data de cada transação deve estar no formato YYYY-MM-DD. Se não houver dia, use o dia 15 do mês de referência.
- Retorne APENAS o JSON, sem nenhum texto adicional.

Texto da fatura:
${invoiceText.slice(0, 8000)}`;

    try {
      // Chama sua edge function existente
      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: {
          messages: [{ role: "user", content: prompt }],
          mode: "invoice", // flag opcional para sua edge function
        },
      });

      if (error) throw error;

      // Tenta parsear o JSON da resposta
      const responseText = data?.message || data?.content || "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("IA não retornou JSON válido");

      const parsed = JSON.parse(jsonMatch[0]);

      // Infere o mês de referência a partir do vencimento se não veio
      let { referenceMonth, referenceYear } = parsed;
      if (!referenceMonth && parsed.dueDate) {
        const inferred = inferMonthFromDueDate(parsed.dueDate);
        referenceMonth = inferred.month;
        referenceYear = inferred.year;
      }
      referenceYear = referenceYear || new Date().getFullYear();

      const transactions: ParsedTransaction[] = (parsed.transactions || []).map(
        (t: any, idx: number) => {
          // Tenta encontrar a categoria pelo nome retornado pela IA primeiro,
          // depois cai para a busca por palavras-chave na descrição
          const categoryByAIName = categories.find(
            (c: any) => c.name.toLowerCase() === (t.category || "").toLowerCase()
          );
          const categoryId = categoryByAIName?.id || guessCategory(t.description || "", categories);

          return {
            id: crypto.randomUUID(),
            description: t.description || `Transação ${idx + 1}`,
            amount: Number(t.amount) || 0,
            date: t.date || `${referenceYear}-${String(referenceMonth).padStart(2, "0")}-15`,
            suggestedCategory: t.category || "Outro",
            categoryId,
            selected: true,
            editing: false,
          };
        }
      );

      return { referenceMonth, referenceYear, transactions };
    } catch (e: any) {
      console.error("Erro IA:", e);
      throw new Error("Não consegui interpretar a fatura. Tente uma imagem mais clara.");
    }
  }

  // ── Processa o arquivo enviado ─────────────────────────────────────────────
  async function processFile(file: File) {
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      toast.error("Formato não suportado. Use JPG, PNG, WEBP ou PDF.");
      return;
    }

    setStep("processing");

    try {
      let text = "";
      if (file.type === "application/pdf") {
        text = await extractTextFromPDF(file);
      } else {
        text = await extractTextFromImage(file);
      }

      if (text.trim().length < 50) {
        throw new Error("Não foi possível extrair texto suficiente da imagem. Tente uma foto mais nítida.");
      }

      const result = await analyzeInvoiceWithAI(text);
      if (!result) throw new Error("Falha ao analisar fatura");

      setInvoiceResult(result);
      setStep("review");
    } catch (e: any) {
      toast.error(e.message || "Erro ao processar fatura");
      setStep("upload");
    }
  }

  // ── Salva as transações selecionadas ──────────────────────────────────────
  async function saveTransactions() {
    if (!invoiceResult) return;

    const selected = invoiceResult.transactions.filter((t) => t.selected && t.amount > 0);
    if (selected.length === 0) {
      toast.error("Selecione ao menos uma transação para salvar.");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Não autenticado"); return; }

    const toInsert = selected.map((t) => ({
      description: t.description,
      amount: t.amount,
      type: "expense",
      category_id: t.categoryId || null,
      date: t.date,
      payment_method: "credit_card",
      card_id: selectedCard || null,
      notes: `Importado da fatura ${formatRefMonth(invoiceResult.referenceMonth, invoiceResult.referenceYear)}`,
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
    toast.success(`${toInsert.length} transação(ões) importada(s) com sucesso!`);
    setStep("done");
  }

  // ── Print / Export PDF da fatura revisada ────────────────────────────────
  function handlePrint() {
    window.print();
  }

  // ── Atualiza campo de transação ───────────────────────────────────────────
  function updateTransaction(id: string, field: keyof ParsedTransaction, value: any) {
    setInvoiceResult((prev) =>
      prev
        ? {
            ...prev,
            transactions: prev.transactions.map((t) =>
              t.id === id ? { ...t, [field]: value } : t
            ),
          }
        : prev
    );
  }

  function toggleSelect(id: string) {
    updateTransaction(id, "selected", !invoiceResult?.transactions.find((t) => t.id === id)?.selected);
  }

  function removeTransaction(id: string) {
    setInvoiceResult((prev) =>
      prev ? { ...prev, transactions: prev.transactions.filter((t) => t.id !== id) } : prev
    );
  }

  const selectedCount = invoiceResult?.transactions.filter((t) => t.selected).length || 0;
  const selectedTotal = invoiceResult?.transactions
    .filter((t) => t.selected)
    .reduce((s, t) => s + t.amount, 0) || 0;

  // ─── RENDER ────────────────────────────────────────────────────────────────

  if (step === "done") {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Fatura importada!</h2>
        <p className="text-muted-foreground">
          {selectedCount} transação(ões) foram salvas em Despesas.
        </p>
        <div className="flex gap-3 justify-center pt-4">
          <Button variant="outline" onClick={() => { setStep("upload"); setInvoiceResult(null); }}>
            Importar outra fatura
          </Button>
          <Button className="gradient-primary" onClick={() => window.history.back()}>
            Ir para Despesas
          </Button>
        </div>
      </div>
    );
  }

  if (step === "processing") {
    return (
      <div className="max-w-lg mx-auto py-24 text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-foreground">{processingMsg}</h2>
        <p className="text-muted-foreground text-sm">
          Estamos analisando sua fatura com inteligência artificial.<br />Isso pode levar alguns segundos.
        </p>
      </div>
    );
  }

  if (step === "review" && invoiceResult) {
    return (
      <div className="space-y-6 print:space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              Revisão da Fatura
            </h1>
            <p className="text-muted-foreground text-sm">
              Fatura de{" "}
              <span className="font-semibold text-foreground">
                {formatRefMonth(invoiceResult.referenceMonth, invoiceResult.referenceYear)}
              </span>{" "}
              · {invoiceResult.transactions.length} item(ns) encontrados
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
              <Printer className="w-4 h-4" /> Imprimir
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setStep("upload"); setInvoiceResult(null); }}
            >
              ← Voltar
            </Button>
          </div>
        </div>

        {/* Cartão seletor */}
        {cards && cards.length > 0 && (
          <Card className="p-4 bg-card border-border print:hidden">
            <div className="flex items-center gap-3 flex-wrap">
              <CreditCard className="w-5 h-5 text-muted-foreground" />
              <Label className="text-sm font-medium">Vincular ao cartão:</Label>
              <Select value={selectedCard} onValueChange={setSelectedCard}>
                <SelectTrigger className="w-48 bg-secondary border-border">
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Nenhum</SelectItem>
                  {cards.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      💳 {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>
        )}

        {/* Sumário */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 bg-card border-border text-center">
            <p className="text-xs text-muted-foreground">Selecionadas</p>
            <p className="text-xl font-bold text-foreground">{selectedCount}</p>
          </Card>
          <Card className="p-3 bg-card border-border text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold text-expense">{formatCurrency(selectedTotal)}</p>
          </Card>
          <Card className="p-3 bg-card border-border text-center">
            <p className="text-xs text-muted-foreground">Mês Ref.</p>
            <p className="text-xl font-bold text-foreground">
              {formatRefMonth(invoiceResult.referenceMonth, invoiceResult.referenceYear)}
            </p>
          </Card>
        </div>

        {/* Lista de transações */}
        <Card className="bg-card border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <span className="font-semibold text-sm text-foreground">Transações detectadas</span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() =>
                  setInvoiceResult((prev) =>
                    prev
                      ? { ...prev, transactions: prev.transactions.map((t) => ({ ...t, selected: true })) }
                      : prev
                  )
                }
              >
                Selecionar tudo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() =>
                  setInvoiceResult((prev) =>
                    prev
                      ? { ...prev, transactions: prev.transactions.map((t) => ({ ...t, selected: false })) }
                      : prev
                  )
                }
              >
                Desmarcar tudo
              </Button>
            </div>
          </div>

          <div className="divide-y divide-border">
            {invoiceResult.transactions.map((t) => (
              <div
                key={t.id}
                className={`px-4 py-3 flex items-start gap-3 transition-colors ${
                  t.selected ? "bg-card" : "bg-secondary/40 opacity-60"
                }`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleSelect(t.id)}
                  className="mt-1 shrink-0"
                >
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
                      onChange={(e) => updateTransaction(t.id, "description", e.target.value)}
                      className="bg-secondary border-border text-sm font-medium h-8 flex-1 min-w-[160px]"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-expense font-mono font-semibold text-sm">
                        -{formatCurrency(t.amount)}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {/* Valor */}
                    <div className="flex items-center gap-1">
                      <Label className="text-xs text-muted-foreground">R$</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={t.amount}
                        onChange={(e) => updateTransaction(t.id, "amount", parseFloat(e.target.value) || 0)}
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
                      <Badge variant="secondary" className="text-xs h-7 flex items-center gap-1">
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
                  className="h-7 w-7 hover:text-destructive shrink-0 mt-1 print:hidden"
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
            Revise as transações antes de salvar. Você pode editar descrição, valor, data e categoria.
            Desmarque as que não quiser importar.
          </span>
        </div>

        {/* Botão salvar */}
        <Button
          className="w-full gradient-primary gap-2 print:hidden"
          size="lg"
          onClick={saveTransactions}
          disabled={selectedCount === 0}
        >
          <CheckCircle2 className="w-5 h-5" />
          Salvar {selectedCount} transação(ões) — {formatCurrency(selectedTotal)}
        </Button>
      </div>
    );
  }

  // ── Upload step ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-primary" />
          Importar Fatura
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Envie um print ou PDF da sua fatura e a IA cadastrará todas as despesas automaticamente
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer ${
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-secondary/50"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
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
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
        />
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Upload className="w-8 h-8 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-lg">
              Arraste sua fatura aqui
            </p>
            <p className="text-muted-foreground text-sm mt-1">
              ou clique para selecionar um arquivo
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            {["JPG", "PNG", "WEBP", "PDF"].map((ext) => (
              <Badge key={ext} variant="secondary" className="text-xs">
                {ext}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Como funciona */}
      <Card className="p-5 bg-card border-border">
        <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> Como funciona
        </h3>
        <div className="space-y-3">
          {[
            { icon: "📤", text: "Você faz upload de um print ou PDF da sua fatura de cartão" },
            { icon: "🔍", text: "O sistema extrai o texto via OCR (imagens) ou leitura direta (PDF)" },
            { icon: "🤖", text: "A IA identifica cada compra, o valor, a data e infere a categoria" },
            { icon: "📅", text: "O mês de referência é calculado automaticamente pelo vencimento (ex: vcto 15/03 → fev)" },
            { icon: "✅", text: "Você revisa, edita e confirma as transações antes de salvar" },
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