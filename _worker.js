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
        const apiKey = env.GEMINI_API_KEY;

        if (!apiKey) {
          return Response.json(
            { error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Cloudflare Settings" },
            { status: 500, headers: corsHeaders }
          );
        }

        const promptText = `วิเคราะห์ภาพอาหารนี้แล้วตอบกลับในรูปแบบ JSON เท่านั้น โดยต้องมีโครงสร้างข้อมูลดังนี้:
{
  "calories": "xxx kcal",
  "protein": "xx g",
  "carbs": "xx g",
  "fat": "xx g",
  "details": "ระบุชื่อเมนูอาหาร สรุปโภชนาการ และคำแนะนำสุขภาพสั้นๆ เป็นภาษาไทย"
}`;

        // ลิสต์โมเดลที่เสถียรตามลำดับ
        const models = [
          "gemini-1.5-flash",
          "gemini-1.5-flash-8b",
          "gemini-1.5-pro"
        ];

        let finalData = null;
        let lastErrorMessage = "";

        // ฟังก์ชันช่วยสลีปเพื่อรอให้ Rate limit คลายตัว
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        // ลองวนลูปโมเดล และลองซ้ำแบบ Auto-Retry
        modelLoop: for (const model of models) {
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
              
              const response = await fetch(apiEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{
                    parts: [
                      { text: promptText },
                      {
                        inline_data: {
                          mime_type: body.mimeType || "image/jpeg",
                          data: body.image
                        }
                      }
                    ]
                  }],
                  generationConfig: {
                    temperature: 0.2,
                    response_mime_type: "application/json"
                  }
                })
              });

              const resData = await response.json();

              if (response.ok && !resData.error) {
                const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text || "";
                const jsonString = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
                
                try {
                  finalData = JSON.parse(jsonString);
                } catch(e) {
                  finalData = { calories: "-", protein: "-", carbs: "-", fat: "-", details: rawText };
                }
                break modelLoop; // สำเร็จแล้ว หลุดจากทุกลูปทันที
              } else {
                lastErrorMessage = resData.error?.message || "High Demand";
                // ถ้าติด High Demand หรือ Rate Limit ให้หยุดรอ 1.2 วินาทีแล้วลองซ้ำ
                if (response.status === 429 || lastErrorMessage.includes("demand")) {
                  await sleep(1200);
                } else {
                  break; // ถ้าเป็น Error อื่นให้เปลี่ยนโมเดลถัดไป
                }
              }
            } catch (err) {
              lastErrorMessage = err.message;
              await sleep(1000);
            }
          }
        }

        if (finalData) {
          return Response.json({ data: finalData }, { headers: corsHeaders });
        } else {
          return Response.json(
            { error: "ระบบ AI กำลังมีผู้ใช้งานหนาแน่น กรุณากดปุ่มวิเคราะห์อีกครั้งในอีก 2-3 วินาที" },
            { status: 503, headers: corsHeaders }
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
