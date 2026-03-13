import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Fetch all relevant data
    const [{ data: transactions }, { data: futureTransactions }, { data: categories }, { data: profile }, { data: cards }, { data: goals }] = await Promise.all([
      supabase.from("transactions").select("description, amount, type, date, payment_method, card_id, categories(name)").order("date", { ascending: false }).limit(100),
      supabase.from("future_transactions").select("description, amount, type, due_date, status, paid_at, is_recurring, is_installment, current_installment, total_installments, categories(name)").order("due_date", { ascending: false }).limit(100),
      supabase.from("categories").select("id, name, type"),
      supabase.from("profiles").select("display_name").eq("user_id", user.id).single(),
      supabase.from("credit_cards").select("id, name, card_limit, closing_day, due_day, color"),
      supabase.from("goals").select("title, target_amount, current_amount, deadline, icon"),
    ]);

    const now = new Date();
    const ms = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const me = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`;
    const mt = (transactions || []).filter((t: any) => t.date >= ms && t.date <= me);
    const inc = mt.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const expNonCard = mt.filter((t: any) => t.type === "expense" && t.payment_method !== "credit_card").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const expCard = mt.filter((t: any) => t.type === "expense" && t.payment_method === "credit_card").reduce((s: number, t: any) => s + Number(t.amount), 0);

    // Future transactions paid this month
    const paidThisMonth = (futureTransactions || []).filter((f: any) => f.status === "paid" && f.paid_at && f.paid_at >= ms && f.paid_at <= me);
    const futExpPaid = paidThisMonth.filter((f: any) => f.type === "expense").reduce((s: number, f: any) => s + Number(f.amount), 0);
    const futIncPaid = paidThisMonth.filter((f: any) => f.type === "income").reduce((s: number, f: any) => s + Number(f.amount), 0);

    const totalIncome = inc + futIncPaid;
    const totalExpense = expNonCard + futExpPaid;

    // Pending future transactions
    const pendingFuture = (futureTransactions || []).filter((f: any) => f.status === "pending");
    const pendingThisMonth = pendingFuture.filter((f: any) => f.due_date >= ms && f.due_date <= me);

    // Card spending per card
    const cardSpendingMap: Record<string, number> = {};
    mt.filter((t: any) => t.payment_method === "credit_card" && t.card_id).forEach((t: any) => {
      cardSpendingMap[t.card_id] = (cardSpendingMap[t.card_id] || 0) + Number(t.amount);
    });

    const cardsInfo = (cards || []).map((c: any) => {
      const spent = cardSpendingMap[c.id] || 0;
      const available = Math.max(0, Number(c.card_limit) - spent);
      return `${c.name}: limite R$ ${Number(c.card_limit).toFixed(2)}, gasto R$ ${spent.toFixed(2)}, disponível R$ ${available.toFixed(2)}, fecha dia ${c.closing_day}, vence dia ${c.due_day}`;
    }).join("\n");

    const goalsInfo = (goals || []).map((g: any) => {
      const pct = Number(g.target_amount) > 0 ? (Number(g.current_amount) / Number(g.target_amount) * 100).toFixed(0) : "0";
      return `${g.icon || "🎯"} ${g.title}: R$ ${Number(g.current_amount).toFixed(2)} / R$ ${Number(g.target_amount).toFixed(2)} (${pct}%)${g.deadline ? ` - prazo: ${g.deadline}` : ""}`;
    }).join("\n");

    const systemPrompt = `Você é o assistente financeiro inteligente do GranaIA. Nome do usuário: ${profile?.display_name || "Usuário"}.

CONTEXTO FINANCEIRO (MÊS ATUAL - ${now.toLocaleString("pt-BR", { month: "long", year: "numeric" })}):
- Receitas (não-cartão): R$ ${inc.toFixed(2)}
- Despesas (não-cartão): R$ ${expNonCard.toFixed(2)}
- Gastos em cartão de crédito: R$ ${expCard.toFixed(2)} (não impactam saldo até pagamento da fatura)
- Contas futuras pagas no mês: despesas R$ ${futExpPaid.toFixed(2)}, receitas R$ ${futIncPaid.toFixed(2)}
- Total receitas efetivas: R$ ${totalIncome.toFixed(2)}
- Total despesas efetivas: R$ ${totalExpense.toFixed(2)}
- Saldo do mês: R$ ${(totalIncome - totalExpense).toFixed(2)}

CARTÕES DE CRÉDITO:
${cardsInfo || "Nenhum cartão cadastrado"}

