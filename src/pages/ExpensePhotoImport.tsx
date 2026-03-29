/**
 * ExpensePhotoImport - Importar despesas via foto/print de comprovantes.
 * Versão com responsividade mobile aprimorada.
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

// ─── Mapeamento de categorias ─────────────────────────────────────────────────
const CATEGORY_KEYWORD_MAP = {
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

// ─── Métodos de pagamento ────────────────────────────────────────────────────
const PAYMENT_METHODS = [
  { value: "pix", label: "Pix", icon: <Smartphone className="w-4 h-4" /> },
  { value: "cash", label: "Dinheiro", icon: <Banknote className="w-4 h-4" /> },
  { value: "debit_card", label: "Débito", icon: <CreditCard className="w-4 h-4" /> },
  { value: "boleto", label: "Boleto", icon: <FileText className="w-4 h-4" /> },
  { value: "transfer", label: "Transf.", icon: <Smartphone className="w-4 h-4" /> },
];

// ─── Funções auxiliares ───────────────────────────────────────────────────────
function guessCategory(description, categories) {
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

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ExpensePhotoImport() {
  const [step, setStep] = useState("upload");
  const [transactions, setTransactions] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [dragging, setDragging] = useState(false);
  const [processingMsg, setProcessingMsg] = useState("Analisando imagem...");
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);
  const qc = useQueryClient();

  const { data: categories = [] } = useCategories("expense");

  async function extractTextFromImage(file) {
    setProcessingMsg("Lendo imagem com OCR...");
    const { data: { text } } = await Tesseract.recognize(file, "por+eng", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          setProcessingMsg(`OCR: ${Math.round(m.progress * 100)}%`);
        }
      },
    });
    return text;
  }

  async function fileToBase64(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  async function analyzeWithAI(imageText, base64Image) {
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
      const messageContent = [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: base64Image } },
      ];

      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: {
          messages: [{ role: "user", content: messageContent }],
          mode: "expense_photo",
        },
      });

      const responseText =
        (!error && (data?.message || data?.content))
          ? (data.message || data.content)
          : await fallbackTextOnly(prompt);

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("IA não retornou JSON válido");

      const parsed = JSON.parse(jsonMatch[0]);

      return (parsed.transactions || []).map((t, idx) => {
        const categoryByAIName = categories.find(
          (c) => c.name.toLowerCase() === (t.category || "").toLowerCase()
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
    } catch (e) {
      console.error("Erro IA:", e);
      throw new Error(
        "Não consegui interpretar o comprovante. Tente uma imagem mais nítida."
      );
    }
  }

  async function fallbackTextOnly(prompt) {
    const { data, error } = await supabase.functions.invoke("ai-chat", {
      body: {
        messages: [{ role: "user", content: prompt }],
        mode: "expense_photo",
      },
    });
    if (error) throw error;
    return data?.message || data?.content || "";
  }

  async function processFile(file) {
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      toast.error("Formato não suportado. Use JPG, PNG ou WEBP.");
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    setStep("processing");

    try {
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
    } catch (e) {
      toast.error(e.message || "Erro ao processar imagem");
      setStep("upload");
    }
  }

  function updateTransaction(id, field, value) {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  }

  function toggleSelect(id) {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, selected: !t.selected } : t))
    );
  }

  function removeTransaction(id) {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

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
      <div className="max-w-lg mx-auto px-4 py-12 sm:py-16 text-center space-y-4">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10 text-green-500" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">Despesas importadas!</h2>
        <p className="text-muted-foreground text-sm">
          {selectedCount} despesa(s) foram salvas com sucesso.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
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
      <div className="max-w-lg mx-auto px-4 py-16 sm:py-24 text-center space-y-6">
        {previewUrl && (
          <div className="relative mx-auto w-36 h-36 sm:w-48 sm:h-48 rounded-2xl overflow-hidden border border-border shadow-md">
            <img
              src={previewUrl}
              alt="Comprovante"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 text-white animate-spin" />
            </div>
          </div>
        )}
        {!previewUrl && (
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 text-primary animate-spin" />
          </div>
        )}
        <h2 className="text-lg sm:text-xl font-bold text-foreground">{processingMsg}</h2>
        <p className="text-muted-foreground text-sm px-4">
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
      <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
              <span className="truncate">Revisão das Despesas</span>
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
              {transactions.length} item(ns) encontrado(s) no comprovante
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
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
              className="text-xs sm:text-sm"
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
        <Card className="p-3 sm:p-4 bg-card border-border">
          <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-3">
            <Label className="text-xs sm:text-sm font-medium shrink-0">Método de pagamento:</Label>
            <div className="flex gap-1.5 sm:gap-2 flex-wrap">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setPaymentMethod(m.value)}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium border transition-colors touch-manipulation ${
                    paymentMethod === m.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {m.icon}
                  <span className="hidden xs:inline sm:inline">{m.label}</span>
                  <span className="xs:hidden sm:hidden">{m.label.slice(0, 3)}</span>
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Sumário */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <Card className="p-2.5 sm:p-3 bg-card border-border text-center">
            <p className="text-[10px] sm:text-xs text-muted-foreground">Selecionadas</p>
            <p className="text-base sm:text-xl font-bold text-foreground">{selectedCount}</p>
          </Card>
          <Card className="p-2.5 sm:p-3 bg-card border-border text-center">
            <p className="text-[10px] sm:text-xs text-muted-foreground">Total</p>
            <p className="text-sm sm:text-xl font-bold text-red-500 truncate">{formatCurrency(selectedTotal)}</p>
          </Card>
        </div>

        {/* Lista de transações */}
        <Card className="bg-card border-border overflow-hidden">
          <div className="px-3 sm:px-5 py-2.5 sm:py-3 border-b border-border flex items-center justify-between gap-2">
            <span className="font-semibold text-xs sm:text-sm text-foreground whitespace-nowrap">
              Despesas detectadas
            </span>
            <div className="flex gap-1 sm:gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-[10px] sm:text-xs h-7 px-2"
                onClick={() =>
                  setTransactions((prev) => prev.map((t) => ({ ...t, selected: true })))
                }
              >
                Selecionar tudo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-[10px] sm:text-xs h-7 px-2"
                onClick={() =>
                  setTransactions((prev) => prev.map((t) => ({ ...t, selected: false })))
                }
              >
                Desmarcar
              </Button>
            </div>
          </div>

          <div className="divide-y divide-border">
            {transactions.map((t) => (
              <div
                key={t.id}
                className={`px-3 sm:px-4 py-3 transition-colors ${
                  t.selected ? "bg-card" : "bg-secondary/40 opacity-60"
                }`}
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  {/* Checkbox */}
                  <button onClick={() => toggleSelect(t.id)} className="mt-1 shrink-0 touch-manipulation">
                    {t.selected ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>

                  {/* Detalhes */}
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Linha 1: Descrição + Valor */}
                    <div className="flex items-start justify-between gap-2">
                      <Input
                        value={t.description}
                        onChange={(e) =>
                          updateTransaction(t.id, "description", e.target.value)
                        }
                        className="bg-secondary border-border text-xs sm:text-sm font-medium h-8 flex-1 min-w-0"
                      />
                      <span className="text-red-500 font-mono font-semibold text-xs sm:text-sm shrink-0 mt-1.5">
                        -{formatCurrency(t.amount)}
                      </span>
                    </div>

                    {/* Linha 2: Campos de edição - grid responsivo */}
                    <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 sm:flex-wrap">
                      {/* Valor */}
                      <div className="flex items-center gap-1">
                        <Label className="text-[10px] sm:text-xs text-muted-foreground">R$</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={t.amount}
                          onChange={(e) =>
                            updateTransaction(t.id, "amount", parseFloat(e.target.value) || 0)
                          }
                          className="bg-secondary border-border text-xs h-7 w-full sm:w-24"
                        />
                      </div>

                      {/* Data */}
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                        <Input
                          type="date"
                          value={t.date}
                          onChange={(e) => updateTransaction(t.id, "date", e.target.value)}
                          className="bg-secondary border-border text-xs h-7 w-full sm:w-36"
                        />
                      </div>

                      {/* Categoria */}
                      <div className="col-span-2 sm:col-span-1">
                        <Select
                          value={t.categoryId}
                          onValueChange={(v) => updateTransaction(t.id, "categoryId", v)}
                        >
                          <SelectTrigger className="bg-secondary border-border h-7 text-xs w-full sm:w-40">
                            <SelectValue placeholder="Categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={null}>Sem categoria</SelectItem>
                            {categories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.icon} {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Badge sugestão IA */}
                      {t.suggestedCategory && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] sm:text-xs h-7 flex items-center gap-1 w-fit"
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
                    className="h-7 w-7 hover:text-destructive shrink-0 mt-1 touch-manipulation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Aviso */}
        <div className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground bg-secondary rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Revise as transações antes de salvar. Você pode editar descrição, valor, data e
            categoria. Desmarque as que não quiser importar.
          </span>
        </div>

        {/* Botão salvar */}
        <Button
          className="w-full gradient-primary gap-2 text-sm sm:text-base"
          size="lg"
          onClick={saveTransactions}
          disabled={selectedCount === 0}
        >
          <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
          Salvar {selectedCount} despesa(s) — {formatCurrency(selectedTotal)}
        </Button>
      </div>
    );
  }

  // ─── TELA: UPLOAD ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 sm:space-y-6 max-w-2xl mx-auto px-2 sm:px-0">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
          <Smartphone className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
          Importar Despesas por Foto
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1">
          Envie um print ou foto de comprovante de Pix, débito, boleto ou dinheiro e a IA
          cadastrará as despesas automaticamente
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-colors cursor-pointer ${
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-secondary/50 active:bg-secondary/50"
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
        <div className="flex flex-col items-center gap-3 sm:gap-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Upload className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-base sm:text-lg">
              Arraste seu comprovante aqui
            </p>
            <p className="text-muted-foreground text-xs sm:text-sm mt-1">
              ou toque para selecionar uma imagem
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
      <Card className="p-4 sm:p-5 bg-card border-border">
        <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2 text-sm sm:text-base">
          <Image className="w-4 h-4 text-primary" /> Tipos de comprovantes aceitos
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: <Smartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />, label: "Comprovante de Pix" },
            { icon: <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4" />, label: "Comprovante de Débito" },
            { icon: <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />, label: "Comprovante de Boleto" },
            { icon: <Banknote className="w-3.5 h-3.5 sm:w-4 sm:h-4" />, label: "Recibo de Dinheiro" },
            { icon: <Smartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />, label: "Print de App Bancário" },
            { icon: <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />, label: "Extrato Bancário" },
          ].map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground bg-secondary rounded-lg px-2.5 sm:px-3 py-2"
            >
              <span className="text-primary shrink-0">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Como funciona */}
      <Card className="p-4 sm:p-5 bg-card border-border">
        <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2 text-sm sm:text-base">
          <Sparkles className="w-4 h-4 text-primary" /> Como funciona
        </h3>
        <div className="space-y-2.5 sm:space-y-3">
          {[
            { icon: "📸", text: "Você faz upload de uma foto ou print do comprovante" },
            { icon: "🔍", text: "O sistema extrai o texto da imagem via OCR" },
            { icon: "🤖", text: "A IA identifica a(s) despesa(s), valor, data e categoria" },
            { icon: "💳", text: "Você escolhe o método de pagamento (Pix, débito, boleto...)" },
            { icon: "✅", text: "Você revisa e confirma antes de salvar" },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2.5 sm:gap-3">
              <span className="text-base sm:text-lg shrink-0">{item.icon}</span>
              <p className="text-xs sm:text-sm text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}