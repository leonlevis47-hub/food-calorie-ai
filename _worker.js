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

    // 1. API Endpoint สำหรับประมวลผลรูปภาพ (POST /analyze)
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
  "details": "บอกชื่อเมนูอาหาร สรุปโภชนาการ โซเดียม น้ำตาล และคำแนะนำด้านสุขภาพสั้นๆ เป็นภาษาไทย"
}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`, {
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
            }]
          })
        });

        const resData = await response.json();

        if (response.ok && !resData.error) {
          const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text || "";
          const jsonString = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
          let parsedData = {};
          try {
            parsedData = JSON.parse(jsonString);
          } catch(e) {
            parsedData = { calories: "-", protein: "-", carbs: "-", fat: "-", details: rawText };
          }

          return Response.json({ data: parsedData }, { headers: corsHeaders });
        } else {
          return Response.json(
            { error: resData.error ? resData.error.message : "เรียกใช้งาน Gemini API ไม่สำเร็จ" },
            { status: 400, headers: corsHeaders }
          );
        }

      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // 2. ถ้าดึงหน้าปกติ ให้ส่งต่อ Asset (index.html ใน public)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};