LANÇAMENTOS FUTUROS PENDENTES (ESTE MÊS):
${pendingThisMonth.slice(0, 15).map((f: any) => `${f.due_date}: R$ ${Number(f.amount).toFixed(2)} - ${f.description} (${f.type === "income" ? "a receber" : "a pagar"})${f.is_installment ? ` [parcela ${f.current_installment}/${f.total_installments}]` : ""}${f.is_recurring ? " [recorrente]" : ""}`).join("\n") || "Nenhum"}

LANÇAMENTOS FUTUROS VENCIDOS (NÃO PAGOS):
${pendingFuture.filter((f: any) => f.due_date < now.toISOString().split("T")[0]).slice(0, 10).map((f: any) => `${f.due_date}: R$ ${Number(f.amount).toFixed(2)} - ${f.description} ⚠️ VENCIDO`).join("\n") || "Nenhum"}

METAS FINANCEIRAS:
${goalsInfo || "Nenhuma meta definida"}

ÚLTIMAS TRANSAÇÕES:
${(transactions || []).slice(0, 25).map((t: any) => `${t.date}: ${t.type === "income" ? "+" : "-"}R$ ${Number(t.amount).toFixed(2)} - ${t.description} (${(t as any).categories?.name || "sem categoria"})${t.payment_method === "credit_card" ? " [CARTÃO]" : ""}`).join("\n")}

CATEGORIAS DISPONÍVEIS (id: nome):
${(categories || []).map((c: any) => `${c.id}: ${c.name} (${c.type})`).join("\n")}

REGRAS IMPORTANTES:
- Despesas no cartão de crédito NÃO impactam o saldo até o pagamento da fatura
- O impacto real no saldo ocorre quando o usuário paga a fatura do cartão
- Use a categoria mais adequada ao registrar transações
- Quando o usuário quiser registrar uma despesa via cartão de crédito, pergunte qual cartão se houver mais de um
- Contas futuras pagas são contabilizadas no mês em que foram efetivamente pagas

INSTRUÇÕES:
- Responda em português brasileiro, seja amigável e profissional
- Use markdown para formatar respostas
- Quando o usuário quiser registrar despesa/receita, use a ferramenta add_transaction
- Analise dados e dê conselhos personalizados baseados no contexto completo
- Alerte sobre contas vencidas, cartões próximos do limite, metas em risco
- Data de hoje: ${now.toISOString().split("T")[0]}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const tools = [{
      type: "function",
      function: {
        name: "add_transaction",
        description: "Registra uma nova transação financeira para o usuário",
        parameters: {
          type: "object",
          properties: {
            description: { type: "string", description: "Descrição da transação" },
            amount: { type: "number", description: "Valor em reais" },
            type: { type: "string", enum: ["income", "expense"], description: "Tipo" },
            date: { type: "string", description: "Data YYYY-MM-DD. Use hoje se não informado." },
            category_id: { type: "string", description: "ID da categoria mais adequada da lista" },
            payment_method: { type: "string", enum: ["pix", "credit_card", "debit_card", "cash", "transfer"], description: "Método de pagamento" },
            card_id: { type: "string", description: "ID do cartão de crédito, se payment_method for credit_card" },
          },
          required: ["description", "amount", "type"],
          additionalProperties: false,
        },
      },
    }];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        tools,
      }),
    });

    if (!aiRes.ok) {
      const s = aiRes.status;
      if (s === 429) return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (s === 402) return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errText = await aiRes.text();
      console.error("AI error:", s, errText);
      throw new Error(`AI gateway error: ${s}`);
    }

    const result = await aiRes.json();
    const choice = result.choices[0];
    let responseText = choice.message?.content || "";
    const actions: any[] = [];

    if (choice.message?.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        if (tc.function.name === "add_transaction") {
          const args = JSON.parse(tc.function.arguments);
          const { error } = await supabase.from("transactions").insert({
            user_id: user.id,
            description: args.description,
            amount: args.amount,
            type: args.type,
            date: args.date || now.toISOString().split("T")[0],
            category_id: args.category_id || null,
            payment_method: args.payment_method || null,
            card_id: args.card_id || null,
          });
          actions.push(error ? { type: "error", message: error.message } : { type: "transaction_added", data: args });
        }
      }

      const toolResults = choice.message.tool_calls.map((tc: any, i: number) => ({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(actions[i]?.type === "error" ? { success: false, error: actions[i].message } : { success: true, data: actions[i]?.data }),
      }));

      const followUp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "system", content: systemPrompt }, ...messages, choice.message, ...toolResults],
        }),
      });

      if (followUp.ok) {
        const fr = await followUp.json();
        responseText = fr.choices[0]?.message?.content || "Transação registrada com sucesso! ✅";
      }
    }

    return new Response(JSON.stringify({ message: responseText, actions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
