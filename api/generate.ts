import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { DesignPlan, RoomDimensions, ColorPalette } from '../types';

export const config = {
    runtime: 'edge',
};

// Schemas copied from original geminiService.ts
const designPlanSchema = {
  type: Type.OBJECT,
  properties: {
    analysis: {
      type: Type.STRING,
      description: "A brief analysis of the current room's layout, lighting, and existing decor. If room dimensions were provided, mention how they influence the design.",
    },
    designRationale: {
      type: Type.STRING,
      description: "A brief explanation of why the proposed design elements (colors, furniture, etc.) work together to achieve the desired style, referencing core interior design principles like balance, harmony, and focal points.",
    },
    wallColor: {
      type: Type.OBJECT,
      description: "Recommendations for the primary wall color palette.",
      properties: {
        color: { type: Type.STRING, description: "The primary wall color suggestion (e.g., 'Soft Off-White')." },
        accent: { type: Type.STRING, description: "An accent wall color suggestion (e.g., 'Charcoal Gray')." },
      },
    },
    lighting: {
      type: Type.STRING,
      description: "Suggestions for lighting fixtures (e.g., 'A large, arched floor lamp and recessed ceiling lights').",
    },
    flooring: {
      type: Type.STRING,
      description: "Recommendations for flooring (e.g., 'Light oak hardwood floors or a large, neutral-toned area rug').",
    },
    furnitureSuggestions: {
      type: Type.ARRAY,
      description: "A list of 3-5 key furniture and decor items, appropriately scaled for the room size if provided.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "The name of the furniture or decor item (e.g., 'Plush Sectional Sofa')." },
          description: { type: Type.STRING, description: "A detailed description of the item's style, material, and color." },
          placement: { type: Type.STRING, description: "Where to place this item in the room." },
          estimatedPrice: { type: Type.NUMBER, description: "An estimated price for this item in USD." },
          modelUrl: { type: Type.STRING, description: "A publicly accessible URL to a 3D model of the furniture item, preferably in GLTF or OBJ format. Can be null if no model is found. If a real model URL cannot be found, provide a realistic placeholder URL like 'https://example.com/models/modern-sofa.gltf'." },
        },
      },
    },
    estimatedCost: {
        type: Type.OBJECT,
        description: "An estimated budget range for the entire makeover in USD.",
        properties: {
            min: { type: Type.NUMBER, description: "The minimum estimated cost in USD."},
            max: { type: Type.NUMBER, description: "The maximum estimated cost in USD."},
            currency: { type: Type.STRING, description: "The currency, e.g., 'USD'."}
        }
    },
    alternativePalettes: {
      type: Type.ARRAY,
      description: "A list of exactly 3 alternative color palettes that also fit the style. Each should have a primary and an accent color.",
      items: {
        type: Type.OBJECT,
        properties: {
          color: { type: Type.STRING, description: "The alternative primary wall color." },
          accent: { type: Type.STRING, description: "The alternative accent wall color." },
        },
      },
    },
  },
  required: ['analysis', 'designRationale', 'wallColor', 'lighting', 'flooring', 'furnitureSuggestions', 'estimatedCost', 'alternativePalettes'],
};

const morePalettesSchema = {
    type: Type.ARRAY,
    description: "A list of exactly 3 new and distinct color palettes. Each palette must have a primary and an accent color.",
    items: {
      type: Type.OBJECT,
      properties: {
        color: { type: Type.STRING, description: "The new primary wall color." },
        accent: { type: Type.STRING, description: "The new accent wall color." },
      },
       required: ['color', 'accent'],
    },
};

