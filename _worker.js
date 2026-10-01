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
        const apiKey = env.OPENROUTER_API_KEY; // ใช้ Key จาก OpenRouter

        if (!apiKey) {
          return Response.json(
            { error: "ยังไม่ได้ตั้งค่า OPENROUTER_API_KEY ใน Cloudflare" },
            { status: 500, headers: corsHeaders }
          );
        }

        const promptText = `วิเคราะห์ภาพอาหารนี้แล้วตอบกลับในรูปแบบ JSON เท่านั้น โครงสร้างดังนี้:
{
  "calories": "xxx kcal",
  "protein": "xx g",
  "carbs": "xx g",
  "fat": "xx g",
  "details": "ระบุชื่อเมนูและสรุปโภชนาการสั้นๆ"
}`;

        // เรียกผ่าน OpenRouter (ใช้ Gemini 1.5 Flash ผ่านระบบที่เสถียรกว่า)
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "google/gemini-flash-1.5",
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
            ],
            response_format: { type: "json_object" }
          })
        });

        const resData = await response.json();

        if (response.ok && resData.choices?.[0]?.message?.content) {
          const rawText = resData.choices[0].message.content;
          const parsedData = JSON.parse(rawText);
          return Response.json({ data: parsedData }, { headers: corsHeaders });
        } else {
          return Response.json(
            { error: resData.error?.message || "เกิดข้อผิดพลาดในการวิเคราะห์" },
            { status: 400, headers: corsHeaders }
          );
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
