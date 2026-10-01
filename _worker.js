export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/analyze") {
      try {
        const body = await request.json();
        const apiKey = env.OPENROUTER_API_KEY || env.GEMINI_API_KEY;

        if (!apiKey) {
          return Response.json(
            { error: "ยังไม่ได้ตั้งค่า API Key ใน Cloudflare Settings" },
            { status: 500, headers: corsHeaders }
          );
        }

        const promptText = `วิเคราะห์ภาพอาหารนี้แล้วตอบกลับในรูปแบบ JSON เท่านั้น โครงสร้างดังนี้:
{
  "calories": "xxx kcal",
  "protein": "xx g",
  "carbs": "xx g",
  "fat": "xx g",
  "details": "ระบุชื่อเมนูและสรุปโภชนาการสั้นๆ เป็นภาษาไทย"
}`;

        // ใช้โมเดล Vision ที่เสถียรของ OpenRouter โดยตรง
        const openRouterModels = [
          "google/gemini-2.0-flash-exp:free",
          "google/gemini-flash-1.5-8b",
          "google/gemini-2.0-flash-lite-preview-02-05:free"
        ];

        let finalParsedData = null;
        let lastErrorMsg = "";

        for (const modelName of openRouterModels) {
          try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://food-calorie-ai.leonlevis47.workers.dev",
                "X-Title": "FoodLens AI"
              },
              body: JSON.stringify({
                model: modelName,
                messages: [
                  {
                    role: "user",
                    content: [
                      { type: "text", text: promptText },
                      {
                        type: "image_url",
                        image_url: {
                          url: `data:${body.mimeType || "image/jpeg"};base64,${body.image}`
                        }
                      }
                    ]
                  }
                ]
              })
            });

            const resData = await response.json();

            if (response.ok && resData.choices?.[0]?.message?.content) {
              const rawText = resData.choices[0].message.content;
              const jsonString = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
              try {
                finalParsedData = JSON.parse(jsonString);
              } catch (e) {
                finalParsedData = { calories: "-", protein: "-", carbs: "-", fat: "-", details: rawText };
              }
              break;
            } else {
              lastErrorMsg = resData.error?.message || "Model failed";
            }
          } catch (e) {
            lastErrorMsg = e.message;
          }
        }

        if (finalParsedData) {
          return Response.json({ data: finalParsedData }, { headers: corsHeaders });
        } else {
          return Response.json({ error: lastErrorMsg }, { status: 400, headers: corsHeaders });
        }

      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};
