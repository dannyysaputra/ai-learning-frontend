import type { APIRoute } from 'astro';
import OpenAI from 'openai';
import slugify from 'slugify';

const openai = new OpenAI({ apiKey: import.meta.env.OPENAI_API_KEY });
const STRAPI_URL = import.meta.env.STRAPI_API_URL;

export const POST: APIRoute = async ({ request }) => {
    try {
        const { topic } = await request.json();
        if (!topic) {
            return new Response(JSON.stringify({ message: "Topic is required" }), { status: 400 });
        }

        const prompt = `
      Anda adalah seorang ahli kurikulum dan instruktur berpengalaman.
      Tugas Anda adalah membuat sebuah roadmap belajar yang jelas untuk topik: "${topic}".
      
      Berikan respons HANYA dalam format JSON yang valid.
      
      Format JSON yang harus Anda ikuti:
      {
        "title": "Judul yang menarik dan relevan dengan topik",
        "description": "Deskripsi singkat (2-3 kalimat) tentang roadmap ini.",
        "category": "Satu kata kategori terbaik untuk topik ini (contoh: 'Programming', 'Cooking', 'Business', 'Art')",
        "steps": [
          {
            "title": "Judul untuk Langkah 1",
            "description": "Penjelasan singkat untuk langkah 1.",
            "resources": [
              { "title": "Judul Artikel/Video yang relevan", "url": "https://contoh.com/artikel1" },
              { "title": "Judul Video YouTube yang membantu", "url": "https://youtube.com/watch?v=contoh1" }
            ]
          },
          {
            "title": "Judul untuk Langkah 2",
            "description": "Penjelasan singkat untuk langkah 2.",
            "resources": [
              { "title": "Dokumentasi Resmi", "url": "https://contoh.com/docs" },
              { "title": "Tutorial Video Interaktif", "url": "https://youtube.com/watch?v=contoh2" }
            ]
          }
        ]
      }
      Pastikan ada antara 5-7 langkah dalam array 'steps'. Setiap langkah harus memiliki 1-2 resources.
    `;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
        });
        const aiResponse = completion.choices[0].message.content;
        if (!aiResponse) throw new Error("Respons dari AI kosong.");

        const roadmapData = JSON.parse(aiResponse);

        let categoryId;
        const categoryName = roadmapData.category;

        // Cari apakah kategori sudah ada
        const existingCategoryResponse = await fetch(`${STRAPI_URL}/api/categories?filters[name][$eqi]=${categoryName}`);
        const existingCategoryData = await existingCategoryResponse.json();

        if (existingCategoryData.data && existingCategoryData.data.length > 0) {
            categoryId = existingCategoryData.data[0].id;
        } else {
            // Jika tidak ada, buat kategori baru
            const newCategoryResponse = await fetch(`${STRAPI_URL}/api/categories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: { name: categoryName } }),
            });
            const newCategoryData = await newCategoryResponse.json();
            categoryId = newCategoryData.data.id;
        }

        const slug = slugify(roadmapData.title, { lower: true, strict: true });
        const dataToSave = {
            title: roadmapData.title,
            description: roadmapData.description,
            steps: roadmapData.steps, // Simpan sebagai JSON
            slug: slug,
            category: categoryId, // Hubungkan dengan ID kategori
        };

        const strapiResponse = await fetch(`${STRAPI_URL}/api/roadmaps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: dataToSave }),
        });

        if (!strapiResponse.ok) {
            const errorData = await strapiResponse.json();
            console.error("Strapi Error:", errorData.error);
            throw new Error(`Gagal menyimpan ke Strapi: ${strapiResponse.statusText}`);
        }

        return new Response(JSON.stringify({ slug }), { status: 200 });

    } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ message: "Internal Server Error" }), { status: 500 });
    }
};