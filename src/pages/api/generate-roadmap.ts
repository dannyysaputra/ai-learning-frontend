import type { APIRoute } from "astro";
import OpenAI from "openai";
import slugify from "slugify";

const openai = new OpenAI({
  apiKey: import.meta.env.OPENAI_API_KEY,
});

const STRAPI_URL = import.meta.env.STRAPI_API_URL;
const STRAPI_TOKEN = import.meta.env.STRAPI_API_TOKEN;

/**
 * Helper untuk fetch aman ke Strapi
 */
async function safeFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ Fetch failed (${res.status}): ${url}\n`, text);
    throw new Error(`HTTP ${res.status} - ${text}`);
  }
  return res.json();
}

/**
 * Endpoint utama untuk generate roadmap berdasarkan topik
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const { topic } = await request.json();
    if (!topic) {
      return new Response(JSON.stringify({ message: "Topic is required" }), {
        status: 400,
      });
    }

    // Prompt untuk OpenAI
    const prompt = `
      Anda adalah seorang ahli kurikulum dan instruktur berpengalaman.
      Buat roadmap pembelajaran untuk topik: "${topic}".
      Jawab HANYA dalam format JSON valid dengan struktur berikut:

      {
        "title": "Judul yang menarik dan relevan",
        "description": "Deskripsi singkat (2-3 kalimat)",
        "category": "Kategori singkat, misal 'Programming' atau 'Design'",
        "steps": [
          {
            "title": "Langkah 1",
            "description": "Penjelasan langkah 1",
            "resources": [
              { "title": "Judul Resource", "url": "https://contoh.com" }
            ]
          }
        ]
      }

      Pastikan ada 5-7 langkah dalam 'steps' dan setiap langkah memiliki 1-2 resources.
    `;

    // Generate dari OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const aiResponse = completion.choices[0].message.content;
    if (!aiResponse) throw new Error("Respons dari AI kosong.");

    const roadmapData = JSON.parse(aiResponse);

    // Validasi data dari AI
    if (!roadmapData.title || !roadmapData.steps) {
      throw new Error("Format JSON dari AI tidak lengkap.");
    }

    const categoryName = roadmapData.category.trim();
    let categoryId: number;

    // Cek apakah kategori sudah ada
    const existingCategoryUrl = `${STRAPI_URL}/api/categories?filters[name][$eqi]=${encodeURIComponent(categoryName)}`;
    const existingCategoryData = await safeFetch(existingCategoryUrl, {
      headers: {
        Authorization: `Bearer ${STRAPI_TOKEN}`,
      },
    });

    if (existingCategoryData.data?.length > 0) {
      categoryId = existingCategoryData.data[0].id;
      console.log(`Kategori ditemukan: ${categoryName} (id=${categoryId})`);
    } else {
      // Jika belum ada, buat kategori baru
      const newCategoryData = await safeFetch(`${STRAPI_URL}/api/categories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${STRAPI_TOKEN}`,
        },
        body: JSON.stringify({ data: { name: categoryName } }),
      });

      categoryId = newCategoryData.data.id;
      console.log(`🆕 Kategori baru dibuat: ${categoryName} (id=${categoryId})`);
    }

    // Siapkan data roadmap
    const slug = slugify(roadmapData.title, { lower: true, strict: true });
    const dataToSave = {
      title: roadmapData.title,
      description: roadmapData.description,
      steps: roadmapData.steps,
      slug,
      category: categoryId,
      likes: 0,
      dislikes: 0,
    };

    // Simpan ke Strapi
    const strapiSaveResponse = await fetch(`${STRAPI_URL}/api/roadmaps`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${STRAPI_TOKEN}`,
      },
      body: JSON.stringify({ data: dataToSave }),
    });

    // Validasi hasil simpan
    if (!strapiSaveResponse.ok) {
      const errorText = await strapiSaveResponse.text();
      console.error("Gagal menyimpan ke Strapi:", errorText);
      throw new Error(`Gagal menyimpan roadmap ke Strapi (${strapiSaveResponse.status})`);
    }

    const saved = await strapiSaveResponse.json();

    return new Response(
      JSON.stringify({
        message: "Roadmap berhasil dibuat",
        slug: saved.data.attributes.slug,
        id: saved.data.id,
      }),
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error generate-roadmap:", error.message || error);
    return new Response(
      JSON.stringify({ message: error.message || "Internal Server Error" }),
      { status: 500 }
    );
  }
};
