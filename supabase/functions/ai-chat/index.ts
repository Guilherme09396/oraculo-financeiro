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
    const supabaseKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const [{ data: transactions }, { data: futureTransactions }, { data: categories }, { data: profile }] = await Promise.all([
      supabase.from("transactions").select("description, amount, type, date, categories(name)").order("date", { ascending: false }).limit(50),
      supabase.from("future_transactions").select("description, amount, type, due_date, status").order("due_date", { ascending: false }).limit(30),
      supabase.from("categories").select("id, name, type"),
      supabase.from("profiles").select("display_name").eq("user_id", user.id).single(),
    ]);

    const now = new Date();
    const ms = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const mt = (transactions || []).filter((t: any) => t.date >= ms);
    const inc = mt.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const exp = mt.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);

    const systemPrompt = `Você é o assistente financeiro inteligente do GranaIA. Nome do usuário: ${profile?.display_name || "Usuário"}.

CONTEXTO FINANCEIRO (MÊS ATUAL):
- Receitas: R$ ${inc.toFixed(2)}
- Despesas: R$ ${exp.toFixed(2)}
- Saldo: R$ ${(inc - exp).toFixed(2)}

ÚLTIMAS TRANSAÇÕES:
${(transactions || []).slice(0, 20).map((t: any) => `${t.date}: ${t.type === "income" ? "+" : "-"}R$ ${Number(t.amount).toFixed(2)} - ${t.description} (${(t as any).categories?.name || "sem categoria"})`).join("\n")}

PENDÊNCIAS FUTURAS:
${(futureTransactions || []).filter((f: any) => f.status === "pending").slice(0, 10).map((f: any) => `${f.due_date}: R$ ${Number(f.amount).toFixed(2)} - ${f.description}`).join("\n")}

CATEGORIAS (id: nome):
${(categories || []).map((c: any) => `${c.id}: ${c.name} (${c.type})`).join("\n")}

INSTRUÇÕES:
- Responda em português brasileiro, seja amigável e profissional
- Use markdown para formatar respostas
- Quando o usuário quiser registrar despesa/receita, use a ferramenta add_transaction
- Analise dados e dê conselhos personalizados
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
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        tools,
      }),
    });

    if (!aiRes.ok) {
      const s = aiRes.status;
      if (s === 429) return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (s === 402) return new Response(JSON.stringify({ error: "Créditos esgotados." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      console.error("AI error:", s, await aiRes.text());
      throw new Error("AI gateway error");
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
          });
          actions.push(error ? { type: "error", message: error.message } : { type: "transaction_added", data: args });
        }
      }

      const toolResults = choice.message.tool_calls.map((tc: any, i: number) => ({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(actions[i]?.type === "error" ? { success: false } : { success: true }),
      }));

      const followUp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "system", content: systemPrompt }, ...messages, choice.message, ...toolResults],
        }),
      });

      if (followUp.ok) {
        const fr = await followUp.json();
        responseText = fr.choices[0]?.message?.content || "Transação registrada!";
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
