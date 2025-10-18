import type { APIRoute } from 'astro';

const STRAPI_URL = import.meta.env.STRAPI_API_URL;

export const POST: APIRoute = async ({ request }) => {
    try {
        const { roadmapDocumentId, type } = await request.json(); // type akan 'like' or 'dislike'
        console.log(roadmapDocumentId, type);


        if (!roadmapDocumentId || !type) {
            return new Response(JSON.stringify({ message: "ID Roadmap dan tipe rating dibutuhkan" }), { status: 400 });
        }

        const getResponse = await fetch(`${STRAPI_URL}/api/roadmaps/${roadmapDocumentId}`);
        if (!getResponse.ok) throw new Error("Roadmap tidak ditemukan");

        const { data } = await getResponse.json();
        console.log("Data from response:", data);
        
        let { likes, dislikes } = data;

        // const roadmapData = await getResponse.json();
        // console.log("Roadmap Data:", roadmapData);

        // let { likes, dislikes } = roadmapData;

        if (type === 'like') {
            likes++;
            console.log("Update like:", likes);
        } else if (type === 'dislike') {
            dislikes++;
            console.log("Update like:", dislikes);
        }

        const updateResponse = await fetch(`${STRAPI_URL}/api/roadmaps/${roadmapDocumentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: {
                    likes,
                    dislikes,
                },
            }),
        });

        if (!updateResponse.ok) throw new Error("Gagal memperbarui rating");

        console.log("Update Response: ", updateResponse);


        return new Response(JSON.stringify({ likes, dislikes }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Error rating:", error);
        return new Response(JSON.stringify({ message: "Internal Server Error" }), { status: 500 });
    }
};