// Main handler
export default async function handler(request: Request) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        if (!process.env.API_KEY) {
            throw new Error("API_KEY environment variable is not set.");
        }
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const body = await request.json();
        const { action, payload } = body;

        switch (action) {
            case 'generateDesignIdeas': {
                const { base64Image, style, dimensions, roomType } = payload as { base64Image: string, style: string, dimensions: RoomDimensions, roomType: string };
                
                const imagePart = { inlineData: { mimeType: 'image/jpeg', data: base64Image } };

                let dimensionText = '';
                if (dimensions && dimensions.width && dimensions.length) {
                    const unitName = dimensions.unit === 'ft' ? 'feet' : 'meters';
                    dimensionText = ` The user has specified the room is approximately ${dimensions.width} ${unitName} wide by ${dimensions.length} ${unitName} long. Please ensure your furniture suggestions and layout advice are appropriately scaled for a room of this size and explicitly mention this in your analysis.`
                }

                const textPart = { text: `You are a world-class AI interior designer with a keen eye for detail and aesthetics. Analyze the provided room image, which is a ${roomType}, and generate a complete design makeover plan in a friendly and inspiring tone. The user wants a "${style}" style. Your recommendations must be appropriate for a ${roomType}. Your goal is to create a truly inspiring and practical makeover plan.
                ${dimensionText}
                Your tasks are:
                1. Briefly analyze the current room's strengths and weaknesses.
                2. Suggest a full makeover based on the selected style, keeping the provided dimensions in mind if available.
                3. Output specific ideas for a primary wall color palette, flooring, and lighting.
                4. Recommend 3-5 key furniture or decor items with detailed descriptions and placement suggestions. Ensure items are scaled correctly for the room. For each recommended item, you must also provide a \`modelUrl\`, which should be a publicly accessible URL to a 3D model of the item, preferably in GLTF or OBJ format. If a real model cannot be found, provide a realistic placeholder URL (e.g., 'https://models.example.com/modern_chair.gltf').
                5. Provide a realistic, estimated total budget range (min and max) for the complete makeover. Also, include an estimated price for each recommended furniture item. All monetary values should be in USD.
                6. Also provide exactly 3 alternative color palettes (primary and accent) that would offer a different mood while still fitting the requested style.
                7. Provide a 'Design Rationale' explaining why your suggestions create a cohesive and high-quality '${style}' design, touching on principles like balance, harmony, or focal points.

                Provide the output in JSON format according to the provided schema. Ensure the descriptions are vivid and helpful.` };

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: { parts: [imagePart, textPart] },
                    config: { responseMimeType: "application/json", responseSchema: designPlanSchema, temperature: 0.7 },
                });

                const parsedJson = JSON.parse(response.text.trim());
                return new Response(JSON.stringify(parsedJson), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }

            case 'generateRedesignedImage': {
                const { designPlan, style, roomType, base64Image, newColors } = payload as { designPlan: DesignPlan, style: string, roomType: string, base64Image: string, newColors?: ColorPalette };

                const imagePart = { inlineData: { mimeType: 'image/jpeg', data: base64Image } };
                // Simplified furniture list to be more concise for the image model.
                const furnitureList = designPlan.furnitureSuggestions.map(f => f.name).join(', ');
                const primaryColor = newColors?.color || designPlan.wallColor.color;
                const accentColor = newColors?.accent || designPlan.wallColor.accent;
                const isExterior = roomType.toLowerCase() === 'exterior';
  
                // Simplified and structured the prompt for better reliability with the image model.
                const textPrompt = isExterior
                    ? `Task: Redesign the exterior of this building.
Style: "${style}".
Instructions:
1. Keep the original building structure (architecture, windows, roof).
2. Change main surface color to "${primaryColor}".
3. Change trim and accent color to "${accentColor}".
4. Replace landscaping and any movable objects to fit the style. Include: ${furnitureList}.
5. Set lighting to be "${designPlan.lighting}".
Goal: A single, photorealistic image. No text.`
                    : `Task: Redesign the interior of this ${roomType}.
Style: "${style}".
Instructions:
1. Keep the original room structure (walls, windows, doors).
2. Change wall color to "${primaryColor}" (main) and "${accentColor}" (accent).
3. Change flooring to "${designPlan.flooring}".
4. Remove all old furniture.
5. Add new furniture: ${furnitureList}.
6. Set lighting to be "${designPlan.lighting}".
Goal: A single, photorealistic image. No text.`;


                const textPart = { text: textPrompt.trim() };

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image-preview',
                    contents: { parts: [imagePart, textPart] },
                    config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
                });

                const candidate = response.candidates?.[0];
                if (candidate?.content?.parts) {
                    for (const part of candidate.content.parts) {
                        if (part.inlineData && part.inlineData.data) {
                            return new Response(JSON.stringify({ imageBytes: part.inlineData.data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                        }
                    }
                }
                
                throw new Error("The AI did not return a redesigned image. The response was valid but contained no image data.");
            }

            case 'generateMorePalettes': {
                const { designPlan, style } = payload as { designPlan: DesignPlan, style: string };
                const existingPalettes = [designPlan.wallColor, ...designPlan.alternativePalettes].map(p => `- ${p.color} & ${p.accent}`).join('\n');
                const prompt = `You are an AI color consultant for an interior design app. Based on the following design analysis for a "${style}" themed room, please generate exactly 3 new and distinct color palettes. **Design Analysis:** ${designPlan.analysis} **Important:** The user has already seen the following palettes, so please provide completely different options that suggest different moods (e.g., one calming, one energetic, one sophisticated): ${existingPalettes} Return the output as a JSON array of objects, where each object has a 'color' and 'accent' property, according to the provided schema.`;

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: { parts: [{ text: prompt }] },
                    config: { responseMimeType: "application/json", responseSchema: morePalettesSchema, temperature: 0.8 },
                });
                
                const parsedJson = JSON.parse(response.text.trim());
                return new Response(JSON.stringify(parsedJson), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }

            default:
                return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
    } catch (error) {
        console.error('API Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        return new Response(JSON.stringify({ error: `Server error: ${errorMessage}` }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
